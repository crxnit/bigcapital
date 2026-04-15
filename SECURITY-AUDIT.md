# Security Audit

Living record of security work on this repository. Append new findings and fixes; do not rewrite history.

## Dependency Audit Summary

| Metric | Original | Current | Change |
|---|---|---|---|
| Critical | 15 | **0** | -15 (100%) |
| High | 89 | **2** | -87 (98%) |
| Moderate | 71 | **25** | -46 (65%) |
| Low | 27 | **10** | -17 (63%) |
| **Total** | **202** | **37** | **-165 (82%)** |

Verify with `pnpm audit`.

## Data Handling Review Summary

A separate audit covered PII/privacy/retention concerns. Fixes landed in Batches 1–4 below. Open items (if any) are tracked inline in the sections that follow.

---

## Fixes Applied

### Phase 1 — Immediate (Critical CVEs)

All 15 critical CVEs resolved. Direct dependency bumps and transitive overrides:

| Package | Fix | Location |
|---|---|---|
| `@tiptap/extension-color` | `"latest"` → `"^2.4.0"` | `packages/webapp/package.json` |
| `@casl/ability` | `^5.4.3` → `^6.7.5` (prototype pollution fix) | server + webapp |
| `@casl/react` | `^2.3.0` → `^3.0.0` (compat with v6) | webapp |
| `axios` | `^1.6.0` → `^1.15.0` (SSRF + metadata exfil) | server + webapp + pnpm override |
| `form-data` | `^4.0.0` → `^4.0.4` (unsafe random boundary) | server |
| `vitest` | `^2.1.3` → `^2.1.9` (RCE via API server) | `shared/email-components` |
| `fast-xml-parser` | pnpm override `>=4.5.4` | transitive via `@aws-sdk/client-s3` |
| `handlebars` | pnpm override `>=4.7.9` | transitive via `lerna` |

### Phase 2 — Short-term (Unused deps + loose versions)

Removed 10 unused dependencies that expanded attack surface; pinned 5 loose `^major.x` versions.

**Removed from `packages/server/package.json`:**
- `bcryptjs` (redundant with `bcrypt`)
- `bull`, `@nestjs/bull` (redundant with `bullmq` / `@nestjs/bullmq`)
- `mysql2` (knex uses `mysql` driver)
- `cache-manager-redis-store`, `express-validator`, `serialize-interceptor`, `remeda`, `lamda`, `strategy` (zero imports)

**Pinned in `shared/pdf-templates/package.json`:**
- `css-loader`: `^6.x` → `^6.11.0`
- `style-loader`: `^3.x` → `^3.3.4`
- `ts-loader`: `^9.x` → `^9.5.1`
- `webpack`: `^5.x` → `^5.91.0`
- `webpack-cli`: `^5.x` → `^5.1.4`

### Phase 3 — Medium-term (Dependency hygiene)

Moved `@types/*` and build tooling from `dependencies` to `devDependencies`:

- **Server**: 5 `@types/*` packages (`multer`, `nodemailer`, `passport-google-oauth20`, `passport-local`, `ramda`)
- **Webapp**: 14 `@types/*` packages
- **pdf-templates**: `@types/lodash` + 7 build tools (webpack, loaders, plugins)

### Phase 4 — Remaining transitives

**Step 4.1 — Quick wins (removed dead deps):**
- Removed `nestjs-redis@1.3.3` from server (zero imports; `@liaoliaots/nestjs-redis` is used)
- Removed `pnpm@9.0.5` from root devDependencies (should be installed globally)
- Moved `tsup` from root `dependencies` → `devDependencies`

**Step 4.2 — pnpm overrides** (see `package.json` → `pnpm.overrides`):
41 transitive overrides forcing safe versions of `minimatch`, `semver`, `micromatch`, `path-to-regexp`, `ws`, `rollup`, `tar`, `tar-fs`, `cookie`, `socket.io-parser`, `qs`, `serialize-javascript`, `lodash-es`, `markdown-it`, `fast-loops`, `picomatch`, `ip`, `defu`, `validator`, `immutable`, `flatted`, `jws`, `ajv`, `store2`, `js-yaml`, `glob`, `prismjs`, `@eslint/plugin-kit`, `formidable`, `on-headers`, `diff`, `tmp`, `@octokit/*`, `brace-expansion`, `yaml`, `nanoid`, `cross-spawn`, `multer`.

