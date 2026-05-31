# CI/CD operator runbook

This document is the operational counterpart to `docs/DEPLOY.md`. `DEPLOY.md` covers the legacy manual tarball deploy (still active until cutover); this file covers the GHCR push-to-deploy pipeline that replaces it.

## Pipeline at a glance

```
git push origin develop
   ↓
.githooks/pre-push (local)        typecheck + server unit tests
   ↓
.github/workflows/deploy.yml      matrix build (server + webapp) → GHCR
   ↓                              Trivy HIGH/CRITICAL scan (warn-only, see below)
GHCR                              ghcr.io/crxnit/bigcapital-{server,webapp}:sha-<short>
   ↓                              + :latest mirror
deploy job (environment: sandbox) ssh deploy@vps "<server-sha> <webapp-sha>"
   ↓
sudo /srv/portal/clients/<env>/deploy.sh
   ├ regex-validates SHAs
   ├ seds compose image tags
   ├ docker compose pull
   ├ docker compose up -d --force-recreate database_migration   (wait exit 0)
   ├ docker compose up -d server webapp
   └ poll docker healthcheck status until "healthy" (timeout 60s)
```

Total wall-clock: 8–10 min (arm64 QEMU builds dominate).

## Triggers

- **Push to `develop`**: deploys **sandbox then UAT in sequence**. `deploy-uat` job has `needs: [build-and-scan, deploy-sandbox]` and is gated on `deploy-sandbox.result == 'success'` for push events — sandbox's `/api/health` smoke gate is therefore the UAT safety net. `paths-ignore: docs/**, **/*.md, archive/**` still applies, so docs-only pushes deploy nothing.
- **Manual single-env dispatch**: `gh workflow run deploy.yml -f environment={sandbox|uat}` re-deploys one env without a new commit (e.g. after a `.env` change). The non-target deploy job is skipped via `if:` clause; the UAT job uses `if: always()` to evaluate downstream of a skipped sandbox upstream.
- **Production**: not yet wired (see `docs/FUTURE-ENHANCEMENTS.md`).

Concurrency: job-level per environment (`deploy-sandbox` / `deploy-uat` groups). A push run now exercises both jobs but each env's queue is independent — a parallel manual dispatch on one env doesn't block a push run on the other. No cancel-in-progress on either, so we never interrupt a half-done `docker compose pull`.

## Secrets

Stored at the GitHub **Environment** level (`sandbox`, `uat`), not the repo level — that way the same workflow targets different VPSes with different keys.

| Secret            | Value                                             |
| ----------------- | ------------------------------------------------- |
| `VPS_HOST`        | `<user>@<host>`                                   |
| `VPS_PORT`        | SSH port (non-22)                                 |
| `VPS_SSH_KEY`     | ed25519 private key (full contents incl. headers) |
| `VPS_KNOWN_HOSTS` | output of `ssh-keyscan -p <port> <host>`          |

Repo-level: none required for deploy. The Trivy + GHCR push use the default `GITHUB_TOKEN` (workflow permissions: `packages: write`).

VPS-side: a Classic PAT with `read:packages` only, used by `sudo docker login ghcr.io` (Phase 3 of plan). Lives in `/root/.docker/config.json`. 1-year expiration; rotate via calendar reminder.

Restic credentials: `/etc/restic/bigcapital-<env>.env` (mode 0600 root:root). Contains `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `RESTIC_REPOSITORY`, `RESTIC_PASSWORD`. **The RESTIC_PASSWORD is not recoverable** — losing it means losing all backups. Save to password manager during setup.

## SSH lockdown

The deploy key on the VPS is restricted to running ONE command:

```
command="sudo /srv/portal/clients/<env>/deploy.sh",restrict <pubkey> github-actions-…
```

Combined with a NOPASSWD sudoers rule that forwards `SSH_ORIGINAL_COMMAND` (env_keep += "SSH_ORIGINAL_COMMAND"), the key can ONLY run `deploy.sh` with arguments that pass the script's `^[a-f0-9]{7,40} [a-f0-9]{7,40}$` regex. Anything else — `bash`, `scp`, `rsync`, `;`, `&&`, even just running `deploy.sh` without args — is refused.

**Verify lockdown** (laptop):

```bash
ssh -p <port> -i ~/.ssh/bigcapital-<env>-deploy \
    -o IdentitiesOnly=yes -o IdentityAgent=none \
    <user>@<host>
# Expected: "[deploy] ERROR: Invalid or missing image tag …"  → connection closes.
# NO shell, NO prompt.

