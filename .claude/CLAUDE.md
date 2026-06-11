# Claude Code Settings for Bigcapital

## Environment

- **Node** 18.16.1 — `nvm use 18.16.1` before any npm/pnpm/node command.
- **pnpm**. **Never** `pnpx` / `pnpm dlx` in committed hooks/scripts (ignores lockfile). Use `pnpm exec <bin>`.
- **Keep tooling deps Node-18-compatible** — run `pnpm exec <bin> --version` after any tooling install (ES-module Node-version errors fire on import): `@commitlint/cli@^17` (v19+ → yargs-parser@22 → Node 20+); `lint-staged@^15` (v16+ → listr2@10 → `node:util.styleText` → Node 20+). Same trap in husky/prettier/eslint bumps.

## Commits & Hooks

- **`.husky/pre-commit`**: `pnpm exec lint-staged` → Prettier (per-package `.prettierrc`; also formats staged `.claude/*.md`). **`.husky/commit-msg`**: `pnpm exec commitlint --edit "$1"` (Conventional Commits). Hooks tracked at mode 100755.
- **`type`** must be standard Conventional Commit (`build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test`) — custom types (`i18n`) rejected by `type-enum`; use `refactor`/`feat` for i18n. The restricted list is `scope`, not `type`.
- **`scope-enum` restricted** (add via `commitlint.config.js`, don't `--no-verify`):
  - Workspace: `server`, `webapp`, `utils`, `email-components`, `pdf-templates`, `sdk-ts`.
  - Domain: `accounts`, `banking`, `ci`, `contacts`, `currency`, `docker`, `docs`, `expenses`, `financial-statements`, `husky`, `import`, `infra`, `inventory`, `ledger`, `models`, `organization`, `payment-received`, `payments`, `reports`, `resource`, `sandbox`, `square`, `square-pull`, `ui`. Use `payments` for cross-cutting payment work; `payment-received` is AR-only.

---

# Fork-Specific Changes

Diverges from upstream `bigcapitalhq/bigcapital`. Post-mortems in `docs/FORK-BUG-HISTORY.md`. This file = active rules + feature index.

## Features added

One-line index — **full detail (tables, commits, GL direction, traps) in `docs/FORK-FEATURES.md`**; code/post-mortems in `docs/FORK-BUG-HISTORY.md`. Adding a feature: append the full entry to `docs/FORK-FEATURES.md` AND a one-liner here.

- **Bulk activate/inactivate accounts** — `POST /accounts/bulk-{activate,inactivate}` + UI.
- **Edit categorization on bank transactions** — `PATCH /banking/categorize/:id` rewrites GL on account/type change.
- **Parent account name + code in CSV export** — `parentAccountName`/`parentAccountCode` on `AccountTransformer`.
- **Accounts import: parent-child resolution** — two-pass `afterImport()`; `relationImportMatchDeferred` flag.
- **Stripped seed accounts** — `SeedAccounts` required-only; Drawings code 30003 → 30004.
- **Split-payment expenses + percent-based category allocation** — `expense_payment_splits`, `expense_transaction_categories`.
- **Split-payment-aware bank txn matching** — per-split match candidates via `matched_bank_transactions.reference_sub_id`.
- **Square integration** — OAuth, HMAC webhooks, SaleReceipt/CreditNote/ManualJournal posting. See `docs/SQUARE-INTEGRATION.md`.
- **Bidirectional cashflow categorization for refunds** — `OtherIncome` ↔ `OtherExpense` both directions; direction from source-row sign.
- **Credit card as Bill payment account** — `CREDIT_CARD` allowed in `New Payment Made`; posts `DR AP / CR CC Liability`.
- **Vendor-credit refunded-amount sync** — `RefundSyncCreditRefundedAmount` (re-enabled commented-out subscriber).
- **Reconcile aside accepts equity accounts** — Owner Drawings / Owner Contribution on leftover cashflow txn.
- **Direct-account allocations (Bill / VendorCredit / SaleInvoice / CreditNote)** — per-line account allocation; 4 `*_categories` tables; hydrate-empty-deletes-rows trap.
- **Shared allocations helpers** — add new allocation types in `_shared/allocations/` (server) + `_shared/Allocations/` (webapp), don't clone.
- **Descriptive report-PDF download filenames** — shared `buildReportPdfFilename` across all 17 statement dialogs.
- **Bank/cash account cards (cashflow-accounts) overhaul** — sort dropdown, type badge, titled sections, `bank_account_subtype` column, clearing OCA accounts.
- **Per-bank-account logos (cashflow cards)** — library (`bank_account_logo_slug`) or upload (`bank_account_logo_key`); CSS-mask brand color; `BANK_LOGO_LIBRARY`.
- **Invoice & Bill list default sort + per-user persistence** — both oldest-first; `createListSortPersistConfig`.
- **"Bill(s)" → "Purchase Invoice(s)" relabel** — `lang/en/index.json` values only; keys/routes/models unchanged.
- **Removed global Lemon Squeezy script** — dropped from `index.html`; call sites guard `window.LemonSqueezy?.`.
- **Block GL postings to parent accounts** — server guard at the single GL chokepoint `LedgerEntriesStorageService.saveEntries()`; an account with children can't be posted to (all paths). `ERRORS.POSTING_TO_PARENT_ACCOUNT_NOT_ALLOWED`. Webapp companion: parents hidden from account pickers via `hideParentAccounts` (default `true`) in `usePreprocessingAccounts`; opt out with `hideParentAccounts={false}` (Account-dialog parent field, GL report filter). Cashflow-accounts cards (+ MoneyIn/MoneyOut dropdowns + AccountTransactions sidebar) exclude parents server-side in `GetBankAccountsService` (`whereNotIn('id', parentAccountIds)`).

## Active gotchas (rules to follow)

Break these and recreate the bug. Post-mortems in `docs/FORK-BUG-HISTORY.md`.

### Server / NestJS

- **`SerializeInterceptor` mutates inbound `request.body` + `request.query` snake→camelCase.** New webhook handlers (Square/Stripe/Plaid) MUST read camelCase (`merchantId`, not `merchant_id`). `req.rawBody` holds original bytes for HMAC.
- **`require('@/...')` does NOT resolve at runtime in Objection `relationMappings`.** `@/` is compile-time `import` rewrite only — use relative paths in `static get relationMappings()`.
- **`filterSupportFeatures` is async — `await` it.** Goes through async `getResourceFields2(...)`. Non-awaited Promises are truthy → silently keep Branch/Warehouse fields required.
- **New importables need `@ImportableService({ name })`.** Use the literal resource string the webapp sends if it differs from model class. Check: `grep -L '@ImportableService' packages/server/src/modules/**/*Importable*.ts` prints nothing.
- **Resource-name aliases**: webapp string ≠ model class name (e.g. `PaymentReceive` vs `PaymentReceived` model) → add to `RESOURCE_NAME_ALIASES` in `Resource/_utils.ts`. Don't rename the model.
- **`Scope.TRANSIENT` + property injection + class-field arrow methods is a Nest trap.** Symptom: `<prop>.<method> is not a function`. **Default for new services: constructor injection, singleton scope.** Tenant model proxies are CLS-aware factories (singleton consumers still resolve per-tenant). If TRANSIENT needed, declare `public foo(...)` (prototype), not class-field arrows.
- **Read tenant id from `ClsService.get('tenantId')`, never `req.tenantId`.** Tenant context lives in CLS (`verifyPayload` in `Jwt.strategy` sets it per request; model proxies read it there). Nothing populates a `req.tenantId` property — a controller that invents one (`RequestWithTenantId`) gets `undefined`, and `Model.query().findOne({ tenantId: undefined })` throws Objection `undefined passed as a property … for 'where'` → surfaces as **500** (not the ServiceError filter's 400, since it's not a `ServiceError`). Bit `ExchangeRatesController` (hidden behind a 404 until the URL was fixed). When a service needs the tenant id, inject `ClsService`.
- **An edit service that emits a model into a GL-rewrite event MUST emit a fully-fetched row, not the bare `upsertGraph` result.** Objection `upsertGraph(...)` returns ONLY the fields in the upsert payload. GL-rewrite subscribers gate on a publish timestamp (`openedAt`/`deliveredAt`/`publishedAt`), and those are typically set only on FIRST publish — so for an already-published doc they're absent from the partial result → `isPublished`/gate is falsy → the rewrite **silently no-ops** (no error, no imbalance, just a stale ledger the §1 gate won't catch). Use `upsertGraphAndFetch` (precedent: `EditSaleInvoice`/`EditBill`/`EditVendorCredit`) or a separate `findById().withGraphFetched(...)` re-fetch before emitting (precedent: `EditManualJournal`). Bit `EditCreditNote` (UAT 2026-06-01, post-mortem in `docs/FORK-BUG-HISTORY.md`). Grep test: `Edit*.service.ts` using `.upsertGraph(` (not `AndFetch`) whose `onEdited` subscriber early-returns on a publish flag.
- **NestJS-migration commented-out subscribers compile fine and register nothing.** A whole-file `//`-commented Typedi subscriber (e.g. `RefundSyncVendorCreditBalanceSubscriber.ts`) compiles, Nest sees no provider, effect silently never runs. Port to `@OnEvent` + `@Injectable` + module registration. Candidates: `grep -l '// @Service()\|// @Injectable' packages/server/src/modules/**/subscribers/*.ts`.
- **List-query DTOs validating `sortOrder` with `@IsEnum(ISortOrder)` 400 on the webapp's lowercase `asc`/`desc`.** `transformTableStateToQuery` emits lowercase `sort_order`; `ISortOrder` is uppercase `ASC`/`DESC` (symptom: "no … with current filter criteria", Network `message[].constraints.isEnum`). Fix: `@Transform(({value}) => typeof value === 'string' ? value.toUpperCase() : value)` **before** `@IsEnum(ISortOrder)`. Bit `BankAccountsQueryDto` + `GetAccountsQueryDto`; commit `ec13d5b99`. When adding a default/served `sortBy`, grep its server DTO for `@IsEnum(ISortOrder)` first.
- **`DynamicListService.dynamicList(model, filter)` must get the tenant model PROXY (`this.xModel()`), not the bare model class.** `dynamicList(SaleEstimate, …)` trips a deep TS instantiation-depth error (`TS2345 … not assignable to MetableModel`) that surfaces in unrelated files after any trivial edit, and isn't tenant-bound. Matches `GetAccounts`/`GetVendors`; fixed `GetSaleEstimates`/`GetItems`/`GetSaleReceipts`/`GetPaymentsReceived`.