**Step 4.3 — Direct dependency bumps:**
- `nodemailer` 6→8 (SMTP command injection, DoS fixes)
- `@aws-sdk/client-s3` + `s3-request-presigner` → `^3.700.0`
- `@nestjs/jwt` 10→11 (jws HMAC verification fix)
- `@nestjs/serve-static` → `^5.0.5`
- `pug` → `^3.0.3`
- `socket.io-client` → `^4.8.1`
- `@tiptap/*` → `^2.11.0` (markdown-it ReDoS fix)
- `@commitlint/*` 17→19
- `@playwright/test` → `^1.50.0`
- `storybook` + addons → `^7.6.21` (email-components + pdf-templates)
- `@nestjs/cli` → `^10.4.9`
- `tsup` → `^8.4.0`

**Step 4.4 — Major code migrations:**

| Migration | Files changed |
|---|---|
| `xlsx@0.18.5` → `exceljs@^4.4.0` (prototype pollution + ReDoS, no OSS fix available) | `Import/sheet_utils.ts`, `Import/ImportSample.ts`, `Import/ImportFileProcess.ts`, `Import/ImportFileUpload.ts`, `FinancialStatements/common/TableSheet.ts`, `Export/ExportService.ts` |
| `mathjs` 9→15 (prototype pollution) | `FinancialStatements/common/FinancialEvaluateEquation.ts`, `FinancialStatements/modules/CashFlowStatement/CashFlow.ts` |
| `deepdash` → plain lodash helpers (eliminates `lodash-es` transitive) | `server/src/utils/deepdash.ts` (rewritten self-contained), `webapp/src/utils/deep.tsx` (rewritten self-contained) |

---

## Accepted Residual Risks (37 vulnerabilities)

These are the vulnerabilities we chose not to fix, with justification. Re-evaluate on any future audit.

### Unfixable — no patched version exists

| Package | Severity | CVE | Why accepted |
|---|---|---|---|
| `lodash@4.17.21` (3 paths, dev-only) | High / Moderate | Code injection via `_.template`, prototype pollution | Patched version listed as `>=4.18.0` **does not exist** — 4.17.21 is the latest published. Transitive via `lerna → inquirer` (dev) and `tsup → @microsoft/api-extractor` (dev). `_.template` exploit requires attacker-controlled template strings, which is not a realistic vector in these dev tooling paths. |
| `lodash-es@4.17.21` (3 paths) | High / Moderate | Same as lodash | Same unfixable status. Remaining paths: `yup@0.28.5 → lodash-es` (prod) and `@blueprintjs-formik/core → formik → lodash-es` (prod). `_.template` is not invoked by yup or formik. |

### Dev-only / build tooling — low real-world risk

| Package | Severity | Count | Why accepted |
|---|---|---|---|
| `vite@5.x` | Moderate / Low | 10 paths | Multiple `server.fs.deny` bypass variants. All in the dev server — exploitable only when `pnpm dev` is running and attacker can reach `localhost:4000`. Fix requires vite 6.x (major; affects build tooling + plugins). |
| `@babel/runtime`, `@babel/helpers`, `@babel/runtime-corejs3` | Moderate | 3 paths | ReDoS in generated regex. No user-controlled input reaches these generated regexes in this codebase. |
| `postcss@7.x` (via `stylis-rtlcss`) | Moderate | 2 paths | ReDoS / line-return parsing. Build-time only; CSS input is developer-authored, not user-supplied. |
| `esbuild@<=0.24.2` (via `tsup`) | Moderate | 1 path | Dev server can accept cross-origin requests. Not exposed publicly. |
| `webpack@<5.104.0` (via `@nestjs/cli`) | Low | 2 paths | `allowedUris` bypass in dev http plugin. Not used by this project's build. |
| `ajv@<6.14.0` | Moderate | 1 path | ReDoS via `$data` option. Transitive via `@nestjs/cli` — build-only. |
| `js-yaml@<4.1.1` | Moderate | 1 path | Prototype pollution. Transitive via `@commitlint/load` — loads only trusted commit config files. |
| `tsup@<=8.3.4` | Low | 1 path | DOM clobbering — applies to tsup's output when consumed in a browser. tsup is used only for `@bigcapital/sdk-ts` build, not delivered to browsers. |
| `@tootallnate/once` (via `lerna`) | Low | 1 path | Control flow scoping issue. Dev tooling, no exploit surface. |

