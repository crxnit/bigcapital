#!/usr/bin/env bash
#
# VPS-side deploy script for the Sofi's Mini Donuts (single-client PRODUCTION)
# instance. Triggered by the one-click "promote" path in
# .github/workflows/deploy.yml (workflow_dispatch, environment=sofis).
#
# Installed at /srv/portal/clients/sofis-bc/deploy.sh (mode 0750, root:root).
# The deploy SSH key is locked to running ONLY this script:
#   command="sudo /srv/portal/clients/sofis-bc/deploy.sh",no-port-forwarding,...
# in authorized_keys + a NOPASSWD sudoers rule for exactly this path. So the
# script runs as root -> `docker` works directly (the box's john user is NOT in
# the docker group; everything here would otherwise need `sudo docker`).
#
# Arguments arrive via $SSH_ORIGINAL_COMMAND; the regex below is the ENTIRE
# allowlist. Anything that isn't two 7-40 hex SHAs separated by one space is
# rejected before any docker work.
#   Expected: "<server-sha> <webapp-sha>"   (the promote job passes the same sha twice)
#
# DIFFERENCES vs the shared deploy/vps-deploy.sh (sandbox/UAT):
#   - Pins images in the stack .env (SERVER_IMAGE=/WEBAPP_IMAGE=), NOT by sed-ing
#     hardcoded `image:` lines — Sofi's compose reads ${SERVER_IMAGE}/${WEBAPP_IMAGE}.
#   - Takes a pre-migration mysqldump of ALL databases first (this is LIVE client
#     data; sandbox/UAT skip this). A failed dump aborts before anything changes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
ENV_FILE="$SCRIPT_DIR/.env"
BACKUP_DIR="$SCRIPT_DIR/pre-deploy-backups"
SERVER_IMAGE_BASE="ghcr.io/crxnit/bigcapital-server"
WEBAPP_IMAGE_BASE="ghcr.io/crxnit/bigcapital-webapp"
KEEP_DUMPS=5

log()  { printf '[deploy] %s\n' "$*"; }
fail() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

# --- Parse and validate SHAs from SSH_ORIGINAL_COMMAND ----------------------

RAW="${SSH_ORIGINAL_COMMAND:-}"
[[ -n "$RAW" ]] || fail "Invalid or missing image tag — SSH_ORIGINAL_COMMAND empty"
if [[ ! "$RAW" =~ ^([a-f0-9]{7,40})[[:space:]]+([a-f0-9]{7,40})$ ]]; then
  fail "Invalid or missing image tag — expected '<server-sha> <webapp-sha>', got: $RAW"
fi
SERVER_SHA="${BASH_REMATCH[1]}"
WEBAPP_SHA="${BASH_REMATCH[2]}"

log "Deploying server sha-$SERVER_SHA + webapp sha-$WEBAPP_SHA"

cd "$SCRIPT_DIR"
[[ -f "$COMPOSE_FILE" ]] || fail "compose file not found: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]]     || fail "env file not found: $ENV_FILE"

# --- Pre-migration safety dump ----------------------------------------------
#
# Migrations run forward only; a bad one on live client data has no automatic
# undo. Snapshot ALL databases BEFORE pulling/migrating so a failed deploy can
# be restored. The mysql container is mariadb:10.2 -> legacy `mysqldump` only.
# Read the root password literally (never `source` the env_file: MAIL_FROM_NAME
# carries an apostrophe that aborts a shell source — see CLAUDE.md).

DB_ROOT_PASSWORD="$(grep -E '^DB_ROOT_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
[[ -n "$DB_ROOT_PASSWORD" ]] || fail "DB_ROOT_PASSWORD not found in $ENV_FILE"

MYSQL_CID="$(docker compose -f "$COMPOSE_FILE" ps -q mysql)"
[[ -n "$MYSQL_CID" ]] || fail "mysql container not running — refusing to deploy without a backup"

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="$BACKUP_DIR/pre-deploy-$STAMP.sql.gz"
log "Dumping all databases -> $DUMP"
if ! docker exec -i "$MYSQL_CID" \
      mysqldump -uroot -p"$DB_ROOT_PASSWORD" \
      --all-databases --single-transaction --quick --routines --events 2>/dev/null \
      | gzip > "$DUMP"; then
  rm -f "$DUMP"
  fail "Pre-deploy mysqldump failed — aborting before any change"
