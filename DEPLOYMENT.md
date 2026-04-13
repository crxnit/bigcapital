# Deployment Plan: Bigcapital on ARM Ubuntu with Traefik

## Architecture Overview

The stock `docker-compose.prod.yml` ships with an Envoy proxy that you don't need — Traefik replaces it. The routing rule is simple: `/api/*` goes to the NestJS server (port 3000), everything else goes to the webapp nginx (port 80). Both containers must be reachable by Traefik via a shared external network.

```
Internet → Traefik (SSL termination)
               ├── books.yourdomain.com/api/* → bigcapital-server:3000
               └── books.yourdomain.com/*     → bigcapital-webapp:80

Internal only (bigcapital_network):
    server → mysql:3306, redis:6379, gotenberg:3000
    database_migration → mysql:3306
```

### What goes where

| Machine | What lives there |
|---------|-----------------|
| **Your dev machine** (this repo) | Source code, Docker image builds via Colima, `.env`, `docker-compose.production.yml`, Traefik dynamic config |
| **Production server** | `docker-compose.production.yml`, `.env`, Traefik dynamic config, pre-built images loaded from tarballs |

No source code or git repo is cloned on the production server. All config files are authored on the dev machine and transferred over.

---

## Step 1: Create the migration Dockerfile

The stock `docker/migration/Dockerfile` pulls `FROM bigcapitalhq/server:latest` (a pre-built amd64 image). Create `docker/migration/Dockerfile.prod` that uses your locally built image instead:

```dockerfile
FROM bigcapital-server:latest

USER root
RUN apk update && apk add --no-cache bash git

WORKDIR /app/packages/server
RUN git clone https://github.com/vishnubob/wait-for-it.git

CMD ./wait-for-it/wait-for-it.sh mysql:3306 -- sh -c \
  "node dist/cli.js system:migrate:latest && node dist/cli.js tenants:migrate:latest"
```

## Step 2: Build ARM64 images locally

Build the images on your dev machine (Colima on Apple Silicon). Since Colima runs a native ARM64 Linux VM, the resulting images are already `linux/arm64` — no cross-compilation or buildx needed. The server image must be built first because the migration image depends on it.

Run these from the repo root:

```bash
# Build server image
docker build -f packages/server/Dockerfile -t bigcapital-server:latest .

# Build webapp image
docker build -f packages/webapp/Dockerfile -t bigcapital-webapp:latest .

# Build migration image — depends on bigcapital-server:latest
docker build -f docker/migration/Dockerfile.prod -t bigcapital-migration:latest .
```

## Step 3: Export images to tarballs

Run from the repo root. Tarballs land in the current directory.

```bash
docker save bigcapital-server:latest | gzip > bigcapital-server.tar.gz
docker save bigcapital-webapp:latest | gzip > bigcapital-webapp.tar.gz
docker save bigcapital-migration:latest | gzip > bigcapital-migration.tar.gz
```

## Step 4: Create the production docker-compose file

Create `docker-compose.production.yml` on your dev machine — this is the file you'll transfer to the server in Step 7. It references images by name (no `build:` directives since images are pre-built and loaded).