### NestJS framework — blocked by major upgrade

| Package | Severity | Count | Why accepted |
|---|---|---|---|
| `@nestjs/core@10.4.7` | Moderate | 1 path | Improperly neutralizes special elements. Fix requires NestJS 11 migration (separate project). |
| `@nestjs/common@<10.4.16` | Moderate | 1 path | Same — RCE via prototype traversal. Partially mitigated in 10.4.16+, fully in 11.x. |

---

## Active Overrides

See `pnpm.overrides` in root `package.json`. Policy:

1. Any new transitive CVE should first be addressed via override.
2. If override conflicts with a consumer (install/runtime error), narrow the override scope or escalate to a direct-dep bump.
3. Review overrides on every major dependency upgrade — some may become redundant.

## Verification

```bash
pnpm install --no-frozen-lockfile
pnpm audit                         # expect ~37 findings, 0 critical
pnpm --filter @bigcapital/server test
pnpm --filter @bigcapital/webapp build
```

## Next Steps (not scheduled)

- **Vite 6** migration — closes 10 moderate/low findings.
- **NestJS 11** migration — closes 2 moderate findings.
- **React Router v6** migration — mitigated by `path-to-regexp` override; real fix is the v6 upgrade.
- **Replace `react-loadable`** (abandoned since 2018) with `@loadable/component` or `React.lazy`.
- **Replace `js-money`** (9 years stale) with `dinero.js` or `currency.js`.
- Watch for **lodash 4.18.0** release — will close the 2 remaining high findings.

---

# Data Handling Fixes

Tracks the PII / privacy / retention review. Organized by rollout batch.

## Immediate (1-line fixes + Plaid encryption)

- `Auth/exceptions/InvalidEmailPassword.exception.ts` — removed `${email}` from the error message. Fixes account-enumeration vector.
- `Auth/commands/AuthResetPassword.service.ts` — added missing `import * as moment from 'moment'` that was silently breaking the password-reset TTL check.
- `Import/ImportMulter.utils.ts` — uncommented the MIME-type `fileFilter` so import uploads are actually restricted to CSV/XLSX.
- `common/utils/fieldEncryption.ts` (new) — AES-256-GCM primitive with versioned ciphertext and idempotent encrypt. Key from `FIELD_ENCRYPTION_KEY` env (32 bytes hex).
- `BankingPlaid/models/PlaidItem.ts` — transparent field encryption for `plaidAccessToken` via Objection lifecycle hooks. Call sites still see plaintext; legacy rows pass through unchanged on read.

## Batch 1 — Quick wins

- `console.log(error)` → `Logger.error(...)` in `PlaidFetchTransactionsJob`, `AuthMail.subscriber`, `StripePaymentWebhooks.controller`.
- Stripe webhook no longer reflects `err.message` — returns generic 400/500 strings, details logged server-side only.
- `SystemUser.$formatJson` added — strips `password` and `verifyToken` from any serialization path (defense in depth).
- `CreateCurrency.service.ts` — replaced `insert({ ...dto })` with explicit field destructure so new DTO fields don't silently become DB columns.
- `Attachment.dto.ts` — `modelRef` gated by a runtime validator against the `@InjectAttachable` registry (always in sync with decorators).
- `@MaxLength` bounds added across `ContactAddress.dto.ts` (16 fields), `CreateCustomer.dto.ts` (`website`, `note`), `CreateBankTransaction.dto.ts` (`description`, `transactionNumber`, `referenceNo`, etc).
- `Attachments.controller.ts` — `FileInterceptor` now has `limits.fileSize = 10 MB`, a MIME whitelist, and filename sanitization (`path.basename` + `[^\w.\-]` → `_`).
- `App.module.ts` BullMQ — `defaultJobOptions.removeOnComplete` / `removeOnFail` added to bound Redis growth and PII retention.

