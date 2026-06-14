#!/usr/bin/env bash
#
# Backup script for the dedicated Sofi's Mini Donuts Bigcapital VPS.
# Adapted from deploy/vps-backup.sh (shared-host envs) for the standalone box.
#
# Install at /srv/portal/clients/sofis-bc/backup.sh (mode 0750, root:root); run nightly by
# cron (see bigcapital-sofis-backup.cron).
#
# Sources:
#   1. /srv/portal/clients/sofis-bc/.env                  — DB + S3 creds (the stack's .env)
#   2. /etc/restic/bigcapital-sofis.env      — RESTIC_REPOSITORY, RESTIC_PASSWORD,
#                                              and backend creds (e.g. AWS_*)
#                                              (template: restic.env.example)
#
# Per run, into a temp staging dir:
#   sql/<db>.sql   — mysqldump of the system DB + every tenant DB
#   minio/         — mirror of the attachments bucket
#   env.copy       — snapshot of .env (so a restore is self-describing)
# …then `restic backup` + retention `forget --prune`.
#
# RESTORE (test this before go-live!):
#   restic snapshots                                  # find a snapshot id
#   restic restore <id> --target /tmp/restore
#   # then: docker compose exec -T mysql mysql -u root -p"$DB_ROOT_PASSWORD" \
#   #         <db> < /tmp/restore/.../sql/<db>.sql
#   #       mc mirror /tmp/restore/.../minio  src/<bucket>
#
# Exit 0 OK, non-zero failure (cron forwards stdout/stderr to journald).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_DIR="$SCRIPT_DIR"
ENV_FILE="$ENV_DIR/.env"
COMPOSE_FILE="$ENV_DIR/docker-compose.yml"

ENV_NAME="sofis"
RESTIC_ENV="/etc/restic/bigcapital-sofis.env"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
STAGING="/tmp/bc-backup-${ENV_NAME}-${TS}"

log()  { printf '[backup] %s\n' "$*"; }
fail() { printf '[backup] ERROR: %s\n' "$*" >&2; exit 1; }

cleanup() { rm -rf "$STAGING" 2>/dev/null || true; }
trap cleanup EXIT

[[ -r "$ENV_FILE" ]]     || fail "env file not readable: $ENV_FILE"
[[ -r "$RESTIC_ENV" ]]   || fail "restic env not readable: $RESTIC_ENV"
[[ -f "$COMPOSE_FILE" ]] || fail "compose file not found: $COMPOSE_FILE"

# Load the app env (DB creds, S3 keys). This is a docker `env_file`, NOT a shell
# script: the whole RHS is the literal value (no quoting/escaping), so values may
# legitimately contain spaces, `#`, or apostrophes (e.g. MAIL_FROM_NAME="Sofi's
# Mini Donuts Books"). `source`-ing it as bash breaks on those — parse KEY=VALUE
# literally and export, matching docker's semantics.
while IFS='=' read -r _k _v; do
  [[ "$_k" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
  export "$_k=$_v"
done < <(grep -vE '^[[:space:]]*(#|$)' "$ENV_FILE")

# The restic backend env IS a real shell file (`export VAR="..."`) — source it.
set -a
# shellcheck disable=SC1090
source "$RESTIC_ENV"
set +a

: "${DB_ROOT_PASSWORD:?missing DB_ROOT_PASSWORD in .env}"
: "${SYSTEM_DB_NAME:?missing SYSTEM_DB_NAME in .env}"
: "${TENANT_DB_NAME_PERFIX:?missing TENANT_DB_NAME_PERFIX in .env}"
: "${S3_BUCKET:?missing S3_BUCKET in .env}"
: "${RESTIC_REPOSITORY:?missing RESTIC_REPOSITORY in restic env}"
: "${RESTIC_PASSWORD:?missing RESTIC_PASSWORD in restic env}"

mkdir -p "$STAGING/sql" "$STAGING/minio"
log "Staging dir: $STAGING"

# Initialize the restic repo on first run (idempotent: only inits if the repo
# isn't reachable / not yet created).
if ! restic snapshots >/dev/null 2>&1; then
  log "restic repo not initialized — running restic init"
  restic init
fi

# --- MySQL / MariaDB dumps --------------------------------------------------
# `mariadb:10.2` only ships the legacy mysqldump binary (no mariadb-dump).
MYSQL_EXEC=(docker compose -f "$COMPOSE_FILE" exec -T mysql)

log "Enumerating databases…"
DB_LIST="$("${MYSQL_EXEC[@]}" mysql -u root -p"${DB_ROOT_PASSWORD}" \
            -B -N -e "SHOW DATABASES" < /dev/null 2>/dev/null \
          | grep -E "^(${SYSTEM_DB_NAME}|${TENANT_DB_NAME_PERFIX}.*)$" || true)"
[[ -n "$DB_LIST" ]] || fail "no databases matched system='${SYSTEM_DB_NAME}' or tenant prefix='${TENANT_DB_NAME_PERFIX}'"

# `< /dev/null` on each exec stops `docker compose exec -T` from eating the
# loop's here-string stdin (otherwise only the first DB dumps).
while read -r DB; do
  [[ -n "$DB" ]] || continue
  log "  mysqldump → $DB"
  "${MYSQL_EXEC[@]}" mysqldump -u root -p"${DB_ROOT_PASSWORD}" \
       --single-transaction --quick --routines --triggers --events \
       "$DB" < /dev/null > "$STAGING/sql/${DB}.sql"
  # Fail loudly on an empty dump (caught swallowed errors before).
  [[ -s "$STAGING/sql/${DB}.sql" ]] || fail "empty dump for $DB — aborting"
done <<< "$DB_LIST"

# --- MinIO mirror -----------------------------------------------------------
# Transient mc container joined to MinIO's actual (project-prefixed) network.
MINIO_CID="$(docker compose -f "$COMPOSE_FILE" ps -q minio)"
[[ -n "$MINIO_CID" ]] || fail "could not resolve MinIO container id"

MINIO_CONTAINER="$(docker inspect "$MINIO_CID" --format '{{.Name}}' | sed 's|^/||')"
[[ -n "$MINIO_CONTAINER" ]] || fail "could not resolve MinIO container name"

NET="$(docker inspect "$MINIO_CID" \
       --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' \
       | awk '{print $1}')"
[[ -n "$NET" ]] || fail "could not resolve docker network name from MinIO container"

log "Mirroring MinIO bucket '${S3_BUCKET}' from ${MINIO_CONTAINER}…"
docker run --rm \
  --network "$NET" \
  -v "$STAGING/minio:/backup" \
  -e "MC_HOST_src=http://${S3_ACCESS_KEY_ID}:${S3_SECRET_ACCESS_KEY}@${MINIO_CONTAINER}:9000" \
  minio/mc:latest mirror --overwrite "src/${S3_BUCKET}" /backup >/dev/null

# --- .env snapshot ----------------------------------------------------------
cp "$ENV_FILE" "$STAGING/env.copy"
chmod 0600 "$STAGING/env.copy"

# --- restic backup + retention ----------------------------------------------
log "restic backup…"
restic backup --tag "env:${ENV_NAME}" --tag "ts:${TS}" "$STAGING"

# Longer retention than the shared-host envs — these are a client's financial
# records (7 daily, 4 weekly, 12 monthly, 3 yearly).
log "restic forget --prune (7d/4w/12m/3y)…"
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --keep-yearly 3 --prune

log "OK at $(date -u +%FT%TZ)"