```yaml
version: '3.3'

services:
  webapp:
    container_name: bigcapital-webapp
    image: bigcapital-webapp:latest
    restart: unless-stopped
    expose:
      - '80'
    networks:
      - bigcapital_network
      - traefik

  server:
    container_name: bigcapital-server
    image: bigcapital-server:latest
    expose:
      - '3000'
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_started
    restart: unless-stopped
    # Override the Dockerfile's HEALTHCHECK, which hits /api/system_db and only
    # accepts 2xx. That endpoint does not actually exist in the running app:
    # SystemDatabaseController is defined in SystemDB.controller.ts but is never
    # registered in any module (SystemDB.module.ts only declares Knex providers,
    # and no other module imports the controller). So Nest returns 404 and the
    # image's check flags the container unhealthy forever — even though the app
    # is fully functional. This is a dead reference in upstream code.
    # Treat any HTTP status < 500 as healthy: the Node process is up and Nest's
    # HTTP layer is actively serving requests, which is what we actually want to
    # verify. The proper upstream fix would be to register the controller (and
    # give it @PublicRoute() to bypass the global MixedAuthGuard), but that
    # requires a rebuild; the compose override is the pragmatic workaround.
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - "require('http').get('http://localhost:3000/api/system_db', (r) => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"
      interval: 30s
      timeout: 3s
      start_period: 40s
      retries: 3
    networks:
      - bigcapital_network
      - traefik
    environment:
      # Mail
      - MAIL_HOST=${MAIL_HOST}
      - MAIL_USERNAME=${MAIL_USERNAME}
      - MAIL_PASSWORD=${MAIL_PASSWORD}
      - MAIL_PORT=${MAIL_PORT}
      - MAIL_SECURE=${MAIL_SECURE}
      - MAIL_FROM_NAME=${MAIL_FROM_NAME}
      - MAIL_FROM_ADDRESS=${MAIL_FROM_ADDRESS}
      # Database
      - DB_HOST=mysql
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_CHARSET=${DB_CHARSET}
      # System database
      - SYSTEM_DB_NAME=${SYSTEM_DB_NAME}
      # Redis
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - QUEUE_HOST=redis
      - QUEUE_PORT=6379
      # Tenants
      - TENANT_DB_NAME_PERFIX=${TENANT_DB_NAME_PERFIX}
      # Auth
      - JWT_SECRET=${JWT_SECRET}
      # Application
      - BASE_URL=${BASE_URL}
      # Workaround for upstream bug bigcapitalhq/bigcapital#966 (CLOSED,
      # fixed upstream, but our current image predates the fix). The mail
      # templates in AuthMailMessages.esrvice.ts (password reset, signup
      # verification) and SendInviteUsersMailMessage.service.ts (user
      # invites) call configService.get('baseURL') — but the config is
      # actually registered under 'app.baseUrl' in common/config/app.ts.
      # The misspelled lookup key (camelCase lowercase 'b', uppercase 'URL')
      # has never been registered in older builds, so the lookups return
      # undefined and mail URLs render as "http://undefined/auth/reset_password/..."
      # etc. Since NestJS's ConfigService.get() falls back to process.env
      # when a key isn't in the internal config, setting a container env
      # var literally named `baseURL` (matching the misspelled lookup)
      # routes through the fallback and fixes all three broken mail code
      # paths with zero upstream code changes. Case matters: must be
      # lowercase 'b', uppercase 'URL'.
      #
      # This line becomes redundant (but harmless) once the server image
      # is rebuilt from a commit that includes the #966 fix — the
      # registered config takes precedence over the process.env fallback,
      # so the compose env var is simply ignored at that point.
      #
      # SEPARATELY: bigcapitalhq/bigcapital#969 / PR #972 is a related
      # follow-up bug in the webapp that causes the (now-correct) invite
      # and verification links to 404 when clicked — the frontend calls
      # non-existent API routes (invite/invited vs invite/check, and
      # /auth/signup/verify vs /auth/signup/confirm). That bug cannot be
      # worked around from compose. Only password reset is safe with
      # our current image; user-invite acceptance and signup verification
      # links are broken at the click step and require a rebuild from
      # a commit containing PR #972 to fix. See CLAUDE.md "Upstream
      # Quirks" for details.
      - baseURL=${BASE_URL}
      # Sign-up
      - SIGNUP_DISABLED=${SIGNUP_DISABLED}
      - SIGNUP_ALLOWED_DOMAINS=${SIGNUP_ALLOWED_DOMAINS}
      - SIGNUP_ALLOWED_EMAILS=${SIGNUP_ALLOWED_EMAILS}
      - SIGNUP_EMAIL_CONFIRMATION=${SIGNUP_EMAIL_CONFIRMATION}
      # Gotenberg
      - GOTENBERG_URL=${GOTENBERG_URL}
      - GOTENBERG_DOCS_URL=${GOTENBERG_DOCS_URL}
      # Exchange Rate
      - EXCHANGE_RATE_SERVICE=${EXCHANGE_RATE_SERVICE}
      - OPEN_EXCHANGE_RATE_APP_ID=${OPEN_EXCHANGE_RATE_APP_ID}
      # S3
      - S3_REGION=${S3_REGION}
      - S3_ACCESS_KEY_ID=${S3_ACCESS_KEY_ID}
      - S3_SECRET_ACCESS_KEY=${S3_SECRET_ACCESS_KEY}
      - S3_ENDPOINT=${S3_ENDPOINT}
      - S3_BUCKET=${S3_BUCKET}

  database_migration:
    container_name: bigcapital-database-migration
    image: bigcapital-migration:latest
    environment:
      - DB_HOST=mysql
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_CHARSET=${DB_CHARSET}
      - SYSTEM_DB_NAME=${SYSTEM_DB_NAME}
      - TENANT_DB_NAME_PERFIX=${TENANT_DB_NAME_PERFIX}
    depends_on:
      mysql:
        condition: service_healthy
    networks:
      - bigcapital_network

  mysql:
    container_name: bigcapital-mysql
    image: mariadb:10.6
    restart: unless-stopped
    environment:
      - MYSQL_DATABASE=${SYSTEM_DB_NAME}
      - MYSQL_USER=${DB_USER}
      - MYSQL_PASSWORD=${DB_PASSWORD}
      - MYSQL_ROOT_PASSWORD=${DB_ROOT_PASSWORD}
    command: >
      --character-set-server=utf8mb4
      --collation-server=utf8mb4_unicode_ci
      --bind-address=0.0.0.0
    volumes:
      - mysql:/var/lib/mysql
    expose:
      - '3306'
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s
    networks:
      - bigcapital_network

  redis:
    container_name: bigcapital-redis
    image: redis:7-alpine
    restart: unless-stopped
    expose:
      - '6379'
    volumes:
      - redis:/data
    networks:
      - bigcapital_network

  gotenberg:
    container_name: bigcapital-gotenberg
    image: gotenberg/gotenberg:7
    restart: unless-stopped
    expose:
      - '3000'
    networks:
      - bigcapital_network

volumes:
  mysql:
    name: bigcapital_prod_mysql
    driver: local
  redis:
    name: bigcapital_prod_redis
    driver: local

networks:
  bigcapital_network:
    driver: bridge
  traefik:
    external: true
```