fi
# Guard against a silent empty/partial dump.
[[ "$(stat -c%s "$DUMP" 2>/dev/null || echo 0)" -gt 1000 ]] \
  || fail "Pre-deploy dump suspiciously small ($DUMP) — aborting"
log "Pre-deploy dump OK ($(du -h "$DUMP" | cut -f1))"
# Retain only the most recent $KEEP_DUMPS dumps.
ls -1t "$BACKUP_DIR"/pre-deploy-*.sql.gz 2>/dev/null | tail -n +$((KEEP_DUMPS + 1)) | xargs -r rm -f

# --- Pin image tags in .env -------------------------------------------------

cp "$ENV_FILE" "$ENV_FILE.bak"
sed -i -E \
  -e "s|^SERVER_IMAGE=.*$|SERVER_IMAGE=${SERVER_IMAGE_BASE}:sha-${SERVER_SHA}|" \
  -e "s|^WEBAPP_IMAGE=.*$|WEBAPP_IMAGE=${WEBAPP_IMAGE_BASE}:sha-${WEBAPP_SHA}|" \
  "$ENV_FILE"
grep -q "^SERVER_IMAGE=${SERVER_IMAGE_BASE}:sha-${SERVER_SHA}$" "$ENV_FILE" \
  || fail "env sed did not set SERVER_IMAGE (is the SERVER_IMAGE= line present in .env?)"
grep -q "^WEBAPP_IMAGE=${WEBAPP_IMAGE_BASE}:sha-${WEBAPP_SHA}$" "$ENV_FILE" \
  || fail "env sed did not set WEBAPP_IMAGE (is the WEBAPP_IMAGE= line present in .env?)"
log "Image tags pinned in $ENV_FILE"

# --- Free disk, then pull ---------------------------------------------------
log "Pruning unused images to free disk…"
docker image prune -af 2>&1 | tail -3 || true

log "Pulling images from GHCR…"
docker compose -f "$COMPOSE_FILE" pull server webapp database_migration

# --- Run migrations (one-shot; block on exit code) --------------------------
log "Running system + tenant migrations…"
docker compose -f "$COMPOSE_FILE" up -d --force-recreate database_migration
MIGRATION_CID="$(docker compose -f "$COMPOSE_FILE" ps -q database_migration)"
[[ -n "$MIGRATION_CID" ]] || fail "could not resolve database_migration container id"
MIGRATION_EXIT="$(docker wait "$MIGRATION_CID")"
if [[ "$MIGRATION_EXIT" != "0" ]]; then
  log "Migration exited $MIGRATION_EXIT — logs follow:"
  docker logs --tail 200 "$MIGRATION_CID" || true
  fail "Migration failed; server/webapp NOT restarted. Old containers still serving. Restore from $DUMP if needed."
fi
log "Migrations OK"

# --- Recreate server + webapp on new images ---------------------------------
log "Recreating server + webapp on new images…"
docker compose -f "$COMPOSE_FILE" up -d server webapp

# --- Smoke test via the server image's built-in HEALTHCHECK -----------------
SERVER_CID="$(docker compose -f "$COMPOSE_FILE" ps -q server)"
[[ -n "$SERVER_CID" ]] || fail "could not resolve server container id"

log "Waiting for server health…"
STATUS=unknown
for i in $(seq 1 30); do
  STATUS="$(docker inspect --format='{{.State.Health.Status}}' "$SERVER_CID" 2>/dev/null || echo unknown)"
  case "$STATUS" in
    healthy)
      log "Server healthy after ${i}x 2s"
      log "OK at $(date -u +%FT%TZ) — server sha-$SERVER_SHA / webapp sha-$WEBAPP_SHA"
      exit 0
      ;;
    unhealthy)
      log "Server unhealthy — logs follow:"
      docker logs --tail 200 "$SERVER_CID" || true
      fail "Health check reported unhealthy. Restore from $DUMP if migrations changed schema."
      ;;
  esac
  sleep 2
done

log "Server did not reach healthy in 60s (last: $STATUS) — logs follow:"
docker logs --tail 200 "$SERVER_CID" || true
fail "Health check timed out. Restore from $DUMP if migrations changed schema."
