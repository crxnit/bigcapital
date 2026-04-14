# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Identity

This is a **fork** of [bigcapitalhq/bigcapital](https://github.com/bigcapitalhq/bigcapital), hosted at [crxnit/bigcapital](https://github.com/crxnit/bigcapital). Licensed under AGPL v3. All modifications from upstream are documented in `CHANGES.md`.

### Git Remotes

- `origin` — `git@github.com:crxnit/bigcapital.git` (the fork — push here)
- `upstream` — `https://github.com/bigcapitalhq/bigcapital.git` (upstream — pull updates from here)

To sync with upstream:
```bash
git fetch upstream
git merge upstream/main
```

## Project Overview

Bigcapital is a multi-tenant cloud accounting SaaS application. It uses a **per-tenant database isolation** model where each tenant gets its own MySQL/MariaDB database (prefixed `bigcapital_tenant_`), plus a shared system database for tenant management and authentication.

## Monorepo Structure

Lerna monorepo with pnpm workspaces. Five packages:

- **@bigcapital/server** (`packages/server`) — NestJS backend. Knex query builder + Objection.js ORM on MySQL/MariaDB. Bull/BullMQ job queues on Redis. JWT auth via Passport.js.
- **@bigcapital/webapp** (`packages/webapp`) — React 18 frontend. Vite build, Blueprint.js UI, Redux state management, Formik forms, React Query for server state.
- **@bigcapital/utils** (`shared/utils`) — Shared utilities (tsup build, CJS + ESM).
- **@bigcapital/pdf-templates** (`shared/pdf-templates`) — React/Emotion PDF templates (Webpack build).
- **@bigcapital/email-components** (`shared/email-components`) — React Email components (Vite build).

## Commands

### Development
```bash
pnpm install                    # Install all dependencies
npm run dev                     # Run all packages in dev mode
npm run dev:server              # Server + dependencies (utils, pdf-templates, email-components)
npm run dev:webapp              # Webapp + dependencies (utils, pdf-templates)
docker-compose up -d            # Start MariaDB, Redis, Gotenberg
```

### Build
```bash
npm run build                   # Build all packages
npm run build:server            # Build server only
npm run build:webapp            # Build webapp only
```

### Test
```bash
# Server tests (Jest) — run from packages/server/
npm test                        # Run all tests
npm run test:watch              # Watch mode
npm run test:cov                # Coverage report

# E2E tests (Playwright)
npm run test:e2e                # From root
```

### Lint & Typecheck
```bash
npm run lint                    # ESLint with auto-fix (server)
npm run typecheck               # TypeScript check across monorepo
```

### Database Migrations (run from packages/server/)
```bash
npm run system:migrate:make     # Create system migration
npm run system:migrate:latest   # Run system migrations
npm run tenants:migrate:make    # Create tenant migration
npm run tenants:migrate:latest  # Run tenant migrations
npm run system:seed:latest      # Seed system database
npm run tenants:seed:latest     # Seed tenant databases
```

## Server Architecture

### Module Pattern
Each feature lives in `packages/server/src/modules/<Feature>/` as a NestJS module containing:
- **Controller** (`.controller.ts`) — Route handlers with Swagger decorators (`@ApiTags`, `@ApiOperation`)
- **Application Service** — Orchestrates business logic, delegates to command services
- **Command Services** (e.g., `CreateAccount.service.ts`, `EditAccount.service.ts`) — Single-responsibility operation services
- **Repository** (`.repository.ts`) — Database access, extends `TenantRepository`
- **DTOs** (`.dto.ts`) — Request/response validation via `class-validator`
- **Model** (`.model.ts`) — Objection.js model extending `TenantBaseModel`
- **Transformer** (`.transformer.ts`) — Response data transformation

### Multi-Tenancy
- `TenancyContext` service + `ClsService` (nestjs-cls) manages per-request tenant context
- Modules import `TenancyDatabaseModule` to access tenant database connections
- Models registered via `RegisterTenancyModel()`
- Repositories and context services use `@Injectable({ scope: Scope.REQUEST })`
- `organizationId` passed in request headers

### Database
- Two migration/seed paths: `src/database/system/` and `src/database/tenant/`
- Knex for query building, Objection.js for ORM with `relationMappings`
- Models decorated with `@ExportableModel()`, `@ImportableModel()`, `@InjectModelMeta()`

### Key Integrations
- **Stripe** — Payment processing
- **Plaid** — Bank feed connections
- **Gotenberg** — PDF generation (Chrome-based)
- **S3** — Document storage
- **Swagger** — Auto-generated API docs at `/swagger`

## Webapp Architecture

- Components in `src/components/`, containers in `src/containers/`
- Redux store with Redux Persist; React Query for API data
- Path aliases: `@/*` → `src/*`, `@public/*` → `public/*`
- API client via Axios in `src/services/`

## Naming Conventions

- Files: PascalCase with role suffix — `Accounts.controller.ts`, `CreateAccount.service.ts`, `Account.model.ts`
- Tests: `.spec.ts` suffix matching source filename
- Conventional commits enforced via commitlint + husky

## TypeScript Paths

- Server: `@/*` → `./src/*`, target ES2021, CommonJS
- Webapp: `@/*` → `./*` (relative to src), target ESNext

## Production Deployment

This repo is being deployed to a self-hosted ARM64 Ubuntu server fronted by Traefik (with dynamic file provider, not Docker labels). The full plan lives in `DEPLOYMENT.md`. Key points future Claude instances should know:

- **No source on the production server.** Images are built locally on a Colima/Apple Silicon dev machine (native ARM64), exported via `docker save | gzip`, transferred via `scp`, and loaded with `docker load`. Only `docker-compose.production.yml`, `.env`, and the Traefik dynamic config live on the server.
- **The stock `docker-compose.prod.yml` and `docker/envoy/` are not used.** Envoy is replaced by Traefik routing (`/api/*` → `bigcapital-server:3000`, `/*` → `bigcapital-webapp:80`). Both containers attach to an external `traefik` Docker network plus the internal `bigcapital_network`.
- **ARM64 substitutions in the production compose file:** `mariadb:10.2` → `mariadb:10.6` (10.2 has no ARM64 image), custom MariaDB Dockerfile dropped in favor of the official image with `MYSQL_USER` env var, `redis:6.2.21` → `redis:7-alpine`, `bigcapitalhq/*:latest` (amd64) → locally-built `bigcapital-*:latest` images.
- **`docker/migration/Dockerfile.prod`** is a custom file (not in upstream) that bases the migration container on the locally-built `bigcapital-server:latest` instead of the amd64 `bigcapitalhq/server:latest`. Uses JSON-array `CMD` form for proper signal handling.
- **MariaDB tenant DB creation** requires a one-time manual `GRANT ALL PRIVILEGES ON *.* TO 'bigcapital'@'%'` after first boot, because `MYSQL_USER` only grants on `MYSQL_DATABASE` but the server creates new tenant databases at runtime. This is promoted to a first-class step in Step 9 of `DEPLOYMENT.md`.
- **Mail is production-configured via Amazon SES SMTP** in `us-east-2` (Ohio). `MAIL_HOST=email-smtp.us-east-2.amazonaws.com`, `MAIL_PORT=465`, `MAIL_SECURE=true` (implicit TLS). `MAIL_USERNAME` is an IAM access key ID starting with `AKIA` (but treat it as an opaque SMTP username — it's tied to a dedicated IAM user created via the SES Console's "Create SMTP credentials" button, not a root key). `MAIL_PASSWORD` is an HMAC-derived SES-specific value generated alongside the username; it is **region-locked** and only works against the region where it was generated. `MAIL_FROM_ADDRESS` can be any address under the verified domain — SES does not rewrite the `From:` header the way `smtp.gmail.com` does. This deployment chose SES over Google Workspace for three reasons: (1) SES is essentially free at Bigcapital's scale ($0.10 per 1000 messages, first 62k/mo free when sending from EC2), (2) the Google Workspace SMTP relay service with IP-based auth (`smtp-relay.gmail.com`, no credentials) is blocked by the `Mail.module.ts` nodemailer-auth bug documented below, and (3) SES has better deliverability tooling (per-message tracking, bounce/complaint SNS notifications, suppression lists). The Gmail app-password path (`smtp.gmail.com` + 16-char app password) is documented in `DEPLOYMENT.md` as a fallback for deployments that prefer staying in the Google ecosystem. Do not delete the backing IAM user (`ses-smtp-user.<timestamp>` or whatever you named it) without first replacing the credentials — the IAM user is what makes SES SMTP auth work, and deleting it silently breaks mail.

## Upstream Quirks — Do Not "Fix"

Several things look like bugs but match upstream behavior and must be left alone:

- **`TENANT_DB_NAME_PERFIX`** — typo of `PREFIX`, baked into the server code as the actual env var name. Do not rename it in `.env` or compose files.
- **`DB_CHARSET` env var is a no-op.** The server hardcodes `charset: 'utf8'` in `TenancyDB.module.ts`, `SystemDB.module.ts`, and `BaseCommand.ts`. The env var is set for parity with stock config but has no runtime effect.
- **`SIGNUP_DISABLED=true` means "restricted," not "off."** In `AuthSignup.service.ts:117`, if `signupRestrictions.disabled` is false, the allowlist check is *skipped entirely* and anyone can sign up. To actually restrict signups to `SIGNUP_ALLOWED_DOMAINS`/`SIGNUP_ALLOWED_EMAILS`, `SIGNUP_DISABLED` must be `true`. Domain matching is exact, not suffix — `yourdomain.com` does not match `mail.yourdomain.com`.
- **`SIGNUP_EMAIL_CONFIRMATION` is a dead knob — every new user is always auto-verified.** This is caused by a flipped Ramda `defaultTo` call in `AuthSignup.service.ts:54`:
  ```ts
  const verifiedEnabed = defaultTo(signupConfirmation.enabled, false);
  const verifyToken = verifiedEnabed ? verifyTokenCrypto : '';
  const verified = !verifiedEnabed;
  ```
  Ramda's signature is `defaultTo(default, value)` — it returns `value` if it's not null/undefined/NaN, otherwise `default`. Here the arguments are reversed: the call reads `defaultTo(signupConfirmation.enabled, false)`, which asks "is `false` null/undefined/NaN?" No — so it always returns `false`. The author almost certainly meant `defaultTo(false, signupConfirmation.enabled)`. As written, `verifiedEnabed` is hardcoded to `false`, which makes `verified = !false = true` for every new user, and `verifyToken` is always the empty string `''`. Net effect: setting `SIGNUP_EMAIL_CONFIRMATION=true` does nothing — new users bypass the `EnsureUserVerifiedGuard` (`Auth.module.ts:104-107`) immediately and can sign in without ever confirming their email.
- **`Mail.module.ts` unconditionally passes `auth: { user, pass }` to nodemailer, breaking every no-auth SMTP relay.** In `packages/server/src/modules/Mail/Mail.module.ts:14-22`, the factory always constructs:
  ```ts
  createTransport({
    host, port, secure,
    auth: {
      user: configService.get('mail.username'),  // undefined when MAIL_USERNAME unset
      pass: configService.get('mail.password'),  // undefined when MAIL_PASSWORD unset
    },
  });
  ```
  Nodemailer's `SMTPTransport` decides whether to skip auth based on truthiness of `options.auth`. An object is truthy even when its keys are undefined, so the skip path is not taken. After `EHLO`, `SMTPConnection.login()` picks SASL PLAIN (or LOGIN) from the server's advertised methods and tries to authenticate with undefined credentials, throwing:
  ```
  Error: Missing credentials for "PLAIN"
      at SMTPConnection._formatError (.../smtp-connection/index.js:798:19)
      at SMTPConnection.login (.../smtp-connection/index.js:452:38)
  ```
  **Consequence:** every no-auth SMTP path is unusable with the stock image — this includes Google Workspace SMTP relay service (`smtp-relay.gmail.com`), local postfix relays, SES SMTP with IAM roles, and any appliance-style relay that trusts source-IP. The only working configurations are password-authenticated SMTP (`smtp.gmail.com` with app password, Mailgun with API key credentials, Postmark with server token, etc.).
  **Proper upstream fix** (three lines, requires a rebuild — not applied in this base install per license stance): conditionally include the `auth` key only when credentials are provided:
  ```ts
  const username = configService.get('mail.username');
  const password = configService.get('mail.password');
  const transportOptions: any = { host, port, secure };
  if (username) transportOptions.auth = { user: username, pass: password };
  return createTransport(transportOptions);
  ```
  **Upstream status:** a search of `bigcapitalhq/bigcapital` issues for `Mail.module`, `MAIL_USERNAME`, `nodemailer`, `Missing credentials`, `SMTP relay`, and `SES` (as of the most recent audit) turned up no matching report. This bug appears to be unreported upstream. Bug report draft ready to file — see the corresponding upstream bug report section of recent session history. Until a fix ships, stick to password-authenticated SMTP providers; the stock image is **not** compatible with any no-auth SMTP relay (Google Workspace SMTP relay with IP auth, local postfix with anonymous submission, SES with IAM role-based submission, etc.).
- **Mail templates look up the wrong config key — `baseURL` instead of `app.baseUrl` — producing `http://undefined/...` URLs. Already reported and fixed upstream as bigcapitalhq/bigcapital#966.** Context: three mail-template call sites do `this.configService.get('baseURL')` (lowercase `b`, uppercase `URL`) while the config is registered in `common/config/app.ts:4` as `baseUrl` under the `app` namespace. The key `baseURL` was never registered anywhere, so the lookups returned `undefined` and JavaScript template literals interpolated the literal string `"undefined"` into email URLs like `http://undefined/auth/reset_password/<token>`. Affected sites:
  - `AuthMailMessages.esrvice.ts:23` — password reset URL
  - `AuthMailMessages.esrvice.ts:57` — signup verification URL
  - `SendInviteUsersMailMessage.service.ts:31` — user invite acceptance URL

  **Upstream status**: bigcapitalhq/bigcapital#966 was reported by `matbalba09` with the exact same diagnosis (including the proper fix — change the three lookups to `configService.get('app.baseUrl')`). Maintainer `abouolia` shipped a fix and the reporter confirmed it works. Issue is **CLOSED**.

  **But our current image predates the fix**, so we carry a compose-level workaround in `docker-compose.production.yml`: add a container env var literally named `baseURL` (case-sensitive — lowercase `b`, uppercase `URL`) set to the same value as `BASE_URL`:
  ```yaml
  environment:
    - BASE_URL=${BASE_URL}
    - baseURL=${BASE_URL}   # workaround for upstream #966, fixed in newer builds
  ```
  This works because `ConfigModule.forRoot` in `App.module.ts:114` does **not** set `ignoreEnvVars: true` or a validation schema, so NestJS's `ConfigService.get()` falls back to `process.env[key]` when the key isn't in the internal registered config. Setting `baseURL` as a process.env variable routes through the fallback and reaches the broken lookup sites. The workaround becomes redundant (but harmless) as soon as the server image is rebuilt from a commit that includes the #966 fix — the registered-config code path takes precedence over the process.env fallback, so the compose env var is simply ignored once the registered path works.

  **Related: bigcapitalhq/bigcapital#969 / [PR #972](https://github.com/bigcapitalhq/bigcapital/pull/972)** — follow-up bug discovered immediately after the #966 fix made invite/verification links clickable. The frontend webapp calls non-existent backend routes: `invite/invited/${token}` (correct route is `invite/check/${token}`) and `/auth/signup/verify` (correct route is `/auth/signup/confirm`). This means **even with the baseURL workaround, user-invite acceptance and signup-verification links will 404 when clicked** until the image is rebuilt from a commit containing PR #972. Our current image is affected. The compose workaround does NOT fix this — only a rebuild from a newer commit does. Password reset is unaffected because it uses a different route that has always been correct.
- **A verification email is still enqueued on every signup, even though verification is never required.** `AuthMail.subscriber.ts:33` subscribes to `events.auth.signUp` unconditionally and calls `sendSignupVerificationMailQueue.add(...)` with whatever token the signup service produced. Combined with the Ramda bug above, this means every signup fires a BullMQ job that attempts to send a `Bigcapital - Verify your email` message with a **broken verification URL** (`baseURL/auth/email_confirmation?token=&email=...` — empty token). The processor in `SendSignupVerificationMail.processor.ts:27-29` swallows any send errors with a `console.log`, so silent mail-pipeline failures only surface in `docker logs bigcapital-server`. Mail-related debugging on signup therefore needs container logs, not user-visible errors. The proper upstream fix would be to (a) swap the Ramda arguments, and (b) wrap the subscriber's `add(...)` call in `if (signupConfirmation.enabled)`. Both require a rebuild and are not applied in this base install.
- **`MAIL_PORT` must be a valid integer even if mail is unconfigured.** `mail.ts:7` does `parseInt(process.env.MAIL_PORT, 10)`; an unset value becomes `NaN` and produces a cryptic failure when the first mail is sent. The server *boots* fine without any mail config because nodemailer's `createTransport` is lazy — it only connects on `.sendMail()`.
- **Stock `docker-compose.prod.yml` passes through many optional env vars** (Stripe, Plaid, LemonSqueezy, New Relic, Bank Feed, PostHog) that `docker-compose.production.yml` intentionally omits for the base install. Setting those vars in `.env` alone will have no effect — they must also be added to the `server` service's `environment:` block.
- **Gotenberg listens on port 3000**, not 9000. Stock `docker-compose.prod.yml` has `expose: 9000` which is misleading; our production compose correctly uses `3000` to match the container's actual listening port and the `GOTENBERG_URL=http://gotenberg:3000` env var.
- **`/api/system_db` returns 404, and this is expected.** If you (or a future debugging session) probe `GET /api/system_db` on a running server and see 404, do **not** treat it as a symptom of a broken deployment. It's an upstream source defect that has nothing to do with real user traffic:
  - `SystemDB.controller.ts` defines a `SystemDatabaseController` with an empty `ping()` handler decorated `@Get() @Post()`. The intent is unambiguous — it was written to be a liveness probe.
  - `packages/server/Dockerfile:98` ships a `HEALTHCHECK` that probes `GET /api/system_db` and expects 2xx, confirming the same intent from the ops side.
  - **But** the controller is **never listed in any module's `controllers:` array**. `SystemDB.module.ts` only declares Knex connection providers, and no other module imports the controller. NestJS only registers routes from explicitly declared controllers, so at runtime the route does not exist — Nest returns 404 to every request.
  - Nothing in the webapp, user workflows, or external integrations calls this path, so the 404 has zero functional impact. It only breaks the image's own healthcheck.
  - `docker-compose.production.yml` overrides the `server` service's healthcheck to accept any HTTP status `<500`. 404 satisfies that, so containers correctly report `healthy`. The override still verifies the *right* thing (Node process up, Nest's HTTP stack actively serving requests) without depending on the dead-code route.
  - **Proper upstream fix** (not applied — would require a rebuild): add `SystemDatabaseController` to a module's `controllers:` array **and** annotate `ping()` with `@PublicRoute()` so the global `MixedAuthGuard` (registered as `APP_GUARD` in `Auth.module.ts:101`) doesn't then turn the 200 into a 401. Three lines across two files. The base install uses the compose override instead to stay Dockerfile-free.
  - **What this means for future debugging**: if someone reports "bigcapital-server is unhealthy," do not immediately assume something is broken. First check `docker inspect -f '{{.State.Health.Status}}' bigcapital-server` with the compose override in place — it should report `healthy`. If it reports `unhealthy`, the issue is something *other* than the 404 on `/api/system_db`.