## Batch 2 — Config defaults

- `common/config/mail.ts` — `secure` default flipped to `true`. Opt-out via `MAIL_SECURE=false` (dev only).
- `common/config/redis.ts` + `queue.ts` — added `tls` option, gated by `REDIS_TLS=true` env. Also wired previously-ignored `password` and `db` config keys into the actual Redis client factory in `App.module`.

## Batch 3 — Scheduled cleanup

- `common/config/resetPassword.ts` (new) — registers `resetPasswordSeconds` (default 3600) that the reset-password service was reading but never finding. Tokens can now actually expire.
- `Auth/jobs/PasswordResetCleanup.job.ts` — hourly sweep of expired `password_resets` rows.
- `UsersModule/jobs/UserInviteCleanup.job.ts` — daily sweep of `user_invites` older than 24h (matches the `notExpired` model modifier).

## Batch 4 — Audit logging (complete, 6 sub-PRs)

See `docs/AUDIT-LOGGING-DESIGN.md` for the full design. Summary:

- **Schema**: `audit_logs` (tenant DB) + `system_audit_logs` (system DB) + `tenants.audit_log_retention_days` override column. Indexes on `created_at`, `(user_id, created_at)`, `(action, created_at)`.
- **Write path**: `AuditLogService.record()` (sync, low-freq) and `.queue()` (buffered + batched via BullMQ `AuditLogBatchQueue`, for `api_key.used` every-request logging). Metadata redacted by `AuditLog.redaction.ts` — sensitive-key regex (`password|token|secret|apikey|hash|cvv|pin|authorization|bearer`), 1 KB value truncate, 4 KB payload cap.
- **CLS integration**: `ip` + `userAgent` populated by `UserIpInterceptor`; `userId` populated by auth guards.
- **Subscribers** (14 events wired): Auth (login success/failure/signup/verify/password reset), User (invite/activate/deactivate/delete), Payment (Stripe checkout/account), Plaid (item created/transactions synced), API keys (created/revoked/used).
- **Retention**: 180-day global default, per-tenant overridable. `AuditLogCleanupJob` + `SystemAuditLogCleanupJob` run daily at 2 AM.
- **Read API**: `GET /api/audit-logs` (CASL `read AuditLog`) and `GET /api/system-audit-logs` (email-allowlist `SystemAdminGuard`). Paginated, filterable by indexed columns. Metadata re-redacted on read.
- **Kill switch**: `AUDIT_LOG_ENABLED=false`.

## New env vars introduced

| Variable | Purpose | Default |
|---|---|---|
| `FIELD_ENCRYPTION_KEY` | 32-byte hex key for `fieldEncryption.ts` | none — required for Plaid token writes |
| `RESET_PASSWORD_SECONDS` | Password-reset token TTL | `3600` |
| `AUDIT_LOG_ENABLED` | Audit-log kill switch | `true` |
| `AUDIT_LOG_RETENTION_DAYS` | Global audit-log retention | `180` |
| `SYSTEM_ADMIN_EMAILS` | Comma-separated allowlist for `/api/system-audit-logs` | empty (fail-closed) |
| `MAIL_SECURE` | SMTP TLS | `true` (was `false`) |
| `REDIS_TLS` | Redis / BullMQ TLS | `false` (opt-in) |

## Quality-review follow-up (post-Batch 4)

A self-review of the audit-logging module surfaced 16 issues (2 HIGH, 5 MED, 9 LOW). All resolved in-place. Notable fixes worth remembering:

