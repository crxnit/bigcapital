#!/usr/bin/env bash
#
# Monthly Docker housekeeping for one bigcapital VPS env (sandbox or staging-bc).
#
# Installed at /srv/portal/clients/<env>/docker-prune.sh (mode 0750, root:root)
# and called monthly by cron (see deploy/bigcapital-*-docker-prune.cron).
#
# SCOPED ON PURPOSE — safe on a shared Docker daemon (the portal forward-auth
# stack and any co-tenant clients share it). It only removes THIS env's own
# exited containers and old/dangling bigcapital images. It NEVER runs a
# daemon-global `docker system prune -af`, NEVER touches named volumes, and
# NEVER removes an image backing a running container.
#
# Why a monthly job at all, given vps-deploy.sh already runs
# `docker image prune -af` before every pull: that per-deploy prune only fires
# on deploys and only reclaims images. This cron covers the gaps it leaves —
# exited one-shot containers (`*-database-migration` / `*-createbuckets` pile
# up on every `compose up`), dangling layers, and image buildup during a month
# with no deploys. Together they keep the containerd overlayfs snapshotter from
# accumulating the cruft behind the layer-extraction flake (docs/CI-CD.md).
#
# Exit codes: 0 OK, non-zero failure (cron logs to journald via the logger tag
# set in the cron file).

set -euo pipefail

ENV_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_NAME="$(basename "$ENV_DIR")"

# Map the on-host env dir to its container_name prefix (see the *-ghcr.yml
# compose files). staging-bc uses the "fork" prefix for historical reasons.
case "$ENV_NAME" in
  sandbox-bc) CONTAINER_PREFIX="bigcapital-sandbox-" ;;
  staging-bc) CONTAINER_PREFIX="bigcapital-fork-" ;;
  *) printf '[docker-prune] ERROR: unknown env dir %q (expected sandbox-bc or staging-bc)\n' "$ENV_NAME" >&2; exit 1 ;;
esac

# The only image repos this script will ever delete. Co-tenant images are never
# matched.
IMAGE_REFS=("ghcr.io/crxnit/bigcapital-server" "ghcr.io/crxnit/bigcapital-webapp")

# Keep images created within this window for fast local rollback; older unused
# bigcapital images are removed. Older images remain re-pullable from GHCR.
KEEP_HOURS="${KEEP_HOURS:-336}"   # 14 days

log() { printf '[docker-prune] %s\n' "$*"; }

log "env=$ENV_NAME container-prefix=$CONTAINER_PREFIX keep-hours=$KEEP_HOURS"

# --- 1. Remove THIS env's exited / created one-shot containers ---------------
#
# `*-database-migration` and `*-createbuckets` exit on every `compose up` and
# accumulate. Scope strictly by name prefix (anchored ^/) so co-tenant and
# other-env containers are never touched. Running containers don't match the
# exited/created status filters, so live services are safe.
mapfile -t stale_containers < <(
  docker ps -a \
    --filter "name=^/${CONTAINER_PREFIX}" \
    --filter "status=exited" \
    --filter "status=created" \
    --format '{{.ID}} {{.Names}}'
)
if ((${#stale_containers[@]})); then
  for row in "${stale_containers[@]}"; do
    id="${row%% *}"; name="${row#* }"
    if docker rm "$id" >/dev/null 2>&1; then
      log "  removed container $name"
    else
      log "  WARN could not remove container $name"
    fi
  done
else
  log "no stale ${CONTAINER_PREFIX}* containers"
fi

# --- 2. Remove old, unused bigcapital images --------------------------------
#
# Image IDs referenced by ANY container (running or stopped) are off-limits.
# Of the remaining bigcapital images, drop those older than the keep window.
in_use_ids="$(docker ps -aq | xargs -r docker inspect -f '{{.Image}}' 2>/dev/null | sort -u)"
cutoff="$(date -u -d "${KEEP_HOURS} hours ago" +%s)"

removed_images=0
for ref in "${IMAGE_REFS[@]}"; do
  while read -r id; do
    [[ -n "$id" ]] || continue
    grep -qxF "$id" <<<"$in_use_ids" && continue           # backs a container
    created="$(docker inspect -f '{{.Created}}' "$id" 2>/dev/null)" || continue
    created_epoch="$(date -u -d "$created" +%s 2>/dev/null)" || continue
    (( created_epoch < cutoff )) || continue               # still within window
    if docker rmi "$id" >/dev/null 2>&1; then
      removed_images=$((removed_images + 1))
    fi
  done < <(docker images "--filter=reference=${ref}" --no-trunc -q | sort -u)
done
log "removed $removed_images old image(s) (>${KEEP_HOURS}h, not in use)"

# --- 3. Dangling (untagged) image layers — globally safe --------------------
#
# Only untagged leftovers; never a tagged co-tenant image.
log "pruning dangling image layers…"
docker image prune -f 2>&1 | tail -1 || true

log "OK at $(date -u +%FT%TZ)"
docker system df 2>/dev/null | sed 's/^/[docker-prune] df: /' || true