## Docker Compose Gotchas

Lessons learned the hard way during the initial SES migration. File these under "surprising but documented behavior":

- **Shell-exported environment variables override `.env` with strict priority in Docker Compose.** If you or a prior shell session ran `export MAIL_HOST=foo`, and that variable is still live in the shell where you run `docker compose`, Compose uses the shell value and completely ignores `.env`. This is not a bug — it's documented at https://docs.docker.com/compose/environment-variables/envvars-precedence/ — but it silently bites hard because `cat .env` looks fine and you can force-recreate the container all day without the value changing. Symptom: the running container has a `MAIL_*` value that doesn't match `.env`, but `.env` is provably correct. Mixed-source pattern is the fingerprint: some vars match `.env` (the ones not exported in the shell), others don't (the ones that are).
- **`docker compose config` is the authoritative "what will Compose actually apply" view.** It renders the effective config after `.env` interpolation, shell-env override, and any inline compose-file values. **This is the first command to run** whenever env-var behavior is surprising. Not `docker exec env`, not `cat .env`, not `--force-recreate`. Run `docker compose -f docker-compose.production.yml config | grep -i -A1 -B1 <VAR>` first. Whatever it shows is what new containers will receive.
- **Fast-recovery recipe** when `docker compose config` disagrees with `.env`:
  ```bash
  env | grep -i <VAR_PREFIX>    # find the stale shell exports
  unset VAR1 VAR2 VAR3           # clear them
  docker compose -f docker-compose.production.yml config | grep -i <VAR>   # verify .env now wins
  docker compose -f docker-compose.production.yml up -d --force-recreate <service>   # apply
  ```