ssh -p <port> -i ~/.ssh/bigcapital-<env>-deploy \
    -o IdentitiesOnly=yes -o IdentityAgent=none \
    <user>@<host> 'rm -rf /'
# Same error — injection is rejected before any docker work.
```

The `-o IdentitiesOnly=yes -o IdentityAgent=none` flags are **critical** — without them ssh-agent's other keys get tried first and you'll see a shell that looks like the lockdown failed.

## Cutover from tarball to GHCR (one-time, per environment)

The new `deploy/docker-compose.*-ghcr.yml` files use the same container names, volume names, and networks as the existing compose. The cutover step is identical for sandbox and UAT:

```bash
# On VPS, as the deploy user, with the env dir as cwd
sudo docker compose -f docker-compose.yml down            # old (local images)
sudo docker compose -f docker-compose.ghcr.yml up -d      # new (GHCR images)
```

Volumes (`bigcapital_*_mysql`, `_redis`, `_minio`) persist across this swap — data is not touched. The OLD compose file is left in place as a rollback path; if the new flow misbehaves, `docker compose -f docker-compose.ghcr.yml down && docker compose -f docker-compose.yml up -d` returns to the tarball image.

After cutover succeeds on sandbox, replace the path on the VPS:

```bash
# Move the new compose file to the canonical filename so deploy.sh finds it
sudo mv /srv/portal/clients/sandbox-bc/docker-compose.ghcr.yml \
        /srv/portal/clients/sandbox-bc/docker-compose.ghcr.yml.bak  # keep