### Knex / MariaDB

- **MariaDB on Linux is case-sensitive for table names.** `knexSnakeCaseMappers({ upperCase: true })` emits UPPER CASE — actual tables are `SQUARE_CONNECTIONS`, `EXPENSE_PAYMENT_SPLITS`. Use uppercase in mysql CLI.
- **Knex unique/index names overshoot MySQL's 64-char limit** (UPPER-CASE mapping). Pass explicit short name: `table.unique([cols], 'uq_short_name')`.
- **Stuck migration lock**: `UPDATE knex_migrations_lock SET is_locked = 0;` on the affected tenant DB.
- **Vendor/customer empty `code`**: `CONTACTS_CODE_UNIQUE` rejects second `''` (MySQL: `''` dup, `NULL` non-dup). DTOs coerce falsy `code` → `null`. Existing rows: `UPDATE CONTACTS SET CODE = NULL WHERE CODE = '';`.
- **`contact_service` canonical value is lowercase `'customer'`/`'vendor'`** (`ContactService` enum). Capitalized `'Customer'` misses on case-sensitive MariaDB (bit the `SaleInvoice.customer` relation filter; `Customer`/`SaleEstimate`/`SaleReceipt`/`Contact` were already correct). `whereNot(col, null)` is `NOT (col = NULL)` → always false; use `whereNotNull` (bit `SalesTaxLiabilitySummary`, `TransactionsByCustomer/Vendor`).
- **Never `whereRaw` with literal table/column names.** Bypasses `snakeCaseMappers({ upperCase: true })`. Use `whereColumn('a.col','b.col')`, `?? = ??` bindings, or structured `.where()`/`.whereNull()`. Same for `joinRaw`/`select(knex.raw(...))` with literal identifiers. Worst case: `PromisePool` callers (e.g. `GetMatchedTransactions.service.ts`) swallow per-task errors → 200 OK, missing rows, no log.
- **Raw-SQL `static get modifiers` silently fail when chained with `withGraphJoined` inside a PromisePool task.** A `dueBills` modifier using `raw('COALESCE(AMOUNT,0)-... > 0')` works alone but throws chained with `withGraphJoined('matchedBankTransaction')` — swallowed, empty 200. Filter "remaining due" on the model virtual in JS after the query, or rewrite with `??` bindings. Commits `83c4545fd` → `bc3dfeef2`.
- **Never run parallel writes on a Knex transaction.** `trx` is not concurrency-safe — parallel `INSERT`s give non-deterministic per-row failures. **Never `async.queue` without an error handler** (fire-and-forget swallows failures; `await queue.drain()` resolves regardless). Combined: bad row vanishes silently, UoW commits, only symptom a trial-balance imbalance weeks later. Use sequential `for…await` for per-row writes that must all succeed. Any "queue concurrency > 1 inside a UoW trx" is suspect.
- **`UnitOfWork.withTransaction` must `await` both `commit()` and `rollback()`.** Already correct in `Tenancy/TenancyDB/UnitOfWork.service.ts` — keep it.
- **Trial-balance audit recipe**: `SELECT REFERENCE_TYPE, REFERENCE_ID, SUM(DEBIT)-SUM(CREDIT) AS diff FROM ACCOUNTS_TRANSACTIONS GROUP BY 1, 2 HAVING ABS(SUM(DEBIT)-SUM(CREDIT)) > 0.005` names every unbalanced leg-set. Once it names a doc, **first check server logs at the surviving GL row's `CREATED_AT`** — `docker compose logs --since … --until … server | grep -A 20 'ERROR \[Event\]'`. Nest's event-emitter wraps subscribers in try/catch and only logs, so per-row INSERT failures (FK, `ER_DATA_TOO_LONG`) bail the saveEntries `for…await` loop after the AR/AP debit lands, UoW commits, green toast. Swallowed-INSERT is more common than concurrency — check logs first. Join `ITEMS_ENTRIES` on `(REFERENCE_ID, ITEM_ID, ACCOUNT_ID)` for missing legs.
- **The per-reference trial-balance gate is BLIND to an internally-balanced ORPHANED reference.** A reference whose own legs net to 0 passes the gate even when it should not exist at all — e.g. an `InvoiceWriteOff` GL pair (DR bad-debt / CR A/R) left behind after its `SaleInvoice` was deleted: phantom expense + phantom −A/R, gate clean. Catch these with a **per-contact A/R ledger** (`SUM(DEBIT)-SUM(CREDIT)` grouped by `CONTACT_ID` on A/R accounts) and a **global** `SUM(DEBIT)-SUM(CREDIT)` over all rows. Surfaced via a customer showing a negative "Outstanding receivable" (the contact `BALANCE` field is subscriber-maintained and can drift from the ledger — and stores the FOREIGN face value while the ledger is LOCAL, so −500 GBP vs −445 USD). Root cause was BUG-020 (delete-written-off-invoice orphans write-off GL); fixed with a delete guard, but legacy orphans need a manual balanced-pair `DELETE FROM ACCOUNTS_TRANSACTIONS WHERE REFERENCE_TYPE=… AND REFERENCE_ID=…` (safe only when the pair balances and the parent doc is gone — there's no app path to reverse it).
- **`ACCOUNTS_TRANSACTIONS.NOTE` is `TEXT`** (was `varchar(255)`, migrated 2026-05-28, commit `227b77893`). GL writers copy `ItemEntry.description` verbatim into ledger `note`; >255-char descriptions used to throw `ER_DATA_TOO_LONG` and lose every credit leg downstream of AR debit (SaleInvoice 114 break).
- **GL ledger `debit`/`credit` are stored in LOCAL (base) currency.** `Ledger.getClosingBalance()` sums raw `debit-credit`; `getForeignClosingBalance()` divides by `exchangeRate`. So GL writers must post `amount * exchangeRate` (local) — precedent `InvoiceGL`/`CreditNoteGL` use `totalLocal`/`*Local`. **Both legs of one entry must use the SAME basis** or it won't balance for `exchangeRate ≠ 1`. Fixed this session: `SaleInvoiceWriteoffGL` (AR leg was local, expense leg gross) + `RefundCreditNoteGLEntries` (posted raw foreign `amount`). A/R is an asset → its leg's `accountNormal` is `DEBIT` (not CREDIT).
- **A GL writer that reads `doc.categories` MUST eager-load `categories` in its OWN re-fetch.** `*GLEntries.ts` writers re-`findById` the doc independently — the `GetXxx` query service loading `categories` is irrelevant. If the writer's `.withGraphFetched(...)` omits `categories`, `mapAllocationLedgerEntries(doc.categories, …)` maps over `undefined` and emits **zero** allocation legs — **silently** (empty map, no throw, empty logs): direct-account-allocation docs post the AR/contra debit and drop the income/allocation credit → unbalanced, green toast. Bit `InvoiceGLEntries`/`CreditNoteGLEntries` (only fetched `entries.item`); `Bills`/`VendorCredit` were correct. Grep test: any `mapAllocationLedgerEntries(this.x.categories` whose writer fetch lacks `categories`. UAT-found 2026-06-01, post-mortem in `docs/FORK-BUG-HISTORY.md`.

### Cascading deletes (service-layer pattern)

- **Service-side cascade**, NOT DB-level `ON DELETE CASCADE`. Explicit `.where('parentId', id).delete()` inside parent's UoW trx. Precedent: `expense_transaction_categories`, `expense_payment_splits`.
- **When adding a child table, audit the parent's Delete service.** Missing line = 500 FK violation (universal from day one with a backfill migration).
- **Audit transitively.** When a subscriber cleans an intermediate row (e.g. `DeleteUncategorizedTransactionsOnAccountDeleting` deletes `uncategorized_cashflow_transactions`), every table whose FK points at it (`matched_bank_transactions.uncategorized_transaction_id`, `recognized_bank_transactions.uncategorized_transaction_id`) must clear first in the same trx. Inner FK error surfaces as a confusing _outer_ FK on the next delete. Grep `oldAccount`/`onDelete` subscribers when adding tables referencing uncategorized/match/recognized rows.

### Bank transaction matching

- **Direction filter** in `GetMatchedTransactions.service.ts`, from first uncategorized txn's amount sign:
  - Withdrawals (`amount < 0`, e.g. CC charge): hide SaleInvoice.
  - Deposits (`amount > 0`): hide Bill and Expense.
  - Cashflow and ManualJournal: both directions.
- **Cashflow additionally scopes by account**: `cashflowAccountId = filter.paymentAccountId`.
- **Candidate `amount` must be `dueAmount`** (not gross). Webapp `useGetPendingAmountMatched` and server `sumMatchTranasctions` sum `item.amount`; gross never balances for partial-paid records.
- **New candidate types need all three**: direction allowlist in `getMatchedTransactions`, `dueAmount` in transformer's `amount(record)`, per-account scope where applicable. Commits `74b8cf8bb` + `83c4545fd` + `bc3dfeef2`.

### Bank account transactions register (`CashFlow/AccountTransactions`)

- **Pagination order, running-balance walk, and infinite-scroll direction are coupled — change together.** Reads oldest→newest (top→bottom). `GetBankAccountTransactionsRepo` paginates `date asc, created_at asc`; running balance walked oldest→newest (opening = net of `pageSize × (page-1)` older rows, zero on page 1; apply-then-capture so each row shows balance _after_ it); client `AccountTransactionsDataTable` sets `initialSortBy={[{ id:'date', desc:false }]}` to MATCH server so initial client sort is a no-op and pages append at bottom. Mismatched client sort re-sorts each page to top → "list won't load, scroll+click a header to fix." Commit `77be587aa`. Validate with `SUM(DEBIT-CREDIT) OVER (ORDER BY DATE, CREATED_AT)`.
- **Possible open issue**: react-virtualized `WindowScroller` in shared `components/Datatable/TableVirtualizedRows.tsx` may need an initial scroll to render rows on first mount; not fixed (shared component — verify on UAT before changing).

### Cash-basis financial reports

- **Must both exclude accrual-only document GL AND synthesize from payment events.** `PaymentReceive`/`BillPayment` GL only moves cash ↔ AR/AP — dropping `SaleInvoice`/`Bill`/`CreditNote`/`VendorCredit` rows alone leaves cash-basis revenue at zero.
- **Pattern** (see `FinancialStatements/_shared/CashBasisProjection.{service,helpers}.ts`, `ProfitLossSheetRepository.cashBasisAccountsTotal`): when `basis === 'cash'`, run query with `whereNotIn('referenceType', ACCRUAL_ONLY_REFERENCE_TYPES)`, then union synthetic rows from `PaymentReceive`/`BillPayment`/`RefundCreditNote`/`RefundVendorCredit` at payment date, prorated `payment_amount / document.total` per line.
- **Sibling reports** (Balance Sheet, General Ledger, Cash Flow, Sales Tax Liability Summary) accept the flag but ignore it. Pattern lifts onto each, with quirks (BS: same projection + zero AR/AP; SalesTaxLiabilitySummary: tax-line proration).
- **A new report accepting `basis` without this pattern makes the toggle a silent no-op** — grep `basis` in the new repo, confirm both the `whereNotIn` filter AND the projection union.

### CSV import

- **CSV enum fields**: emit lowercase key (`service`, `inventory`, `non-inventory`), NOT localized label. Parser matches `option.key` case-insensitively.
- **`CustomersImportable` does NOT dedupe by Display Name** — re-uploading customers.csv doubles contacts. Items/invoices/invoice_payments/receipts are safe (collisions skip); customers is NOT. Fix duplicates with `MERGE + DELETE` SQL against `CONTACTS`.

### Webapp / forms

- **`FSelect` dropdowns (and `AccountsListFieldCell`) filter in-memory** — form provider MUST request `page_size: 10000` on `useVendors`/`useCustomers`/`useAccounts`/`useItems`/`useBranches`/`useProjects`/`useWarehouses`/`useTaxRates` and every list hook feeding a select. Symptom: a selected id whose record lives past page 1 renders as an **empty dropdown row** ("value got deleted" on edit re-open). Commit `3b6d4b105`. Grep every `useXxx(` for missing `page_size`.
- **Account pickers share `components/Accounts/_components.tsx`, don't clone.** The three wrappers (`AccountsSelect`, `AccountsMultiSelect`, `AccountsSuggestField`) import `Account`/`AccountSelect` types, `accountPredicate`, `createNewItemRenderer`, `createAccountFromQuery` from there. A new filter prop (e.g. the `hideParentAccounts` precedent) is threaded into `usePreprocessingAccounts` (`_hooks.ts`) + added to all three wrapper prop types — keep the prop type consistent across the three (`filterByNormal` had drifted `string` vs `string[]`). Don't reintroduce per-wrapper copies of the renderer/predicate. Commit `96a2e75b6`.
- **`FDateInput` call sites must spread `momentFormatter('MM/DD/YYYY')`** — upstream `@blueprintjs-formik/datetime` serializes via `Date.toISOString()` / parses via `new Date(str)`, crossing local↔UTC → day-shift in non-UTC clients. `momentFormatter` (`packages/webapp/src/utils/index.tsx`) round-trips tz-free `YYYY-MM-DD`. Check: `grep -L 'momentFormatter' <file>` for any file touching `FDateInput`.
- **moment.js `MM` vs `mm`**: `MM` = month, `mm` = minutes. `HH:MM` renders month as the minute.
- **Currency-math gates need ε tolerance, not `> 0`.** Floating dust (~1e-13) formats as `$0.00` but `> 0` is true → excess-credit dialog fires on a balanced payment. Use `> 0.005`. Commit `a5893e40c` (`PaymentMadeForm` + `PaymentReceiveForm`); grep other money gates when touching this area.
- **New report PDF dialogs MUST use `buildReportPdfFilename`** from `FinancialStatements/common.tsx` for `<AnchorButton download={...}>`. Check: `grep -rn "download={'" packages/webapp/src/containers/FinancialStatements/` prints nothing.
- **Entry-total helpers must coerce `amount` to number — never `sumBy(rows, 'amount')`.** Trailing empty line carries `amount: ''`; lodash `sumBy` concatenates (`2500 + '' === "2500"`, then `"2500" + 0 === "25000"`) — silent 10× on whole-dollar docs. `getEntriesTotal` in `Entries/utils.tsx` sums `toSafeNumber(entry.amount)`; apply same to any new sum over form rows. Commit `0e40703a3`.
- **Document discounts: `null`/missing `discount_type` means fixed amount, NOT percentage.** Edit forms strip null fields on hydrate (`transformToForm`) → default `discount_type` to `'amount'` on hydrate. Server: all six doc models' `discountAmount` getter must read `=== DiscountType.Percentage ? subtotal*discount/100 : discount` (treating not-Amount as percentage made a `$111.53` fixed discount post as `111.53%` → `$497.56`). Commit `193e615d2`.
- **List table-state defaults + persistence (invoices/bills pattern).** Default sort lives in `defaultTableQuery.sortBy` in `store/<Resource>/*.reducer.tsx` (e.g. `[{ id: 'invoice_date', desc: false }]` / `[{ id: 'bill_date', desc: false }]`, both **oldest-first**), mapped to `column_sort_by`/`sort_order` by `transformTableStateToQuery`. Three things make it stick:
  - **Across Edit round-trip (popup → `/…/edit` → back):** do NOT `reset…TableState()` on list unmount; pass `initialSortBy={tableState.sortBy || []}` + `autoResetSortBy={false}` to `DataTable`. Redux survives SPA nav.
  - **Across full page reload:** reducer's redux-persist CONFIG must persist the sort — use shared `createListSortPersistConfig(STORAGE_KEY)` from `store/persistListSort.ts` (NOT `whitelist: []`). Pass same CONFIG to `persistReducer` and `purgeStoredState`.
  - **Server must accept the sort key.** `column_sort_by` resolved by `DynamicListService` via `model.getField(key)` → `sortBy[0].id` must be a field key in the model's `*.meta.ts` `fields` (`invoice_date`, `bill_date`; cashflow accounts `name`/`code`/`balance`/`type`/`created_at` — `balance`→`amount` column). Unknown key throws server-side.
  - Commits `e569bfc13` (orig), `0771c21e7` (oldest-first + reload persistence + bills parity), `a6e9f0070` (cashflow-accounts sort dropdown).
- **Form `onError` reads `response.data.errors`, but the global class-validator pipe returns `response.data.message`** (array of ValidationError). Pipe (`common/pipes/ClassValidation.pipe.ts`) is `whitelist: true` (no `forbidNonWhitelisted`) → a 400 on save is a field-level DTO failure in `message`. Symptom: silent `AxiosError`, no toast. Read the Network `message` array; surface `message` in form `onError`.
- **Blueprint `<Tooltip>`/`<Popover>` with a dynamic child must guard empty values.** A `null`/`''`/`undefined` child renders no target and logs `[Blueprint] <Popover> requires target prop or at least one child element` on every blank cell. Shared `TextOverviewTooltipCell` (`components/DataTableCells/`) returns `null` early when empty — keep that, apply to any new Popover/Tooltip whose single child is a data value. Warning fires on load→render, NOT on request failure — get Network status + body before theorizing about a 400. Commit `48ba12e8f`.
- **Account `account_type` is locked on edit (by design).** `AccountDialog` disables type select in Edit/NewChild/NewDefinedType (`getDisabledFormFields`). When a feature needs an account in a different bucket, prefer a non-type marker over a type change/SQL conversion — `bank_account_subtype='clearing'` is the precedent (surface by tag, widen list query, keep real type). Commit `6640838e8`.
- **Webapp `useRequestQuery`/`apiRequest` URL must match the NestJS controller route — a fork feature that "looks wired but does nothing" is usually a path mismatch, not a backend bug.** When a server controller splits GET-list vs POST-action onto DIFFERENT paths, the webapp hooks often drift. `VendorCreditsApplyBills` shipped UI-dead: webapp GET `:id/apply-to-bills` (server is `:id/bills-to-apply`) + DELETE `applied-to-bills/:id` (server is `applied-bills/:id`) both 404'd; only the matching POST worked (BUG-017/019). Same class as BUG-003 (exchange-rates `_`/`-`). **Before live-testing a fork webapp feature, grep its `hooks/query/*.tsx` paths and diff against the `@Get/@Post/@Delete` decorators in its `*.controller.ts`.**
- **`FormatDateCell` / `FormatDate` strictly parse ISO-8601 — never feed them a server-pre-formatted `formatted_*_date` string.** `FormatDate` does `moment(value, ISO_8601, true)`; a display string like `"June 09, 2026"` fails strict parse and is now returned verbatim (was: moment fallback + RFC2822 deprecation warning spam, BUG-018). Table columns must point the accessor at the RAW `*_date` (ISO), not `formatted_*_date`. The Transformer base spreads the model so the raw field is in the payload alongside the `formatted*` ones.

## Conventions

- **Naming**: Containers `bigcapital-fork-*` (staging), `bigcapital-sandbox-*` (sandbox). Image tags `:uat-v*` (staging), `:sandbox-v*` (sandbox). Networks `bigcapital_fork_network` + volumes `bigcapital_prod_fork_*` (staging); `bigcapital_sandbox_network` + volumes `bigcapital_sandbox_*` (sandbox). Both attach public containers to external `portal-net`.
- **i18n labels**: Title Case for headers/labels ("Payment Date"). "Note" not "Statement" for memo. "Reference No." consistently.
- **Date format on financial reports**: single source = tenant Preferences → General → Date Format. `FinancialSheetMeta.meta()` exposes `dateFormat` (→ `date_format` on webapp); shared `FinancialSheet.tsx` footer reads `meta?.date_format`. Never hardcode a date format in a report container.

---

# Deployment

Prod + UAT run via Docker (`docker-compose.prod.yml`). Traefik handles TLS, OAuth forward-auth, routing. Full guide: `docs/DEPLOY.md`. CI/CD runbook: `docs/CI-CD.md`.

## Push-to-deploy (GHCR — sandbox + UAT)

`git push origin develop` → `.github/workflows/deploy.yml` builds linux/arm64 images for `server` + `webapp` → `ghcr.io/crxnit/bigcapital-{server,webapp}:sha-<short>` → Trivy HIGH/CRITICAL gate → SSH VPS → `deploy.sh` pulls, runs tenant migration, brings up server+webapp with `/api/health` smoke gate.

- **Sandbox + UAT auto-deploy on push to `develop`, in sequence**: sandbox first; UAT only if sandbox's smoke gate (and every earlier step) passes. **Docs-only pushes don't deploy** — `paths-ignore: docs/**, **/*.md, archive/**` (incl. `.claude/CLAUDE.md`). Mix code + docs to deploy both. **`.github/workflows/**`is NOT in`paths-ignore`\** — a workflow change triggers a deploy running the *new\* definition (self-validating).
- **Manual single-env dispatch** (redeploy without new commit, e.g. after `.env` change): `gh workflow run deploy.yml -f environment={sandbox|uat}`. By ID if name fails: `gh api -X POST repos/crxnit/bigcapital/actions/workflows/275652569/dispatches --input - <<<'{"ref":"develop","inputs":{"environment":"uat"}}'`.
- **Legacy tarball compose files** (`docker-compose.prod.yml`, `docker/sandbox-bc/docker-compose.yml`) remain as rollback paths.
- **Solo-dev — no PR ceremony.** Commit + push directly to `develop`; rides sandbox → UAT automatically. To gate, hold off pushing. Don't open a PR / feature branch unless asked.

## Always-relevant deploy notes

- **Colima memory** for builds: ≥ 8 GB (Vite needs ~4 GB heap). `colima stop && colima start --cpu 2 --memory 8 --disk 20`. OOM symptom: `ResourceExhausted: cannot allocate memory`.
- **Image tarballs** (legacy) → `current-images/<env>/` (gitignored).
- **Migration `cwd` must be `/app/packages/server`** — system migration path (`./src/database/system/migrations`) is cwd-relative.
- **API rate limit**: NestJS throttler. Set `THROTTLE_GLOBAL_LIMIT=600`, `THROTTLE_AUTH_LIMIT=60`, `THROTTLE_GLOBAL_TTL`/`THROTTLE_AUTH_TTL`=`60000` (defaults 100/10 too strict). Legacy `API_RATE_LIMIT` NOT used. State in Redis — restart Redis to clear lockouts.
- **MinIO** (self-hosted S3 for attachments): `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION=us-east-1`, `S3_ENDPOINT=http://bigcapital-fork-minio:9000`, `S3_BUCKET=bigcapital-attachments`, `S3_FORCE_PATH_STYLE=true`. `createbuckets` one-shot creates bucket idempotently per `docker compose up`.
- **`docker compose restart` does NOT apply compose-file changes** — use `docker compose up -d <service>`.
- **Docker `env_file` does NOT strip inline `#` comments — the whole RHS becomes the value.** `KEY=val   # note` sets `KEY` to `"val   # note"`. The `.env.production` template carries `# [CHANGE] …` inline comments on value lines (`JWT_SECRET`, `DB_PASSWORD`, `BASE_URL`, `OPEN_EXCHANGE_RATE_APP_ID`); any line left untouched ships the comment as its value. Bit `OPEN_EXCHANGE_RATE_APP_ID` on staging (= `# [CHANGE] if using exchange rates` → exchange-rate 400). Keep comments on their own line in real `.env` files; audit untouched template lines. Check: `docker exec <svc> sh -c 'echo "[$VAR]"'`.
- **Fonts**: NotoSans + Segoe must be in `packages/webapp/public/fonts/` for prod builds (Vite SCSS URL resolution doesn't hash them).
- **`GOTENBERG_DOCS_URL`** uses container name `http://bigcapital-fork-server:3000/public/` — must match `container_name`.

## Traefik

- **Dynamic files**, not Docker labels. Routers/services/middlewares in `*.yml` under Traefik's watched dir. Do NOT add `traefik.*` labels to compose.
- Bigcapital containers attach to Traefik's external network. Keep `mysql`, `redis`, `gotenberg`, `database_migration` internal-only. Container names drive dynamic-file service URLs — keep `container_name:` stable.
- **Routing split** (same host, path-prefix): `bigcapital-fork-api` (priority 10) `Host(host) && (PathPrefix('/api') || PathPrefix('/socket') || PathPrefix('/public'))` → `bigcapital-fork-server:3000` (sticky cookies for Socket.IO). `bigcapital-fork-webapp` (priority 1) `Host(host)` catch-all → `bigcapital-fork-webapp:80`.

## OAuth pattern — network-level gate

OAuth forward-auth at Traefik edge is a **network-level access gate**, NOT identity federation:

- Wraps both routers; unauth → OAuth provider redirect. Bigcapital's internal `AuthModule` (JWT) remains identity source of truth. Two logins: OAuth once per browser session, Bigcapital signin once per JWT lifetime (1 day).
- Callback centralized at `https://portal.jjocllc.com/oauth2/callback`, session cookie scoped to `.jjocllc.com` — every subdomain inherits. New subdomain = DNS + Traefik router only.
- Middleware chain on API + webapp routers: `oauth2-jjoc-auth`, `security-headers`, `rate-limit`, `portal-expose-email` (in `jjocllc.yml`). ACME resolver: `letsencrypt`.
- **Webhook routers** (Square/Stripe/Plaid) deliberately omit every middleware — signature verification is the auth.

## Sandbox environment

`https://sandbox.bc.jjocllc.com` mirrors staging on the same host, fully isolated (container/volume/network). Pre-release testing (Square Phase 2/3 land here first). At `/srv/portal/clients/sandbox-bc/`. Runbook: `docker/sandbox-bc/README.md` (mysqldump + MinIO clone from staging, first boot, **post-clone Square-row wipe** since token encryption key differs).

## VPS / infra gotchas

- **cloud-init drops `<user> ALL=(ALL) NOPASSWD:ALL` into `/etc/sudoers.d/90-cloud-init-users`** — a new `deploy` user inherits broad NOPASSWD sudo that defeats the `command="…"` SSH lockdown (deploy-key compromise = root). When onboarding an env, rewrite that file to remove the deploy line right after SSH lockdown. Verify `sudo -l -U deploy` — only entry should be `(root) NOPASSWD: /srv/portal/clients/<env>/deploy.sh`.
- **`docker compose exec -T <svc> <cmd>` consumes parent shell's stdin.** Inside `while read … done <<< "$LIST"`, the inner exec eats the rest of the here-string after iteration 1. Pass `< /dev/null` to the exec inside a stdin-fed loop. Bit `deploy/vps-backup.sh`.
- **Docker compose project-prefixes network names on disk.** Logical `bigcapital_sandbox_network` lives as `sandbox-bc_bigcapital_sandbox_network`. Resolve via `docker inspect <id> --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'`, take first token. Pattern in `deploy/vps-backup.sh`.
- **`mariadb`/`mariadb-dump` only exist in MariaDB 10.4+** — project pins `mariadb:10.2` (`docker/mariadb/Dockerfile`), only legacy `mysql`/`mysqldump`. Backup/admin scripts must use legacy names.

## Open items (CI/CD bring-up)

Full detail + status moved to **`docs/CI-CD.md` → "Open items & bring-up status"**. Still-PENDING actionable items:

- **Staging `.env` Square production secrets** — paste App ID/Secret/PAT into `/srv/portal/clients/staging-bc/.env` + recreate server; add Traefik webhook router for `/api/integrations/square/webhooks`. Template `deploy/staging-bc.env.example`.
- **Trivy gate BLOCKING** — `.trivyignore` is a dated 46-CVE baseline (expiry **2026-08-31**); 1 CRITICAL left (`@casl`, needs v6). Validate gate locally before pushing (recipe in `docs/CI-CD.md`).
- **Production deploy (Phase 9)** deferred until sandbox + staging ride clean.
- **GHCR PAT** on VPS expires **~2027-05-12** — set reminder.

(Done/for-reference: devDep-leak cleanup, Node 24 actions bump, containerd-flake prune cron, restic version, backup env naming — see `docs/CI-CD.md`.)

## Staging UAT run (2026-06-02 → 2026-06-09) — nearly complete

Structured regression/UAT of the ~2-week changeset against staging (`staging.bc.jjocllc.com`, tenant DB `bigcapital_tenant_35i5f1mo1phc5w`). Full plan + findings log: `docs/UAT-REGRESSION-PLAN.md`. **~12 issues found, all fixed + deployed + verified live**; post-mortems in `docs/FORK-BUG-HISTORY.md`, active rules in this file.

- **Fixed 2026-06-02 run**: REGRESSION-001/002 (allocation invoice/credit-note dropped income leg — missing `categories` eager-load in GL writer), REGRESSION-006 (editing a published credit note left GL stale — `upsertGraph`→`upsertGraphAndFetch`), BUG-003/004 (exchange-rate `/latest` 404→500→best-effort degrade; never worked before).
- **Fixed 2026-06-09 run** (this session): BUG-016 (edit-categorization dark dropdown + AR i18n name — code + 1 data rename), BANK-011/012 (bank-CSV re-import dedupe + honest "skipped" import-report bucket), BUG-017/019 (vendor-credit reconcile GET + un-reconcile DELETE both hit wrong webapp paths vs server `bills-to-apply`/`applied-bills` — the whole VendorCreditsApplyBills feature was UI-dead; only the POST matched), BUG-018 (app-wide moment RFC2822 date warning, root-fixed in `FormatDate`), **BUG-020** (deleting a written-off invoice orphaned its `InvoiceWriteOff` GL → phantom expense + phantom −AR; guard added).
- **Sections green**: §1 GL gate (run ×4, always 0 unbalanced refs), §2 ledger/currency (all 7), §3 allocations, §4.1–4.4 + 4.8 + 4.10 (cascade now live-verified incl. transitive matched-FK), §4.9 (CSV dedupe live), §5.1/5.3/5.4/5.6 payments (CC-as-bill-payment DR AP/CR CC; vendor-credit apply+decrement sync; vendor-credit refund DR bank/CR AP; Payment-Received FX incl. gain/loss path — all balanced).
- **Open (logged, non-blocking)**: CONFIG-005 (staging `.env` `OPEN_EXCHANGE_RATE_APP_ID` leaked template comment), BUG-007 (`GET /sale-invoices/:id` on deleted id → 400 not 404; same 400-on-deleted pattern hit vendor-credits on delete-refetch), DATA-008 (Mercury Savings 1621 dup of Checking 1625 — books-owner cleanup, not code). Trivy `.trivyignore` extended with 2026-06 axios HIGH batch (transitive via firebase-admin/plaid; expiry 2026-08-31).
- **§6 reports**: ✓ PASS live 2026-06-11 (API smoke vs primary tenant — 8 statements 200 w/ real data incl. P&L cash-basis; smoke method below). **Remaining UAT (externally blocked only)**: §7.1 Square (staging Square secrets), §4.11 Plaid (external/manual). All test docs created during the run were deleted + a final §1 gate confirmed baseline.
- **Curling staging API directly** (e.g. report smoke): `/api/*` sits behind BOTH the Traefik Google-OAuth edge AND Bigcapital JWT AND a `TenancyGlobal.guard` requiring an `organization-id` header. To curl from a dev box: pass `Cookie: _oauth2_proxy=<value>` (browser DevTools → Cookies; gets past the edge) + `Authorization: Bearer <jwt>` (DevTools → Network → any `/api` req; selects tenant via `verifyPayload`) + `organization-id: <orgId>` (= the tenant-DB hash, `bigcapital_tenant_<orgId>`; primary test org `35i5f1mo1phc5w`). Reports default to JSON unless `Accept: application/json+table|csv|xlsx`. Report routes are `/api/reports/{profit-loss-sheet/,balance-sheet,trial-balance-sheet,general-ledger,cashflow-statement,receivable-aging-summary,payable-aging-summary,sales-tax-liability-summary}`; sales-tax requires non-empty `basis` (`cash|accrual`) while P&L's `basis` is optional.

## Open QA-review follow-ups

Whole-server backend QA review (2026-06-01) → ~40 HIGH/MED/LOW fixes committed + pushed in small `tsc`-gated commits (concurrency/parallel-trx writes serialized, UoW-escaping writes threaded `trx`, GL/webhook/auth hardening, vendor-credit apply-to-bills sync wired, `@ts-nocheck` removed from **60 of 68** files). Still open (each a real task, not a quick fix):

- **Public `GET /attachments/:id` IDOR** — `@PublicRoute()`, streams any S3 key, no tenant check. Can't just remove `@PublicRoute()`: the MinIO proxy URL from `GetAttachmentPresignedUrl` is embedded as company/org/bank logos in PDF templates that **Gotenberg fetches server-side without a JWT**. Needs short-lived signed URLs.
- **Plaid webhook signature verification** — `BankingPlaidWebhooks.controller` is `@PublicRoute()` with no `Plaid-Verification` JWKS check; forgeable `itemId` triggers tenant sync.
- **Stripe webhook idempotency** — `StripeWebhooksSubscriber.handleCheckoutSessionCompleted` has no dedup; redelivery double-posts a payment. Needs a `stripe_webhook_events` unique-`event.id` migration (also covers the `ResolveBigcapitalCustomer`/`HandleSquarePayment` replay races).
- **Categorize-as-expense unfinished** — `CategorizeTransactionAsExpense` calls `newExpense({})` behind `@ts-ignore`; the app method `categorizeTransactionAsExpenseType` is unwired (no controller route). Complete the DTO mapping + route, or delete.
- **Cash-basis `basis` flag is a no-op** in Balance Sheet / General Ledger / Trial Balance / SalesTaxLiability (GL hardcodes `basis:'cash'`). Only ProfitLoss implements the projection. (SalesTaxLiability date-range + `whereNotNull` already fixed; only the projection remains.)
- **`TenantDBManager.seed()`** references undefined `tenant`/`tenantSeedConfig` (real bug; kept `@ts-nocheck`).
- **7 `@ts-nocheck` files remain** — the top-level `class extends R.pipe(...mixins)(FinancialSheet)` composes in BalanceSheet/ProfitLoss. A variance mismatch fires _inside_ the `R.pipe` arg list; only fixable by replacing the Ramda mixin composition with a typed pattern (architectural refactor, runtime-order-sensitive). Leave `@ts-nocheck` rather than risk it.

## Future enhancements & known gaps

See `docs/FUTURE-ENHANCEMENTS.md`: multi-organization per user, behavioral hardening (security/audit). Hardening must complete before production data.

### Deferred

- **Receipts/invoices CSV import from scanning app** — shelved. Separate app OCRs receipts, emits paired CSVs (header + line items linked by `receipt_id`, Bill-vs-Expense indicator). Intended as dedicated import flow (not generic `Importable`), fuzzy-match vendors + line items (→ Items for bills, → Accounts for expenses), fallback "Unknown Vendor" + ad-hoc items. Open: CSV column contract; expense line→account vs single category; tax handling (candidate: bill `adjustment` field).