**Key differences from stock `docker-compose.prod.yml`:**

| Change | Why |
|--------|-----|
| Envoy proxy service removed | Traefik handles routing externally |
| All `build:` directives → `image:` references | Images are pre-built on dev machine and loaded via `docker load` |
| `mariadb:10.2` → `mariadb:10.6` | 10.2 is EOL and has no official ARM64 images; 10.6 has native ARM64 support |
| Custom MariaDB Dockerfile replaced with official image + `command:` | The custom Dockerfile is based on `mariadb:10.2`; its init SQL is replaced by the one-time `GRANT` in Step 9 |
| `redis:6.2.21` → `redis:7-alpine` | Native ARM64 support, smaller image |
| MySQL `healthcheck` added | Replaces the `wait-for-it.sh` hack in the migration container with proper dependency ordering |
| `webapp` and `server` joined to external `traefik` network | So Traefik can route to them |
| `restart: on-failure` → `restart: unless-stopped` | Better for production (survives host reboots) |
| Stripe/Plaid/LemonSqueezy/New Relic/Bank Feed passthroughs dropped | Base install only; re-add to the `server.environment:` block if you need them |
| `server` service `healthcheck:` override | Dockerfile's check requires 2xx from `/api/system_db`, but `SystemDatabaseController` is defined and never registered in any module, so Nest returns 404 — override treats any HTTP status <500 as healthy |
| `baseURL=${BASE_URL}` env var added to `server` service | Workaround for bigcapitalhq/bigcapital#966 (CLOSED, fixed upstream but our current image predates the fix) — mail templates in `AuthMailMessages.esrvice.ts` and `SendInviteUsersMailMessage.service.ts` look up `configService.get('baseURL')` but the config is registered as `app.baseUrl`. NestJS's process.env fallback makes this compose-level env var route through to the broken lookup, fixing password reset / signup verification / user invite mail URL rendering without a code rebuild. Redundant after rebuild from a post-fix commit. NOTE: does **not** fix the related frontend bug bigcapitalhq/bigcapital#969 / PR #972 — invite acceptance and signup verification links still 404 when clicked with our current image; only password reset works end-to-end |

## Step 5: Create the `.env` file

Create `.env` on your dev machine (this is what gets transferred to the server in Step 7). Do not commit it — the repo's `.gitignore` already excludes it.