# (or just leave docker-compose.ghcr.yml in place — deploy.sh references it directly)
```

`deploy.sh` looks for `docker-compose.ghcr.yml` in its own directory. The legacy `docker-compose.yml` can stay alongside untouched.

## Rollback

Three patterns, in order of preference:

1. **Re-run a previous deploy** (no code change required). On the VPS:

   ```bash
   sudo SSH_ORIGINAL_COMMAND="<old-server-sha> <old-webapp-sha>" \
        /srv/portal/clients/sandbox-bc/deploy.sh
   ```

   The SHA must still exist in GHCR (default retention: indefinite for tagged images).

2. **Revert the commit and push**: `git revert <bad-sha> && git push origin develop` — fastest if the bad commit is recent.

3. **Fall back to tarball**: `docker compose -f docker-compose.ghcr.yml down && docker compose -f docker-compose.yml up -d` returns to the last manually-shipped tarball image. Old image must still be present in the local Docker daemon (`docker image ls | grep bigcapital-fork-`).

## Common failures

### Migration container exits non-zero

`deploy.sh` aborts before bringing up `server` or `webapp` — old containers keep serving traffic. Logs are dumped to the deploy step output.

Frequent cause: a stuck `knex_migrations_lock` from a previous crashed migration. Recover by running the documented unlock per affected tenant DB:

```sql
UPDATE knex_migrations_lock SET is_locked = 0;
```

(per `.claude/CLAUDE.md` gotcha). Then re-trigger the deploy.

### Trivy CVE findings (currently warn-only)

The scan runs on every build (`severity: HIGH,CRITICAL`, `ignore-unfixed: true`) but `exit-code` is `0` — findings surface in the job log without blocking deploys. The webapp image is **clean (0 findings)**; all findings are in the **server** image.

**devDependency-leak cleanup — DONE 2026-05-31** (commit pending). The server prod image was shipping the full devDependency tree. Two root causes, both fixed:

1. The Dockerfile's `pnpm add -D -w husky … pnpm install --prod … pnpm remove -w husky` dance — the trailing `pnpm remove` re-ran the installer in default (dev+prod) mode and re-hydrated EVERY devDependency. Replaced with: strip the root `prepare: husky install` script (so a clean `--prod` install doesn't fail on missing husky), then a single `pnpm install --prod --frozen-lockfile`.
2. Build/test tooling miscategorized under `dependencies` (not `devDependencies`) in three manifests, so `--prod` correctly kept them: `vitest`/`vite-plugin-dts` (`shared/email-components`), `webpack`+6 loaders/plugins (`shared/pdf-templates`), and `tsup` (root — its sole prod dep; pulled `esbuild`). All moved to `devDependencies`.

Result: server HIGH/CRITICAL **155 → 113** (CRITICAL 7 → 3), image **1.88 GB → 1.19 GB**. Removed the `vitest`/`esbuild` CRITICALs (test-tooling RCEs) entirely. Lockfile updated by hand-editing only the `importers:` dev/prod categorization (resolved package set verified byte-identical — no reserialization churn).

**Still TODO before tightening to `exit-code: '1'`** (the residual 113 / 53 distinct CVEs is genuine prod-dep debt):

- 2 same-major CRITICALs fixable via pnpm `overrides`: `form-data` 4.0.0 → 4.0.4 (CVE-2025-7783), `fast-xml-parser` 4.2.5 → 4.5.4 (CVE-2026-25896). Note: adding `overrides` forces a `pnpm install`, which reserializes the whole lockfile (~32k cosmetic lines; resolved set unchanged) — do the override pass + gate-flip together so that churn lands once.
- `@casl/ability` 5.4.4 → 6.x (CRITICAL CVE-2026-1774). **Major** — test permission-check sites carefully; or `.trivyignore` with expiry until done.
- Bulk HIGH transitive debt (`axios`×5 via firebase-admin/plaid, `multer` 1→2, `tar` 6→7, `minimatch`×6, …) — mostly cross-major bumps that risk breaking the SDKs/NestJS pinning them. `.trivyignore` with expiry, or bump the owning SDKs.
- Then flip `exit-code: "1"` in `deploy.yml`.

When triaging a fresh finding:

- **Patchable upstream?** Bump the dep, push.
- **Transitive + no fix yet?** Add a CVE-specific entry to `.trivyignore` with a why + expiry date comment.
- **In Alpine OS layer (busybox, libcrypto3, etc.)?** Both Dockerfiles already run `apk upgrade --no-cache` in the runtime stage to pull latest stable-branch patches — usually a fresh build fixes it. If not, the apk repo hasn't caught up; allowlist with a short expiry.

### GHCR pull fails on VPS

If you see `unauthorized: authentication required` during `docker compose pull`:

```bash
sudo docker login ghcr.io  # PAT with read:packages
```

PAT lifetime is 1 year; rotate before expiry.

### Smoke test times out

`deploy.sh` polls Docker's HEALTHCHECK status. If the server starts but never reports healthy:

- Check the server's healthcheck logs: `docker inspect bigcapital-sandbox-server | jq '.[0].State.Health'`
- Confirm `/api/health` actually responds: `docker exec bigcapital-sandbox-server wget -qO- localhost:3000/api/health`
- If the route returns 404, `HealthModule` isn't wired into `App.module.ts`.
- If it returns 401/403, `@PublicRoute()` is missing or the global guards are intercepting.

`deploy.sh` leaves the new containers running on smoke-test failure. Roll back manually if symptoms warrant.

### Containerd layer-extraction flake on image pull

Symptom: deploy step "Trigger remote deploy" fails partway through `docker compose pull` with

```
failed to extract layer (...): link /var/lib/containerd/io.containerd.snapshotter.v1.overlayfs/snapshots/<N>/fs/app/node_modules/.pnpm/<pkg-A>/.../some.js /var/lib/.../snapshots/<N>/fs/app/node_modules/.pnpm/<pkg-B>/.../other.js: no such file or directory
```

The build itself succeeded — image is pushed to GHCR. The failure is the VPS-side extraction into the containerd overlayfs snapshotter, almost always a stale/half-extracted snapshot from a prior partial pull (we've seen it bite both sandbox and UAT after rapid back-to-back deploys). Retrying the workflow usually works because the next pull builds a fresh snapshot id. Hit it ≥2× on the same env, do a one-time cleanup on the VPS:

```bash
# stop the affected stack first if needed
docker system prune -af --volumes=false        # safe — keeps named volumes
# if it persists, the nuclear option (frees disk; next pull is a full pull):
sudo systemctl stop docker
sudo rm -rf /var/lib/containerd/io.containerd.snapshotter.v1.overlayfs/snapshots
sudo systemctl start docker
```

Don't `prune --volumes` — that would delete the MariaDB and MinIO data.

#### Monthly housekeeping cron (wired 2026-05-31)

`vps-deploy.sh` already runs a daemon-global `docker image prune -af` before every pull, so images are reclaimed on every deploy. The monthly cron covers the gaps that per-deploy pruning leaves: exited one-shot containers (`*-database-migration` / `*-createbuckets` accumulate on every `compose up`), dangling layers, and image buildup during a month with no deploys.

The cron job is deliberately **scoped, not** a daemon-global `system prune -af` — it is safe on a shared daemon (the portal forward-auth stack + any co-tenant clients). It only removes the env's own exited containers (matched by `container_name` prefix) and bigcapital images older than 14 days that back no container; it never touches volumes, co-tenant images, or running services.

- Script: `deploy/vps-docker-prune.sh` → install at `/srv/portal/clients/<env>/docker-prune.sh` (mode 0750, root:root).
- Crons: `deploy/bigcapital-{sandbox,uat}-docker-prune.cron` → `/etc/cron.d/` (mode 0644, root:root). Monthly on the 1st at 04:30 UTC (sandbox) / 04:50 UTC (staging-bc), after the nightly backups.

Install (run on each VPS, per env dir — `sandbox-bc` / `staging-bc`):

```bash
sudo install -m 0750 -o root -g root deploy/vps-docker-prune.sh /srv/portal/clients/sandbox-bc/docker-prune.sh
sudo install -m 0644 -o root -g root deploy/bigcapital-sandbox-docker-prune.cron /etc/cron.d/bigcapital-sandbox-docker-prune
# staging-bc:
sudo install -m 0750 -o root -g root deploy/vps-docker-prune.sh /srv/portal/clients/staging-bc/docker-prune.sh
sudo install -m 0644 -o root -g root deploy/bigcapital-uat-docker-prune.cron /etc/cron.d/bigcapital-uat-docker-prune
```

Verify a manual run (safe to invoke any time — it never stops running services):

```bash
sudo /srv/portal/clients/sandbox-bc/docker-prune.sh   # ends with `[docker-prune] OK at <ISO>`
sudo journalctl -t bc-sandbox-docker-prune | tail -30  # after the cron has fired (or `bc-uat-docker-prune`)
```

The keep window is overridable: `KEEP_HOURS=720 sudo .../docker-prune.sh` to retain 30 days of rollback images.

## Backups

Runs nightly at 03:17 UTC (sandbox) / 03:47 UTC (UAT) — cron files in `deploy/bigcapital-*-backup.cron`. Each run:

1. `mysqldump` the system DB and every tenant DB (matched by `TENANT_DB_NAME_PERFIX`).
2. `minio/mc mirror` the attachments bucket via a transient container joined to the bigcapital network.
3. Copy `.env` into the staging dir.
4. `restic backup` the staging dir to S3.
5. `restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune`.

Verify a run: `sudo journalctl -t bc-sandbox-backup | tail -50` (or `bc-uat-backup` for UAT). The successful run ends with `[backup] OK at <ISO timestamp>`.

### Restore drill (run quarterly)

```bash
sudo bash -c 'set -a; source /etc/restic/bigcapital-sandbox.env; restic snapshots' | tail -5
sudo bash -c 'set -a; source /etc/restic/bigcapital-sandbox.env; restic restore latest --target /tmp/restore-test'
ls /tmp/restore-test/tmp/bc-backup-*/sql/   # should list system + tenant SQL files
ls /tmp/restore-test/tmp/bc-backup-*/minio/ # should list attachment objects
sudo rm -rf /tmp/restore-test
```

If `sql/` or `minio/` is empty, the backup is broken — debug the script before relying on it.

### Restoring a tenant DB from a snapshot

```bash
# Identify the snapshot
sudo bash -c 'set -a; source /etc/restic/bigcapital-sandbox.env; restic snapshots'