- **HIGH — `AuditLogBatchBuffer` shutdown data loss**: `onModuleDestroy` now awaits the in-flight flush promise before the final direct-write. Previously a re-entrancy guard made the final flush a no-op when shutdown raced the interval.
- **HIGH — `AuditLogBatchBuffer` unbounded growth under backpressure**: added `AUDIT_LOG_BUFFER_HARD_CAP = 10_000`; events past the cap are dropped with a counter log. Size-triggered flushes during an in-flight flush now chain a follow-up via `pendingChainedFlush` instead of dropping the signal.
- **MED — `AuditLogService` record/queue prep duplication**: extracted `buildRow()` and `safeRedact()` so both paths share redaction + CLS read + resourceId stringification. Closed an inconsistency where `queue()` silently dropped oversize metadata while `record()` logged it.
- **MED — `AuditLogReadService.sanitize()` mutation**: now returns a shallow copy instead of mutating the Objection model in place.
- **MED — Subscriber duplication**: each subscriber (`UserAudit`, `PaymentAudit`, `PlaidAudit`, `ApiKeyAudit`) now uses a private helper factory so repeating the `record()` shape across 2–3 handlers collapses to one per-category helper.
- **LOW — `fieldEncryption.getKey()`**: memoized after first successful load, with re-parse on env change and a `_resetKeyCacheForTests()` hook.
- **LOW — Typing tightened**: `any` casts in `applyCommonFilters`, subscriber payloads, and Objection bulk inserts replaced with narrow types (`QueryBuilder<...>`, local payload interfaces, `Partial<SystemAuditLog>[]`).

See `.claude/CLAUDE.md` → "Code Patterns & Conventions" for the reusable patterns that emerged.

## Efficiency-review follow-up (post-quality-review)

A pass focused on computational efficiency and resource management surfaced 9 findings (3 MED, 6 LOW). All closed — three as real fixes, the rest with a mix of fixes and in-code comments explaining why they're intentionally deferred. Notable outcomes:

- **MED — `AuditLogCleanupJob` sequential tenant sweep → bounded parallelism.** Added `TENANT_SWEEP_CONCURRENCY = 8`; tenants now swept in slices via `Promise.all`. Per-tenant errors are caught locally so one bad tenant doesn't block the rest. Wall-clock time scales with `tenants / 8` instead of `tenants`.
- **MED — `AuditLogCleanupJob` unbounded `DELETE` → chunked delete.** `chunkedDelete()` loops `DELETE ... LIMIT 10_000` until a short chunk comes back. Bounds per-statement lock time and binlog growth, so a large first-run backlog doesn't cause replication lag. Pool bumped to `max: 2` so chunks reuse a connection.
- **MED — `SystemAdminGuard` redundant DB lookup per request → JWT fast path.** Reads the email from `request.user.sub` (Passport attaches the JWT payload there) and skips the `findById` for JWT-auth'd admins. Only API-key-auth'd admins still hit the DB. Allowlist Set is now memoized, re-parsed only when the underlying env-backed config value changes.
- **LOW — `GenerateApiKey.generate()` / `.revoke()` sequential awaits → parallel.** Independent tenant+user (+revoke-patch in the revoke path) reads now fire via `Promise.all`.
- **LOW — Read-path redaction overhead → `redactStoredMetadata()` variant.** New read-only variant skips the write-side `JSON.stringify` + size-check, since stored metadata is already ≤ `MAX_PAYLOAD_BYTES`. Roughly halves sanitize CPU at the 100-row page cap.
- **Deferred with in-code rationale** (LOW): Objection `.page()` COUNT cost, buffer swap-and-replace allocation, double-serialize on write. Each now has an inline comment explaining why no change today and what the trigger for revisiting is.

No resource-disposal issues found. Connection lifecycles (Knex per-tenant builder in the cleanup job, BullMQ worker, cipher instances) all have correct `finally`/lifecycle cleanup.

See `.claude/CLAUDE.md` → "Code Patterns & Conventions" for reusable patterns added in this round (bounded-concurrency fan-out, chunked deletes, JWT fast-path for email-based guards).

## Function-design review (post-efficiency-review)

A design-level review of function signatures, lengths, and side-effect cleanliness in the session's code surfaced 6 findings (2 MED, 4 LOW). All closed as real fixes — no deferrals.