```env
# MUST change these
JWT_SECRET=<generate with: openssl rand -base64 32>
DB_USER=bigcapital
DB_PASSWORD=<generate a strong password>
DB_ROOT_PASSWORD=<generate a strong password>
DB_CHARSET=utf8
SYSTEM_DB_NAME=bigcapital_system
TENANT_DB_NAME_PERFIX=bigcapital_tenant_

# Your public URL (what users type in browser)
BASE_URL=https://books.yourdomain.com

# Mail — required for user invites, password resets.
# Canonical path: Amazon SES SMTP endpoint with password auth. See the
# "Mail provider setup" section below Step 10 for the full SES setup
# walkthrough (domain verification, DKIM, SPF, sandbox exit, generating
# SMTP credentials). Substitute your actual region — the SMTP endpoint
# string is shown on the SES Console's "SMTP settings" page and differs
# per region. SMTP credentials are region-locked; credentials generated
# in us-east-2 will NOT authenticate against the us-east-1 endpoint.
#
# IMPORTANT: we cannot use any no-auth SMTP relay (Google Workspace SMTP
# relay service with IP auth, local postfix with anonymous submission,
# SES with IAM-role submission, etc.). The upstream server code
# (packages/server/src/modules/Mail/Mail.module.ts) always passes an `auth`
# object to nodemailer, even when credentials are empty, which causes
# nodemailer to attempt SASL PLAIN against any AUTH-advertising relay and
# fail with `Missing credentials for "PLAIN"`. The fix requires patching
# Mail.module.ts to conditionally omit the auth key — a rebuild-requiring
# source change that is out of scope for this base install. Stick to
# password-authenticated SMTP providers. See CLAUDE.md "Upstream Quirks"
# for the full bug analysis and upstream report details.
MAIL_HOST=email-smtp.us-east-2.amazonaws.com
MAIL_USERNAME=AKIAIOSFODNN7EXAMPLE
MAIL_PASSWORD="BISF8nD6TOaMbunxLth+HqAe2fk6Z0egrH8UMZsqb3yn"
MAIL_PORT=465
MAIL_SECURE=true
MAIL_FROM_NAME="Bigcapital"
MAIL_FROM_ADDRESS=noreply@yourdomain.com

# Quote any value containing spaces, commas, or shell metacharacters — e.g.
# MAIL_FROM_NAME="Your Company, LLC" or MAIL_PASSWORD with SES-style base64
# characters (+, /, =). Docker Compose's .env parser handles unquoted spaces,
# but some deploy steps source this file with bash, which does not. When in
# doubt, double-quote — it's harmless when unnecessary.

# Gotenberg (internal docker network — leave as-is)
GOTENBERG_URL=http://gotenberg:3000
GOTENBERG_DOCS_URL=http://server:3000/public/

# Lock down signups for self-hosted.
# SIGNUP_DISABLED=true is required for the allowlists below to take effect —
# counterintuitively, "disabled" here means "restricted to the allowlists."
# If false, anyone can sign up and the allowlists are ignored.
SIGNUP_DISABLED=true
SIGNUP_ALLOWED_DOMAINS=yourdomain.com
SIGNUP_ALLOWED_EMAILS=
```

The domain match is exact, not a suffix — `yourdomain.com` allows `alice@yourdomain.com` but **not** `alice@mail.yourdomain.com`. List each subdomain explicitly if you need them. Both variables are comma-separated lists, and signup passes if the email matches *either* list.

**Notes:**