- **Session-local vs persistent exports.** If shell exports disappear after a fresh SSH login, they were session-local (probably typed interactively during an earlier debugging session) and no persistent source exists. If they survive re-login, hunt them down in: `~/.bashrc`, `~/.bash_profile`, `~/.profile`, `/etc/environment`, `/etc/profile.d/*.sh`, `.envrc` (direnv), `~/.ssh/environment` (with `PermitUserEnvironment=yes`), systemd unit `Environment=` directives, or a deploy-helper script that sources env with `export` prefixes. `grep -n 'export MAIL' ~/.bash_history` is usually the fastest way to pinpoint the origin. The initial SES migration hit this exactly: leftover `export MAIL_HOST=smtp-relay.gmail.com` from a prior IP-auth debugging attempt haunted a long-running SSH session for hours, producing "why isn't my new `.env` picking up?" symptoms that looked like container-state bugs but were actually shell-state bugs.
- **Production deployment directory is `/srv/portal/clients/bigcapital`**, not `/opt/bigcapital` as used in earlier DEPLOYMENT.md examples. The DEPLOYMENT.md paths were never updated; the actual server uses a different layout, adapted by the operator during install. Not a problem, just a note so future debugging sessions don't assume the documented path.

## Upstream Bugs — Fixed Locally