- **MED — `AuditLogBatchBuffer.flush(preferDirectWrite)` boolean flag → split.** The flag picked between BullMQ-enqueue and direct-write paths. Split into `flush()` (BullMQ-preferred with fallback) and `flushDirect()` (sync-only, used by `onModuleDestroy`). Factored the common drain/log/error-catch loop into a `runFlush(writer)` helper plus small `drainBatch()`, `hasWorkToFlush()`, `logDroppedIfAny()`, `consumeChainedFlush()` helpers. The 64-line method is gone; each replacement is ~15 lines with a single code path.
- **MED — `attachmentFileFilter` mixing MIME filter with filename sanitization → split.** The multer `fileFilter` callback is now pure accept/reject. New `sanitizeUploadedFilename(file)` handles the path-scrubbing step, invoked explicitly at the top of the `uploadAttachment` handler. Each function has one job and is independently testable.
- **LOW — `redactRecursive(value, keyIsSensitive)` flag parameter → decision at the site.** The sensitivity check moved into the object-traversal branch where the key name is actually available. Function signature is `redactRecursive(value)` only; both call sites updated.
- **LOW — `AuditLogService.readRequestContext` → `resolveRequestContext`.** Name now matches the "merge caller input with CLS defaults" behavior.
- **LOW — `SystemAdminGuard.resolveEmail` → `lookupEmail`.** `lookup` prefix surfaces the potential DB hit (non-JWT auth paths).
- Three additional suspected issues re-examined and confirmed fine: subscriber helper `action: string` labels (not flag parameters — same code path, different labels), `signin()` write-side event emit (name implies state change, so event-emit is expected), multer callback contract (library-imposed, not a design choice we can change).

See `.claude/CLAUDE.md` → "Code Patterns & Conventions" for the reusable patterns added (no-boolean-flags, one-job-per-function, put-decisions-at-the-site, naming-for-I/O-cost).

## Auth review (post-function-design)

Targeted auth review of the session's code surfaced 10 findings (3 HIGH, 4 MED, 2 LOW, 2 REFUTED after verification). Notable outcomes:

- **HIGH — `GenerateApiKey.revoke()` IDOR.** `patch({ revokedAt }).findById(apiKeyId)` had no tenant filter; any authenticated user could revoke any API key by guessing the numeric id. Fixed: patch now runs as `.patch(...).where({ id, tenantId: currentTenant.id })` with `numUpdated === 0 → NotFoundException`. 404 shape is identical for "doesn't exist" and "not yours" — no cross-tenant existence oracle.
- **HIGH — Attachments IDOR across three services.** `GetAttachment`, `DeleteAttachment`, `GetAttachmentPresignedUrl` all took a raw S3 key from the URL and hit S3 without a tenant check. S3 keys are global, so an attacker who knew a key from another tenant could download / delete / mint URLs for it. Fixed: every path now runs `documentModel().query().findOne({ key })` first (tenant-scoped via Knex proxy) and throws `NotFoundException` before any S3 call. `DeleteAttachment` additionally had its ownership check reordered to run BEFORE the S3 `DeleteObject`.
- **HIGH (REFUTED) — `revoked` vs `revokedAt` mismatch.** `ApiKeyModel` has a `get revoked()` virtual + `virtualAttributes: ['revoked']`. The authorization check works correctly.
- **HIGH (REFUTED) — Rate limit on `/signin`.** `Auth.controller.ts` already carries `@Throttle({ auth: {} })`.
- **MED — Signin timing + audit-data enumeration oracle.** User-not-found skipped bcrypt (timing leak); `auth.login.failed` payload carried `reason` + populated `userId` (admin-queryable leak). Fixed: module-scope `DUMMY_BCRYPT_HASH` is compared in the user-not-found branch so both failure paths take ~the same wall-clock time. The event payload is now `{ email }` only; the audit row has `userId: null` and no `reason`. Server-side `Logger.debug` retains the distinction for forensics.
- **MED — `SystemAdminGuard` DB hit on API-key auth path.** Added a 30-second TTL + 128-entry LRU cache for `userId → email`. JWT fast-path unchanged (still zero DB hits).
- **MED — `AuditLogController` guard-ordering dependency.** `PermissionGuard` requires `AuthorizationGuard` to have run first (to populate `request.ability`). Previously implicit via the global guard pipeline; now explicit as `@UseGuards(AuthorizationGuard, PermissionGuard)` at the controller.
- **MED — Upload-route amplification.** `POST /attachments` accepted a 10 MB body before the MIME filter rejected. Added `@Throttle({ default: { limit: 30, ttl: 60_000 } })` to bound abuse.
- **LOW — Plaintext admin allowlist.** `SYSTEM_ADMIN_EMAILS` documented as a credential-class secret until a DB-backed `system_roles` migration lands.
- **LOW — `tenantId` filter existence check.** Flagged in an inline comment for the future if the route ever loses admin-only gating.