- **`TENANT_DB_NAME_PERFIX` is spelled with the typo `PERFIX` on purpose** — this matches the upstream variable name in the server code. Do not "fix" it to `PREFIX`.
- **`DB_CHARSET` is currently a no-op** — the server hardcodes `charset: 'utf8'` in its DB connection modules (`TenancyDB.module.ts`, `SystemDB.module.ts`, `BaseCommand.ts`). Set it anyway for parity with the stock config.
- **S3** credentials are passed through to the server — set them in `.env` if you want document storage.
- **Stripe, Plaid, LemonSqueezy, New Relic, Bank Feed, PostHog are not wired into `docker-compose.production.yml`** in this base install. Setting them in `.env` alone will have no effect. To enable any of them, add the corresponding env vars to the `server` service's `environment:` block in the compose file (see stock `docker-compose.prod.yml` for the full list) and then set them in `.env`.
- **With SES, `MAIL_FROM_ADDRESS` can be any address under a verified domain.** SES does **not** rewrite the `From:` header the way `smtp.gmail.com` does. Any `you@yourdomain.com` value works as long as `yourdomain.com` is a verified identity in SES. This means you can use `noreply@yourdomain.com`, `billing@yourdomain.com`, or whatever recipient-facing address you prefer, without needing to create a Gmail alias or a matching Workspace user.
- **SES SMTP credentials are region-locked.** The SMTP "username" looks like an AWS access key ID (`AKIA…`) and the "password" is an HMAC-derived value. They only authenticate against the region's SMTP endpoint where they were created. If you later want to send from a different region, regenerate credentials from that region's SES console. Do **not** delete the backing IAM user (named something like `ses-smtp-user.<timestamp>`) without first replacing the credentials — the user is what makes the SMTP auth work.
- **Daily send limits on SES** start at 200/day in sandbox mode and scale automatically in production. For a base Bigcapital install you will never approach them (a busy instance sends hundreds per day, not thousands). Review the quota on the Account dashboard if you're unsure.
- **Alternative: Gmail app password.** If you'd rather not use SES, `smtp.gmail.com` authenticated with a Workspace app password works too (same structure as the SES block, just different host/credentials). Note two Gmail-specific gotchas that don't apply to SES: Gmail **rewrites** the `From:` header to match the authenticated user unless you've configured a verified "Send mail as" alias in that mailbox's Gmail settings; and Gmail's daily send limit is 500 (free) or 2000 (paid Workspace) per account. Use SES unless you have a specific reason not to — SES is cheaper, has better deliverability tooling, and doesn't rewrite headers.

## Step 6: Create the Traefik dynamic config file

Create `bigcapital-traefik.yml` on your dev machine. You'll transfer it to your Traefik dynamic config directory on the server (e.g. `/etc/traefik/dynamic/bigcapital.yml`) in Step 7.

```yaml
http:
  routers:
    bigcapital-api:
      rule: "Host(`books.yourdomain.com`) && PathPrefix(`/api`)"
      service: bigcapital-api
      entryPoints:
        - websecure
      tls:
        certResolver: yourCertResolver  # match your existing Traefik TLS config

    bigcapital-webapp:
      rule: "Host(`books.yourdomain.com`)"
      service: bigcapital-webapp
      entryPoints:
        - websecure
      tls:
        certResolver: yourCertResolver
      # Lower priority so /api matches first
      priority: 1

  services:
    bigcapital-api:
      loadBalancer:
        servers:
          - url: "http://bigcapital-server:3000"

    bigcapital-webapp:
      loadBalancer:
        servers:
          - url: "http://bigcapital-webapp:80"
```

Replace `books.yourdomain.com` with your actual domain and `yourCertResolver` with whatever cert resolver you use for your other services.

The `bigcapital-api` router has a more specific rule (`PathPrefix(/api)`) so it naturally takes priority. The explicit `priority: 1` on the webapp router makes this unambiguous.

## Step 7: Transfer images and config to the production server

```bash
# Transfer image tarballs
scp bigcapital-server.tar.gz bigcapital-webapp.tar.gz bigcapital-migration.tar.gz \
  user@yourserver:/tmp/

# Create the app directory on the server and give your user write access
ssh user@yourserver "sudo mkdir -p /opt/bigcapital && sudo chown \$USER:\$USER /opt/bigcapital"

# Transfer compose and env files
scp docker-compose.production.yml user@yourserver:/opt/bigcapital/
scp .env user@yourserver:/opt/bigcapital/

# Transfer the Traefik dynamic config via /tmp, then sudo-move it into place
# (adjust the destination path if your Traefik dynamic dir is elsewhere)
scp bigcapital-traefik.yml user@yourserver:/tmp/bigcapital-traefik.yml
ssh user@yourserver "sudo mv /tmp/bigcapital-traefik.yml /etc/traefik/dynamic/bigcapital.yml"
```

## Step 8: Load images on the production server

SSH into the server:

```bash
ssh user@yourserver
```

Then, inside the remote shell, load the images:

```bash
docker load < /tmp/bigcapital-server.tar.gz
docker load < /tmp/bigcapital-webapp.tar.gz
docker load < /tmp/bigcapital-migration.tar.gz

# Clean up tarballs
rm /tmp/bigcapital-server.tar.gz /tmp/bigcapital-webapp.tar.gz /tmp/bigcapital-migration.tar.gz
```

## Step 9: Launch on the production server