# Restore to a temp dir
sudo bash -c 'set -a; source /etc/restic/bigcapital-sandbox.env; restic restore <snapshot-id> --target /tmp/r'

# Load the dump into the live mysql container
docker compose -f /srv/portal/clients/sandbox-bc/docker-compose.ghcr.yml \
  exec -T mysql mariadb -u root -p"<DB_ROOT_PASSWORD>" <tenant-db> < /tmp/r/tmp/bc-backup-*/sql/<tenant-db>.sql
```

## Local development

Activate the pre-push hook (per clone):

```bash
git config --local core.hooksPath .githooks
```

The hook runs typecheck (server + webapp) and the server unit tests, blocking the push on failure. To bypass for an emergency: `git push --no-verify` — but expect CI to refuse the commit.

## Branching

- `develop` is the trunk and the only branch that triggers a sandbox deploy. PRs merge into develop.
- `main` is reserved for future production cuts. The pre-push hook refuses direct pushes to main.
- Tag releases (`v1.2.3`) can drive a future production workflow.

## Upstream relationship

Upstream `bigcapitalhq/bigcapital` ships its own CI workflows that push to Docker Hub `bigcapitalhq/server` and `bigcapitalhq/webapp`. We don't consume those — `.github/workflows/build-deploy-container.yml` and `build-deploy-develop-container.yaml` remain in the repo to keep merges from upstream clean, but they push artifacts we don't use.

The fork's deploy path is entirely the new `deploy.yml`. Don't disable the upstream workflows; just ignore their output.