## Error-handling review (post-auth)

14 findings (1 HIGH, 5 MED, 8 LOW). Real fixes landed for HIGH/MED + attachment-IDOR logging + Plaid decrypt error; LOW items annotated in-code with TODOs or docstring updates.

- **HIGH — `AuditLogBatchBuffer` silent `.catch(() => {})` in three sites** (interval timer, size-trigger, chained flush). Routed through a shared `logUnexpectedFlushError(site, err)` that logs `.error` with the stack and a site label.
- **MED — `AuthSignin.emitLoginFailed` silent swallow.** Now `.warn`s the subscriber fault without rethrowing — audit-trail holes are visible in logs.
- **MED — `onModuleDestroy` in-flight wait silent catch.** Logs `.warn` so contract drift (if `runFlush` stops catching internally) is visible.
- **MED — `AuthMail.subscriber` missing email in failure log.** Now includes `email=...` so ops can identify affected users for manual re-sends after a queue outage.
- **MED — `AuditLogService.record` error log missing context.** Now includes `scope=` and `resourceType=` in the message.
- **LOW→fixed — Attachment IDOR rejections had no server log.** All three attachment services now `.warn` with `key=... userId=...` before throwing 404. Cross-tenant probing is now a visible signal.
- **LOW→fixed — Plaid decrypt failure could surface as raw 500.** Added `PlaidAccessTokenDecryptError` typed error class and a try/catch in `PlaidItem.$parseDatabaseJson`. Logs the row id; never logs ciphertext. Application layer can now special-case (disable Plaid item, surface structured error).
- **LOW (annotated)** — Plaid structured-error-field extraction (TODO), BullMQ retry policy documentation (docstring TODO), Knex destroy error shadowing (inline TODO), `sanitize()` fail-fast behavior (docstring clarified as intentional), subscriber "no-throw" invariant (noted at the top of each of the 5 `AuditLog/subscribers/*.subscriber.ts` files).

## Open items from the data-handling review

None. All items from the original review were addressed across Batches 1–4; the quality-review, efficiency-review, function-design-review, auth-review, and error-handling-review self-audits are also closed. Future additions to this section should follow the same format (location, risk, fix).

## Follow-up finding — 2026-04-15

### Signin request shape confirmation

Surfaced during audit-log endpoint verification when a bad-login probe (`POST /api/auth/signin`) returned 401 with no `loginFailed` audit row. Root cause of the missing row was split into two pieces and worth recording separately so the next engineer doesn't re-investigate.

- **Expected request body for `POST /api/auth/signin`:** `{ "email": "...", "password": "..." }`. Confirmed in `packages/server/src/modules/Auth/dtos/AuthSignin.dto.ts` (fields `email: string`, `password: string`, both `@IsNotEmpty() @IsString()`) and `packages/server/src/modules/Auth/strategies/Local.strategy.ts` (passport-local configured with `usernameField: 'email'`).
- **Wrong field names (e.g. `credential`, `crediential`, `username`) are rejected by `LocalAuthGuard` before `AuthSigninService.signin()` ever runs.** The guard short-circuits at 401 "Unauthorized" with no invocation of the service body. Since the `events.auth.loginFailed` emission lives inside the service (not in the guard), a malformed-body probe never reaches the emit site and therefore produces no audit row — *this is correct behavior, not an audit-wiring bug.*
- **Separate open work (not fixed by this finding):** the emission site itself still needs to be re-added to `AuthSigninService` (and the corresponding subscriber payload-shape hardening applied per CLAUDE.md's "No enumeration signal in failure audit rows" pattern). That's tracked in the out-of-scope list on PR #2.
- **Test fixture reminder:** any future integration test or manual verification of the failed-login audit path must use the exact request body `{"email":"...","password":"<wrong>"}` — not `{"credential":...}` — or the probe will 401 at the guard without exercising the service.
