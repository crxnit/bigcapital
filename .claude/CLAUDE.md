# Claude Code Settings for Bigcapital

## Environment

- **Node**: 18.16.1 — run `nvm use 18.16.1` before any npm/pnpm/node command.
- **Package manager**: `pnpm`. **Never** use `pnpx` / `pnpm dlx` in committed hooks or scripts (both ignore lockfile). Use `pnpm exec <bin>`.
- **Tooling deps stay Node-18-compatible** (run `pnpm exec <bin> --version` after any tooling install — ES-module Node-version errors fire on import):
  - `@commitlint/cli@^17` (v19+ → yargs-parser@22 → Node 20+)
  - `lint-staged@^15` (v16+ → listr2@10 → `node:util.styleText` → Node 20+)
  - Same trap likely lurks in future bumps of husky/prettier/eslint plugins.

## Commits & Hooks

- **`.husky/pre-commit`**: `pnpm exec lint-staged` → Prettier (each package's local `.prettierrc` auto-resolved by Prettier).
- **`.husky/commit-msg`**: `pnpm exec commitlint --edit "$1"` — Conventional Commits enforced.
- Husky hooks are tracked at mode 100755.
- **`scope-enum` is restricted** (edit `commitlint.config.js` to add — don't `--no-verify`):
  - Workspace: `server`, `webapp`, `utils`, `email-components`, `pdf-templates`, `sdk-ts`.
  - Domain: `accounts`, `banking`, `ci`, `contacts`, `currency`, `docker`, `docs`, `expenses`, `financial-statements`, `husky`, `import`, `infra`, `inventory`, `ledger`, `models`, `organization`, `payment-received`, `payments`, `reports`, `resource`, `sandbox`, `square`, `square-pull`, `ui`. Use `payments` for cross-cutting payment work; `payment-received` is AR-only.

---

# Fork-Specific Changes

Diverges from upstream `bigcapitalhq/bigcapital`. Full post-mortems live in `docs/FORK-BUG-HISTORY.md`. This file keeps the **active rules** (things you must obey when writing new code) and a feature-summary index.

## Features added

Brief index — read the linked code or `FORK-BUG-HISTORY.md` for design detail.

- **Bulk activate/inactivate accounts** — `POST /accounts/bulk-{activate,inactivate}` + UI.
- **Edit categorization on bank transactions** — `PATCH /banking/categorize/:id` rewrites GL when account or type changes. "Edit Category" context menu.
- **Parent account name + code in CSV export** — `parentAccountName`/`parentAccountCode` on `AccountTransformer`.
- **Accounts import: parent-child resolution** — Two-pass via `afterImport()` on `Importable`; `relationImportMatchDeferred` field-meta flag skips DB lookup at parse time; resolves by id/name/code post-insert.
- **Stripped seed accounts** — `SeedAccounts` contains only required predefined accounts. Drawings code 30003 → 30004 (was duplicate of Owner's Equity).
- **Split-payment expenses + percent-based category allocation** — Multi-account payment per expense; categories allocate by percent OR fixed dollar. Tables: `expense_payment_splits`, `expense_transaction_categories.amount_type`/`percent`. Validator tolerance `0.005 + 0.005 × N_percent_rows`. Header `paymentAccountId` is denormalized primary for list views. **PDF/CSV show only primary (intentional v1).** **Run tenant migrations on deploy.**
- **Split-payment-aware bank transaction matching** — Each split is an independent match candidate via `matched_bank_transactions.reference_sub_id` → `expense_payment_splits.id`. `GetMatchedTransactionsByExpenses` filters by the bank txn's account (was showing bank-side expenses on CC). Unmatch per-split. Form preserves split `id` for `upsertGraph` in-place update.
- **Square integration** — OAuth, setup wizard, HMAC webhooks, SaleReceipt/CreditNote/ManualJournal posting. Phase 1 done; Phase 2 partial (payment handler done; refund/payout/customer pending); Phase 3 (180-day backfill + Plaid auto-match) planned. See `docs/SQUARE-INTEGRATION.md`.
- **Bidirectional cashflow categorization for refunds** — `OtherIncome` ↔ `OtherExpense` work in either direction (deposit-as-OtherExpense = vendor refund reducing expense; withdrawal-as-OtherIncome = customer refund reducing income). Owner/Transfer pairs already model both directions, so they keep direction match. Sub-form labels direction-aware via `autofillCategorizeValues.isDepositTransaction`.
- **Reconcile aside accepts equity accounts** — Owner Drawings / Owner Contribution on the leftover-amount cashflow transaction. Category dropdown allows `equity` both directions; `transformToReq` maps via `account_root_type` → `owner_drawing` (withdrawal) or `owner_contribution` (deposit). Unblocks "owner withdrew $1200, used $1176.47 for expense, kept $23.53."
- **Bill direct-account allocations** — Bill carries direct expense allocations alongside/instead of items. `bill_expense_categories` table; `Bill.categories` HasMany; `total` getter adds `categoriesTotal`. GL: DR per category against expense account, AP CR sums items + categories. Submit allows empty `entries` if categories non-empty (and vice versa). `DeleteBill` cascades. **Run tenant migrations.** v1 scope: no percent amounts, no landed-cost, no CSV import, no PDF/CSV inclusion.
- **Vendor credit direct-account allocations** — Mirror of bills (opposite GL direction: CR per category). `vendor_credit_expense_categories`; same patterns.
- **Invoice direct-account allocations** — Revenue-side mirror. `sale_invoice_income_categories`; `SaleInvoice.categories` + `categoriesTotal` virtual; transformer writes `itemsTotal + categoriesTotal` into `balance`. GL: CR per category against income account at indexGroup 15 (between items at 10, tax at 30); AR DR sums both. `GetSaleInvoice` MUST `.withGraphFetched('categories.incomeAccount')` AND transformer MUST expose `categories` — without **both**, edit form hydrates empty and next save's `upsertGraphAndFetch` deletes every row (data destruction; caught in QA, fixed `877284f72`).
- **Credit note direct-account income allocations** — AR-side mirror of invoice. `credit_note_income_categories`. **GL direction reversed vs invoice**: DR per category against income account (credit note reverses the invoice's CR). Transformer writes `itemsTotal + categoriesTotal` into `amount` (`total` unchanged). Same hydrate-empty-deletes-rows trap if `withGraphFetched` + transformer field aren't both wired.
- **Shared allocations helpers** — All four allocation types (Bill / VendorCredit / SaleInvoice / CreditNote) now share code. **Add new allocation types here, don't clone.**
  - Server `packages/server/src/modules/_shared/allocations/AllocationCategory.helpers.ts`: `normalizeAllocationCategories`, `validateAllocationAtLeastOneLine`, `validateAllocationCategoryAccountsType`, `mapAllocationLedgerEntries`.
  - Webapp `packages/webapp/src/containers/_shared/Allocations/`: `AllocationsCategoriesEditor`/`Table` (parametrised by `accountField` / `accountRootType` / `labelKey`), `utils.ts`, `schema.ts`.
  - **Pitfall**: `AllocationsCategoriesTable` is NOT form-context-aware — every caller must pass `accounts={accounts}` (sourced from its form provider's `useAccounts({ page_size: 10000 })`). Omit and the account dropdown silently renders empty.
  - Per-form `utils`/`schema` keep one-line wrappers so each form's public surface is unchanged.
  - `AccountNormal` now imported consistently from `@/modules/Accounts/Accounts.types` (re-exports the single definition in `@/interfaces/Account`).

## Active gotchas (rules to follow)

Full post-mortems in `docs/FORK-BUG-HISTORY.md`. These are the rules — break them and recreate the bug.

### Server / NestJS

- **`SerializeInterceptor` mutates inbound `request.body` + `request.query` snake→camelCase.** New webhook handlers (Square/Stripe/Plaid/…) MUST read camelCase keys (`merchantId`, not `merchant_id`). `req.rawBody` still holds original bytes for HMAC verification.
- **`require('@/...')` does NOT resolve at runtime in Objection `relationMappings`.** The `@/` alias is compile-time `import` rewrite only. Use relative paths inside `static get relationMappings()`.
- **`filterSupportFeatures` is async — `await` it.** Path goes through async `getResourceFields2(...)`. Non-awaited Promises are truthy and silently keep Branch/Warehouse fields required.
- **New importables need `@ImportableService({ name })`.** Use the literal resource string the webapp sends if it differs from the model class. Sanity check: `grep -L '@ImportableService' packages/server/src/modules/**/*Importable*.ts` should print nothing.
- **Resource-name aliases**: webapp string ≠ model class name (e.g. `PaymentReceive` vs `PaymentReceived` model) → add to `RESOURCE_NAME_ALIASES` in `Resource/_utils.ts`. Don't rename the model.
- **`Scope.TRANSIENT` + property injection + class-field arrow methods is a Nest trap.** Symptom: `<prop>.<method> is not a function` at runtime. Nest's TRANSIENT proxy wrapper exposes a value lacking instance methods. **Default for new services: constructor injection (`constructor(@Inject(X) private x: X) {}`), default singleton scope.** Tenant model proxies are CLS-aware factories — singleton consumers still resolve per-tenant. If TRANSIENT is truly needed, declare methods as `public foo(...)` (prototype), not class-field arrows.

### Knex / MariaDB

- **MariaDB on Linux is case-sensitive for table names.** `knexSnakeCaseMappers({ upperCase: true })` emits UPPER CASE — actual tables are `SQUARE_CONNECTIONS`, `EXPENSE_PAYMENT_SPLITS`, etc. Use uppercase in mysql CLI.
- **Knex unique/index names overshoot MySQL's 64-char limit** due to UPPER-CASE mapping. Pass explicit short name: `table.unique([cols], 'uq_short_name')`.
- **Stuck migration lock**: `UPDATE knex_migrations_lock SET is_locked = 0;` on the affected tenant DB.
- **Vendor/customer empty `code` constraint**: `CONTACTS_CODE_UNIQUE` rejects second `''` (MySQL treats `''` as duplicate, `NULL` as non-duplicate). DTOs coerce falsy `code` → `null` before insert/update. Existing rows: `UPDATE CONTACTS SET CODE = NULL WHERE CODE = '';`.
- **Never `whereRaw` with literal table/column names.** Bypasses `snakeCaseMappers({ upperCase: true })`. Use `whereColumn('a.col', 'b.col')`, `?? = ??` bindings, or structured `.where()`/`.whereNull()`. Same rule for `joinRaw`/`select(knex.raw(...))` with literal identifiers. Worst version of this bug: callers wrapped in `PromisePool` (e.g. `GetMatchedTransactions.service.ts`) silently swallow per-task errors → 200 OK with missing rows, no 500, no log.
- **Raw-SQL `static get modifiers` entries silently fail when chained with `withGraphJoined` inside a PromisePool task.** Specific shape of the above. A `dueBills` modifier using `raw('COALESCE(AMOUNT,0)-... > 0')` works alone but throws when chained with `withGraphJoined('matchedBankTransaction')` — PromisePool swallows it, panel returns empty 200. **When you need a "remaining due" filter inside a service that already calls `withGraphJoined`, filter on the model virtual in JS after the query** — or rewrite the modifier with `??` identifier bindings. Commits `83c4545fd` → `bc3dfeef2`.
- **Never run parallel writes on a Knex transaction.** Knex `trx` is not concurrency-safe — parallel `INSERT`s produce non-deterministic per-row failures the mysql2 driver surfaces as transient errors. **Never use `async.queue` without an error handler** — fire-and-forget swallows per-task failures; `await queue.drain()` resolves regardless. Combined: bad row vanishes silently, UoW commits, only symptom is a trial-balance imbalance weeks later. Use sequential `for…await` for per-row writes that must all succeed. Any "queue with concurrency > 1 inside a UoW trx" is suspect by default.
- **`UnitOfWork.withTransaction` must `await` both `commit()` and `rollback()`.** Already correct in `Tenancy/TenancyDB/UnitOfWork.service.ts` — keep it that way.
- **Trial-balance audit recipe**: `SELECT REFERENCE_TYPE, REFERENCE_ID, SUM(DEBIT)-SUM(CREDIT) AS diff FROM ACCOUNTS_TRANSACTIONS GROUP BY 1, 2 HAVING ABS(SUM(DEBIT)-SUM(CREDIT)) > 0.005` names every unbalanced (transaction, leg-set) in one query. Join `ITEMS_ENTRIES` (or relevant child) on `(REFERENCE_ID, ITEM_ID, ACCOUNT_ID)` for missing legs.

### Cascading deletes (service-layer pattern)

- **Pattern is service-side cascade**, NOT DB-level `ON DELETE CASCADE`. Explicit `.where('parentId', id).delete()` lines inside the parent's UoW trx. Precedent: `expense_transaction_categories`, `expense_payment_splits`.
- **When adding a child table, audit the parent's Delete service.** Missing line = 500 with FK violation. Paired with a backfill migration, every parent gets a child → bug is universal from day one, not just on "real" data.
- **Audit transitively.** When a subscriber cleans up an intermediate row (e.g. `DeleteUncategorizedTransactionsOnAccountDeleting` deletes `uncategorized_cashflow_transactions` during account delete), every table whose FK points at the intermediate row (`matched_bank_transactions.uncategorized_transaction_id`, `recognized_bank_transactions.uncategorized_transaction_id`) must clear first in the same trx. Nest's event-emitter wraps subscribers in try/catch and only logs failures — inner FK error surfaces as a confusing _outer_ FK on the next delete. Grep `oldAccount`/`onDelete` subscribers when adding tables referencing uncategorized/match/recognized rows.

### Bank transaction matching

- **Direction filter** in `GetMatchedTransactions.service.ts`, inferred from first uncategorized txn's amount sign:
  - Withdrawals (`amount < 0`, e.g. CC charge): hide SaleInvoice candidates.
  - Deposits (`amount > 0`): hide Bill and Expense candidates.
  - Cashflow and ManualJournal: both directions.
- **Cashflow additionally scopes by account**: `cashflowAccountId = filter.paymentAccountId` so transfers/owner drawings on unrelated accounts don't pollute the list.
- **Candidate `amount` field must be `dueAmount`** (not gross `amount`). Webapp's `useGetPendingAmountMatched` and server's `sumMatchTranasctions` both sum `item.amount`; gross candidates never balance for partial-paid records.
- **New candidate types need all three**: direction allowlist in `getMatchedTransactions`, `dueAmount` in transformer's `amount(record)`, per-account scope where applicable. Commits `74b8cf8bb` + `83c4545fd` + `bc3dfeef2`.

### Cash-basis financial reports

- **Must both exclude accrual-only document GL AND synthesize from payment events.** `PaymentReceive` / `BillPayment` GL only moves cash ↔ AR/AP — neither touches revenue/expense. Dropping `SaleInvoice`/`Bill`/`CreditNote`/`VendorCredit` rows alone leaves cash-basis revenue at zero.
- **Pattern** (see `FinancialStatements/_shared/CashBasisProjection.{service,helpers}.ts` and `ProfitLossSheetRepository.cashBasisAccountsTotal`): when `basis === 'cash'`, run existing query with `whereNotIn('referenceType', ACCRUAL_ONLY_REFERENCE_TYPES)`, then union with synthetic rows from `PaymentReceive`/`BillPayment`/`RefundCreditNote`/`RefundVendorCredit` at payment date, prorated `payment_amount / document.total` per line.
- **Sibling reports** (Balance Sheet, General Ledger, Cash Flow, Sales Tax Liability Summary) accept the flag but still ignore it. Pattern lifts onto each repository but each has quirks (BS: same projection + zero AR/AP; SalesTaxLiabilitySummary: tax-line proration).
- **Adding a new report that accepts `basis` without applying this pattern silently makes the toggle a no-op** — grep `basis` in the new repo and confirm both the `whereNotIn` filter AND the projection union.

### CSV import

- **CSV enum fields**: emit lowercase key (`service`, `inventory`, `non-inventory`, …), NOT localized label. Row parser matches `option.key` case-insensitively.
- **`CustomersImportable` does NOT dedupe by Display Name** — re-uploading customers.csv doubles the contact list. Items / invoices / invoice_payments / receipts are safe (collisions silently skip); customers is NOT. If duplicates land, run the `MERGE + DELETE` SQL pass against `CONTACTS`.

### Webapp / forms

- **`FSelect` dropdowns (and `AccountsListFieldCell`) filter in-memory** — form provider MUST request `page_size: 10000` (or similar) on `useVendors` / `useCustomers` / `useAccounts` / `useItems` / `useBranches` / `useProjects` / `useWarehouses` / `useTaxRates` and every other list hook feeding a select. Symptom isn't just an unsearchable dropdown: an already-selected id whose record lives past page 1 renders as an **empty dropdown row** (no label found), and on edit-form re-open looks like "the value got deleted." Commit `3b6d4b105` covers `useAccounts` for payment-splits/categories pickers. When adding/auditing a form provider, grep every `useXxx(` call for empty/missing `page_size`.
- **`FDateInput` call sites must spread `momentFormatter('MM/DD/YYYY')`** — upstream `@blueprintjs-formik/datetime` defaults serialize via `Date.toISOString()` and parse via `new Date(str)`, both crossing local↔UTC and shifting calendar day in any non-UTC client. `momentFormatter` (in `packages/webapp/src/utils/index.tsx`) overrides `formFormatDate`/`formParseDate` to round-trip as tz-free `YYYY-MM-DD` (parser slices first 10 chars so server ISO responses survive). Omitting the spread silently re-introduces day-shift across invoices, money in/out, expenses, etc. Sanity check: `grep -L 'momentFormatter' <file>` for any file touching `FDateInput`.
- **moment.js `MM` vs `mm`**: `MM` = month, `mm` = minutes. `HH:MM` silently renders current month as the minute (was the long-standing financial-report footer bug).

## Conventions

- **Naming**:
  - Containers: `bigcapital-fork-*` (staging), `bigcapital-sandbox-*` (sandbox).
  - Image tags: `:uat-v*` (staging), `:sandbox-v*` (sandbox).
  - Networks: `bigcapital_fork_network` + volumes `bigcapital_prod_fork_*` (staging); `bigcapital_sandbox_network` + volumes `bigcapital_sandbox_*` (sandbox). Both attach public-facing containers to external `portal-net`.
- **i18n labels**: Title Case for headers/labels ("Payment Date", not "Payment date"). "Note" not "Statement" for memo fields. "Reference No." consistently.
- **Date format on financial reports**: single source = tenant Preferences → General → Date Format. Server's `FinancialSheetMeta.meta()` exposes as `dateFormat` (→ `date_format` snake on webapp). Shared `FinancialSheet.tsx` footer reads `meta?.date_format`. **Never hardcode a date format in a report container.**

---

# Deployment

Production and UAT run via Docker (`docker-compose.prod.yml`). Traefik handles TLS, OAuth forward-auth, and routing between NestJS API and Vite SPA.

**Full guide: `docs/DEPLOY.md`.** **CI/CD runbook: `docs/CI-CD.md`.**

## Push-to-deploy (GHCR — sandbox + UAT)

`git push origin develop` → `.github/workflows/deploy.yml` builds linux/arm64 images for `server` + `webapp` → pushes to `ghcr.io/crxnit/bigcapital-{server,webapp}:sha-<short>` → Trivy HIGH/CRITICAL gate → SSH into VPS → `deploy.sh` pulls, runs tenant migration, brings up server+webapp with `/api/health` smoke gate.

- **Sandbox + UAT both auto-deploy on push to `develop`, in sequence**: sandbox first; UAT only if sandbox's `/api/health` smoke gate (and every earlier step) passes. Sandbox remains the safety net — a regression that fails sandbox's smoke step skips UAT entirely. **Docs-only pushes don't deploy** — `deploy.yml` has `paths-ignore: docs/**, **/*.md, archive/**`, so a push touching only Markdown (incl. `.claude/CLAUDE.md`) triggers no run. Mix code + docs in one push to deploy both.
- **Manual single-env dispatch** is still available for redeploys without a new commit (e.g. after a `.env` change): `gh workflow run deploy.yml -f environment={sandbox|uat}`. If `gh workflow run` can't resolve by name, dispatch by ID: `gh api -X POST repos/crxnit/bigcapital/actions/workflows/275652569/dispatches --input - <<<'{"ref":"develop","inputs":{"environment":"uat"}}'`.
- **Legacy tarball compose files** (`docker-compose.prod.yml`, `docker/sandbox-bc/docker-compose.yml`) remain as rollback paths.

### Solo-dev workflow — no PR ceremony

Single-developer fork. Commit and push directly to `develop`; the push rides sandbox → UAT in sequence automatically. If a commit needs more human review before staging, hold off on pushing — once it's on develop it lands on UAT as soon as sandbox passes its smoke gate. Don't open a PR or cut a feature branch unless explicitly asked (e.g. risky multi-commit refactor wanting a checkpoint).

## Always-relevant deploy notes

- **Colima memory** for image builds: at least 8 GB (Webapp Vite needs ~4 GB heap alone). `colima stop && colima start --cpu 2 --memory 8 --disk 20`. OOM symptom: `ResourceExhausted: cannot allocate memory`.
- **Image tarballs** (legacy path) → `current-images/<env>/` (`staging`, `sandbox`, …). Gitignored.
- **Migration `cwd` must be `/app/packages/server`** — system migration path (`./src/database/system/migrations`) is relative to cwd.
- **API rate limit**: NestJS throttler — `THROTTLE_GLOBAL_LIMIT`/`THROTTLE_GLOBAL_TTL` (default 100/60s) and `THROTTLE_AUTH_LIMIT`/`THROTTLE_AUTH_TTL` (default 10/60s) are too strict for SPA. Set `THROTTLE_GLOBAL_LIMIT=600`, `THROTTLE_AUTH_LIMIT=60`, `TTL=60000`. Legacy `API_RATE_LIMIT` is NOT used. State in Redis — restart Redis to clear lockouts.
- **MinIO** (self-hosted S3 for attachments): `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION=us-east-1`, `S3_ENDPOINT=http://bigcapital-fork-minio:9000`, `S3_BUCKET=bigcapital-attachments`, `S3_FORCE_PATH_STYLE=true`. `createbuckets` one-shot creates bucket idempotently per `docker compose up`.
- **`docker compose restart` does NOT apply compose-file changes** — use `docker compose up -d <service>` after any compose/env update.
- **Fonts**: NotoSans + Segoe must be in `packages/webapp/public/fonts/` for production builds (Vite SCSS URL resolution doesn't hash them).
- **`GOTENBERG_DOCS_URL`** uses container name `http://bigcapital-fork-server:3000/public/` — must match `container_name` in compose.

## Traefik

- **Dynamic files**, not Docker labels. Routers, services, middlewares in `*.yml` under Traefik's watched directory. Do NOT add `traefik.*` labels to compose.
- Bigcapital containers attach to Traefik's external network. Keep `mysql`, `redis`, `gotenberg`, `database_migration` on the internal network only.
- Container names drive dynamic-file service URLs — keep `container_name:` stable.

**Routing split** (same host, path-prefix):

- `bigcapital-fork-api` (priority 10): `Host(host) && (PathPrefix('/api') || PathPrefix('/socket') || PathPrefix('/public'))` → `bigcapital-fork-server:3000`. Needs sticky cookies for Socket.IO under replica scale-out.
- `bigcapital-fork-webapp` (priority 1): `Host(host)` (catch-all SPA) → `bigcapital-fork-webapp:80`.

## OAuth pattern — network-level gate

OAuth forward-auth at Traefik edge is a **network-level access gate**, NOT identity federation:

- OAuth wraps both routers; unauth → OAuth provider redirect.
- Bigcapital's internal `AuthModule` (JWT signin/signup/password-reset) remains source of truth for identity.
- Users see two logins: OAuth once per browser session, Bigcapital signin once per JWT lifetime (1 day).
- OAuth callback centralized at `https://portal.jjocllc.com/oauth2/callback`, session cookie scoped to `.jjocllc.com` — every subdomain inherits. New subdomain = DNS + Traefik router only, no Google Cloud OAuth client change.
- Middleware chain on API + webapp routers: `oauth2-jjoc-auth`, `security-headers`, `rate-limit`, `portal-expose-email` (in `jjocllc.yml`). ACME resolver: `letsencrypt`.
- **Webhook routers** (Square, Stripe, Plaid) deliberately omit every middleware — signature verification is the auth.

## Sandbox environment

`https://sandbox.bc.jjocllc.com` mirrors staging on the same host, fully isolated at container/volume/network. Used for pre-release testing (Square Phase 2/3 land here first). Lives at `/srv/portal/clients/sandbox-bc/`. Runbook: `docker/sandbox-bc/README.md` (mysqldump + MinIO clone from staging, first boot, **post-clone Square-row wipe** since token encryption key differs).

## VPS / infra gotchas

- **cloud-init drops `<user> ALL=(ALL) NOPASSWD:ALL` into `/etc/sudoers.d/90-cloud-init-users` for every provisioned user.** A new `deploy` user inherits broad NOPASSWD sudo that defeats the targeted `command="…"` SSH lockdown — compromise of the deploy key = full root. When onboarding a new env, rewrite that file to remove the deploy user line right after SSH lockdown. Verify with `sudo -l -U deploy` — only entry should be the bigcapital-specific `(root) NOPASSWD: /srv/portal/clients/<env>/deploy.sh`.
- **`docker compose exec -T <svc> <cmd>` consumes parent shell's stdin.** Inside `while read … done <<< "$LIST"`, the inner exec eats the rest of the here-string after iteration 1 and the loop exits silently. Always pass `< /dev/null` to the exec when inside a stdin-fed loop. Bit `deploy/vps-backup.sh` — only first DB got dumped.
- **Docker compose project-prefixes network names on disk.** Logical name `bigcapital_sandbox_network` lives as `sandbox-bc_bigcapital_sandbox_network` (project prefix from dir). Don't pass logical name to `docker run --network`; resolve via `docker inspect <id> --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'`, take first token. Pattern in `deploy/vps-backup.sh`.
- **`mariadb`/`mariadb-dump` only exist in MariaDB 10.4+** — project pins `mariadb:10.2` (`docker/mariadb/Dockerfile`), which ships only legacy `mysql`/`mysqldump`. Backup/admin scripts must use legacy names.

## Open items (CI/CD bring-up, 2026-05-13)

- **Staging `.env` is missing**: `WEBAPP_BASE_URL`, `SQUARE_APPLICATION_ID`, `SQUARE_APPLICATION_SECRET`, `SQUARE_APPLICATION_ACCESS_TOKEN`, `SQUARE_ENVIRONMENT`, `SQUARE_OAUTH_REDIRECT_URL`, `SQUARE_TOKEN_ENCRYPTION_KEY`. Server runs with empty strings → Square on staging silently broken. Fix `/srv/portal/clients/staging-bc/.env` → `docker compose -f docker-compose.ghcr.yml up -d --force-recreate server`.
- **Trivy gate is warn-only.** Tighten to `exit-code: '1'` after transitive-dep cleanup: bump `@casl/ability` 5.x→6.x (CRITICAL prototype pollution), dedupe `axios` across firebase-admin/plaid/etc., move `@babel/plugin-transform-modules-systemjs` and similar dev-tools out of production install. TODO in `docs/CI-CD.md`.
- **Restic 0.12.1 on VPS** lacks compression (0.14+) and parallel prune (0.13+). Perf, not correctness.
- **Backup env-file naming inconsistency**: sandbox uses `/etc/restic/bigcapital-sandbox.env`, staging uses `/etc/restic/bigcapital-staging-bc.env` (`-bc` leaks from dir basename via fallback in `vps-backup.sh`). Cosmetic.
- **Production deploy (Phase 9)** deferred until sandbox + staging have ridden a few real commits cleanly. Same recipe, new env dir, new SSH key, new GH Environment.
- **GHCR PAT** on VPS (`/root/.docker/config.json`) expires ~2027-05-12. Set calendar reminder.
- **Bump JavaScript Actions to Node 24 before 2026-09-16.** GitHub deprecated Node 20 on 2025-09-19; force-default to Node 24 on 2026-06-02; Node 20 removed entirely on 2026-09-16. UAT deploy currently uses `actions/checkout@v4`, `docker/build-push-action@v6`, `docker/login-action@v3`, `docker/setup-buildx-action@v3` on Node 20. Early opt-in: set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` on runner or as workflow env var. Cleaner: bump each action to newest major and verify CI. Sweep all `.github/workflows/*.yml` so re-merge from upstream doesn't regress.
- **Containerd layer-extraction flake on rapid back-to-back deploys (2026-05-21).** Hit twice in one afternoon — sandbox push + UAT redeploy both failed with `failed to extract layer ... link ... no such file or directory` in overlayfs snapshotter. Retry succeeded both times. Build+push fine; failure is VPS-side `docker compose pull`. Plan: monthly `docker system prune -af` cron on both VPS envs. Recipe in `docs/CI-CD.md` → "Containerd layer-extraction flake on image pull". Not wired yet.

## Future enhancements & known gaps

See `docs/FUTURE-ENHANCEMENTS.md`: multi-organization per user, behavioral hardening (security/audit wiring). Hardening must complete before production data.

### Deferred

- **Receipts/invoices CSV import from scanning app** — Shelved pending rethink. Separate app OCRs receipts and emits paired CSVs (header + line items, linked by `receipt_id`, with Bill-vs-Expense indicator). Intended as dedicated import flow (not generic `Importable`), fuzzy-match for vendors and line items (→ Items for bills, → Accounts for expenses), fallback to "Unknown Vendor" + ad-hoc items. Open design questions: exact CSV column contract; whether expenses map line items to expense accounts or consolidate to a single category; tax handling (leading candidate: bill `adjustment` field).