From the SSH session on the production server:

```bash
cd /opt/bigcapital

# Ensure the external traefik network exists (it should if Traefik is running)
docker network ls | grep traefik

# Start infrastructure first
docker compose -f docker-compose.production.yml up -d mysql redis gotenberg

# Poll until MySQL reports healthy
until [ "$(docker inspect -f '{{.State.Health.Status}}' bigcapital-mysql)" = "healthy" ]; do
  echo "Waiting for mysql..."; sleep 2
done
```

**First-boot-only** — grant the app user full privileges so the server can create tenant databases at runtime. The stock upstream image handles this via a custom MariaDB init script; since we use the official `mariadb:10.6` image, we do it manually once. **Skip this on subsequent deploys.**

```bash
# Extract just the two values we need from .env without sourcing the whole file.
# (Sourcing via `set -a && . ./.env` breaks on any value containing unquoted
# spaces — e.g. MAIL_FROM_NAME=Your Company, LLC — because bash parses each line
# as shell syntax. Docker Compose's own .env parser is more forgiving, which is
# why `docker compose up` works fine with the same file.)
DB_ROOT_PASSWORD=$(grep -E '^DB_ROOT_PASSWORD=' .env | cut -d= -f2-)
DB_USER=$(grep -E '^DB_USER=' .env | cut -d= -f2-)

docker exec -i bigcapital-mysql mariadb -u root -p"$DB_ROOT_PASSWORD" <<SQL
GRANT ALL PRIVILEGES ON *.* TO '$DB_USER'@'%';
FLUSH PRIVILEGES;
SQL
```

Then run migrations and start the app:

```bash
# Run migrations (exits when done — re-run this on every deploy that ships schema changes)
docker compose -f docker-compose.production.yml up database_migration

# Start the application
docker compose -f docker-compose.production.yml up -d server webapp
```

## Step 10: Verify

```bash
# Check all containers are running
docker compose -f docker-compose.production.yml ps

# Check server health (from the server itself)
docker exec bigcapital-server wget -qO- http://localhost:3000/api/system_db

# Check via Traefik
curl -I https://books.yourdomain.com
curl -I https://books.yourdomain.com/api/system_db

# Check logs if anything looks wrong
docker logs bigcapital-server
docker logs bigcapital-webapp
docker logs bigcapital-database-migration
```

---

## Gotchas and Notes

1. **First build takes a few minutes** — the server Dockerfile installs `chromium` and native modules (bcrypt). Since Colima on Apple Silicon builds natively for ARM64, there's no QEMU overhead. Subsequent rebuilds use Docker layer cache and are fast.

2. **Traefik network name** — this plan uses `traefik` as the external network name. If yours is named differently (e.g., `proxy`, `web`), update the `networks:` section in the compose file accordingly.

3. **WebSocket support** — the server uses Socket.io. Traefik handles WebSocket upgrades automatically for HTTP services, so no extra config needed.

4. **`docker compose config` is the first-line debugging tool for env-var surprises.** If you change a value in `.env` and the running container doesn't seem to pick it up — or worse, picks up a value that isn't in `.env` at all — do **not** jump to `--force-recreate`. Start with:

   ```bash
   cd /srv/portal/clients/bigcapital   # or wherever your compose file lives
   docker compose -f docker-compose.production.yml config | grep -i -A1 -B1 <VAR_NAME>
   ```

   This renders the **effective** config Compose will apply to the next container — after `.env` interpolation, after shell env-var precedence, after any compose-level overrides. Whatever value appears in this output is what Compose believes the correct value is, regardless of what's in `.env`.

   **The subtle reason this matters**: Docker Compose gives shell-exported environment variables **strict priority** over `.env` file values. If you (or a script you ran, or an editor plugin, or direnv) exported `MAIL_HOST=smtp-relay.gmail.com` in your shell at some point, and that export is still live in your current session, Compose will use the shell value and completely ignore whatever `.env` says. The `docker compose config` output is the only way to see this happening, because the shell export is invisible from a plain `cat .env` inspection.

   **The fast-recovery recipe** when `docker compose config` doesn't match `.env`:

   ```bash
   # What's in the current shell?
   env | grep -i <VAR_PREFIX>    # e.g. env | grep -i mail

   # Clear the stale exports
   unset MAIL_HOST MAIL_USERNAME MAIL_PASSWORD MAIL_FROM_ADDRESS

   # Verify config now matches .env
   docker compose -f docker-compose.production.yml config | grep -i mail

   # Apply to the running container
   docker compose -f docker-compose.production.yml up -d --force-recreate server
   ```

   If the exports come back on a fresh SSH login, they have a persistent source (a shell rc file, `/etc/environment`, a sourced deploy script, direnv, etc.) that needs to be cleaned up. If they don't come back, they were session-local from an earlier interactive `export` command — one-time issue, no persistent fix needed, just be aware.

   This hit us hard during the initial SES migration: `.env` had correct values, but the container kept using stale Gmail values from an earlier `smtp-relay.gmail.com` debugging session where `export MAIL_HOST=...` had been typed interactively. Recreating the container a dozen times didn't help because Compose was re-injecting the same shell-sourced values each time. `docker compose config` revealed the discrepancy in one command.