Bugs we've patched in our local source and rebuilt the webapp image for. These fixes are not in the upstream release we originally deployed from.

- **Bulk Activate/Inactivate Accounts crash with "is not a function" (unreported as of 2026-04-13).** Both `AccountBulkInactivateAlert.tsx` and `AccountBulkActivateAlert.tsx` call functions (`requestBulkInactiveAccounts` / `requestBulkActivateAccounts`) that are never injected — the HOC that was supposed to provide them was commented out (inactivate) or never implemented (activate, has an explicit `TODO` on line 22). There is no backend bulk endpoint either; only single-account `POST /accounts/:id/activate` and `POST /accounts/:id/inactivate` exist. The single-account alert equivalents (`AccountActivateAlert.tsx`, `AccountInactivateAlert.tsx`) were properly refactored to use React Query hooks, but the bulk variants were left behind.
  **Local fix (applied 2026-04-13):** rewrote both bulk alerts to use the existing `useActivateAccount` / `useInactivateAccount` hooks with `Promise.all()` over the selected IDs. Also fixed the confirm button count (was hardcoded `0`, now shows `accountsIds.length`). Webapp image rebuilt and deployed.
  **Upstream status:** bug report drafted, pending filing.

- **User deletion fails with foreign key violation on `USER_INVITES`.** `SyncTenantUserDeleted.subscriber.ts` tries to delete from the `USERS` table without first deleting dependent `USER_INVITES` rows. Workaround: manually `DELETE FROM USER_INVITES WHERE USER_ID = <id>` before deleting the user. Not patched locally — manual DB cleanup sufficient for now.

## Production Operations

### Running Tenant Migrations in Docker

The `npm run tenants:migrate:latest` command relies on lerna, which isn't available inside the production container. Use the compiled CLI directly:

```bash
docker exec -it bigcapital-server node /app/packages/server/dist/cli.js tenants:migrate:latest
```

Similarly for system migrations:
```bash
docker exec -it bigcapital-server node /app/packages/server/dist/cli.js system:migrate:latest
```

### Rate Limiting / Throttle

The server uses `@nestjs/throttler` backed by Redis. Default: 100 requests per 60 seconds (`THROTTLE_GLOBAL_TTL=60000`, `THROTTLE_GLOBAL_LIMIT=100`). Auth endpoints have a separate stricter limit (10 per 60s). If React Query retry loops burn through the limit, the fix is to flush the Redis throttle state:

```bash
docker exec -it bigcapital-redis redis-cli FLUSHALL
```

To raise the limit permanently, add `THROTTLE_GLOBAL_LIMIT=300` (or desired value) to the server service's `environment:` block in `docker-compose.production.yml` — setting it in `.env` alone has no effect because the variable isn't passed through by default (same pattern as the other optional env vars noted in the Upstream Quirks section).