5. **`/api/system_db` returns 404 — this is expected and harmless.** If you probe the server directly (e.g. `docker exec bigcapital-server wget -qO- http://localhost:3000/api/system_db`), you'll get `HTTP/1.1 404 Not Found`. Don't panic — this is an upstream bug that does **not** affect real traffic.

   **What's happening:** `packages/server/src/modules/System/SystemDB/SystemDB.controller.ts` defines a `SystemDatabaseController` with an empty `ping()` handler decorated with `@Get()` and `@Post()`. It was clearly written to be the healthcheck endpoint — the Dockerfile's `HEALTHCHECK` at line 98 explicitly probes `/api/system_db` and expects `2xx`. But the controller is **never listed in any module's `controllers:` array**. `SystemDB.module.ts` only declares Knex connection providers, and no other module imports the controller. NestJS only registers routes from controllers that modules explicitly declare, so at runtime this route simply does not exist and Nest returns 404 for every request to it — including the image's own healthcheck probe, which is why the container is marked unhealthy out of the box.

   **Why it doesn't matter:** `/api/system_db` was never meant to be user-facing. Nothing in the webapp, no user workflow, and no external integration calls it. It exists only as a liveness probe. The real application — every controller the webapp actually talks to — is registered and working normally. You can confirm this by signing in to the webapp and using any feature.

   **Why the container still shows `healthy`:** the `server` service in `docker-compose.production.yml` overrides the image's `HEALTHCHECK` with one that treats any HTTP status `<500` as healthy. 404 satisfies that, so the probe passes. We verify the *right* thing — "is Nest's HTTP stack up and responding?" — without depending on a dead-code route.

   **The proper upstream fix** (requires a rebuild, not recommended for this base install): add `SystemDatabaseController` to a module's `controllers:` array, and annotate its `ping()` method with `@PublicRoute()` so the global `MixedAuthGuard` (registered as `APP_GUARD` in `Auth.module.ts:101`) doesn't then turn the 200 back into a 401. Three lines across two files. We deliberately chose the compose override instead to keep the base install Dockerfile-free.

6. **Updating** — to deploy a new version:
   ```bash
   # On your dev machine — rebuild and export
   docker build -f packages/server/Dockerfile -t bigcapital-server:latest .
   docker build -f packages/webapp/Dockerfile -t bigcapital-webapp:latest .
   docker build -f docker/migration/Dockerfile.prod -t bigcapital-migration:latest .
   docker save bigcapital-server:latest | gzip > bigcapital-server.tar.gz
   docker save bigcapital-webapp:latest | gzip > bigcapital-webapp.tar.gz
   docker save bigcapital-migration:latest | gzip > bigcapital-migration.tar.gz
   scp bigcapital-*.tar.gz user@yourserver:/tmp/

   # On the production server — load and restart
   docker load < /tmp/bigcapital-server.tar.gz
   docker load < /tmp/bigcapital-webapp.tar.gz
   docker load < /tmp/bigcapital-migration.tar.gz
   cd /opt/bigcapital
   docker compose -f docker-compose.production.yml up database_migration
   docker compose -f docker-compose.production.yml up -d server webapp
   ```

7. **Backups** — the MariaDB data lives in the `bigcapital_prod_mysql` Docker volume. Set up a cron job for regular dumps:
   ```bash
   docker exec bigcapital-mysql mariadb-dump -u root -p<password> --all-databases > /backups/bigcapital_$(date +%F).sql
   ```
