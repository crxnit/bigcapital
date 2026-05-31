# Claude Code Settings for Bigcapital

## Environment

- **Node**: 18.16.1 — run `nvm use 18.16.1` before any npm/pnpm/node command.
- **Package manager**: `pnpm`. **Never** `pnpx` / `pnpm dlx` in committed hooks/scripts (ignore lockfile). Use `pnpm exec <bin>`.
- **Keep tooling deps Node-18-compatible** — run `pnpm exec <bin> --version` after any tooling install (ES-module Node-version errors fire on import):
  - `@commitlint/cli@^17` (v19+ → yargs-parser@22 → Node 20+); `lint-staged@^15` (v16+ → listr2@10 → `node:util.styleText` → Node 20+). Same trap lurks in husky/prettier/eslint bumps.

## Commits & Hooks

- **`.husky/pre-commit`**: `pnpm exec lint-staged` → Prettier (per-package `.prettierrc`; also formats staged `.claude/*.md`). **`.husky/commit-msg`**: `pnpm exec commitlint --edit "$1"` (Conventional Commits). Hooks tracked at mode 100755.
- **`type` must be a standard Conventional Commit type** (`build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test`) — custom types like `i18n` are rejected by `type-enum`. Use `refactor`/`feat` for i18n work; the restricted list is `scope`, not `type`.
- **`scope-enum` restricted** (add via `commitlint.config.js`, don't `--no-verify`):
  - Workspace: `server`, `webapp`, `utils`, `email-components`, `pdf-templates`, `sdk-ts`.
  - Domain: `accounts`, `banking`, `ci`, `contacts`, `currency`, `docker`, `docs`, `expenses`, `financial-statements`, `husky`, `import`, `infra`, `inventory`, `ledger`, `models`, `organization`, `payment-received`, `payments`, `reports`, `resource`, `sandbox`, `square`, `square-pull`, `ui`. Use `payments` for cross-cutting payment work; `payment-received` is AR-only.

---

# Fork-Specific Changes

Diverges from upstream `bigcapitalhq/bigcapital`. Full post-mortems in `docs/FORK-BUG-HISTORY.md`. This file = **active rules** (obey when writing new code) + feature index.

## Features added

Brief index — read linked code / `FORK-BUG-HISTORY.md` for design detail.

- **Bulk activate/inactivate accounts** — `POST /accounts/bulk-{activate,inactivate}` + UI.
- **Edit categorization on bank transactions** — `PATCH /banking/categorize/:id` rewrites GL when account/type changes. "Edit Category" context menu.
- **Parent account name + code in CSV export** — `parentAccountName`/`parentAccountCode` on `AccountTransformer`.
- **Accounts import: parent-child resolution** — two-pass via `afterImport()` on `Importable`; `relationImportMatchDeferred` field-meta flag skips parse-time DB lookup; resolves by id/name/code post-insert.
- **Stripped seed accounts** — `SeedAccounts` has only required predefined accounts. Drawings code 30003 → 30004 (was dup of Owner's Equity).
- **Split-payment expenses + percent-based category allocation** — multi-account payment per expense; categories allocate by percent OR fixed dollar. Tables: `expense_payment_splits`, `expense_transaction_categories.amount_type`/`percent`. Validator tolerance `0.005 + 0.005 × N_percent_rows`. Header `paymentAccountId` denormalized primary for list views. **PDF/CSV show only primary (intentional v1). Run tenant migrations.**
- **Split-payment-aware bank txn matching** — each split is an independent match candidate via `matched_bank_transactions.reference_sub_id` → `expense_payment_splits.id`. `GetMatchedTransactionsByExpenses` filters by bank txn's account. Unmatch per-split. Form preserves split `id` for `upsertGraph` in-place update.
- **Square integration** — OAuth, setup wizard, HMAC webhooks, SaleReceipt/CreditNote/ManualJournal posting. Phase 1 done; Phase 2 partial (payment done; refund/payout/customer pending); Phase 3 (180-day backfill + Plaid auto-match) planned. See `docs/SQUARE-INTEGRATION.md`.
- **Bidirectional cashflow categorization for refunds** — `OtherIncome` ↔ `OtherExpense` both directions (deposit-as-OtherExpense = vendor refund; withdrawal-as-OtherIncome = customer refund). Sub-form labels direction-aware via `autofillCategorizeValues.isDepositTransaction`. **GL writer recovers direction from `cashflow_transactions.uncategorized_transaction_id` source-row sign** — `BankTransactionGL` reads `source.amount > 0` for OtherIncome/OtherExpense, overriding fixed `typeMeta.direction`. Commit `3562a0abb` (orig `68a420fc4` read typeMeta verbatim → wrong-direction journal). Old rows need back-link backfill + per-row Edit Category re-save (recipe in commit msg).
- **Credit card as Bill payment account** — `New Payment Made` AccountsSelect + `BillPaymentValidators.getPaymentAccountOrThrowError` allow `CREDIT_CARD` alongside `BANK`/`CASH`/`OTHER_CURRENT_ASSET`. GL account-agnostic (always credits `paymentAccountId`) → CC payment posts `DR AP / CR Credit Card Liability`. Commit `5525a688a`.
- **Vendor-credit refunded-amount sync** — `RefundSyncVendorCreditBalanceSubscriber` was commented out in NestJS migration → `refundedAmount` never bumped, status stuck Open. Re-enabled via `RefundSyncCreditRefundedAmount` (per-id `.findById(id).increment(...)`; sibling table-wide service in same dir has no `where('id',…)` — footgun, leave uncalled). Commit `d40e5b275`. Backfill: `UPDATE VENDOR_CREDITS vc LEFT JOIN (SELECT VENDOR_CREDIT_ID, COALESCE(SUM(AMOUNT),0) AS refunded FROM REFUND_VENDOR_CREDIT_TRANSACTIONS GROUP BY 1) r ON r.VENDOR_CREDIT_ID = vc.ID SET vc.REFUNDED_AMOUNT = COALESCE(r.refunded, 0);`.
- **Reconcile aside accepts equity accounts** — Owner Drawings / Owner Contribution on leftover-amount cashflow txn. Dropdown allows `equity` both directions; `transformToReq` maps via `account_root_type` → `owner_drawing` (withdrawal) / `owner_contribution` (deposit).
- **Bill direct-account allocations** — `bill_expense_categories` table; `Bill.categories` HasMany; `total` getter adds `categoriesTotal`. GL: DR per category vs expense account, AP CR sums items + categories. Submit allows empty `entries` if categories non-empty (vice versa). `DeleteBill` cascades. **Run tenant migrations.** v1: no percent/landed-cost/CSV/PDF.
- **Vendor credit direct-account allocations** — mirror of bills (CR per category). `vendor_credit_expense_categories`. **`total` getter MUST be `subtotal - discountAmount + adjustment`** (matches Bill/SaleInvoice/CreditNote) — `subtotal === amount` already includes `categoriesTotal` via DTO transformer; adding again doubles AP debit. Commit `771403d4d`.
- **Invoice direct-account allocations** — revenue mirror. `sale_invoice_income_categories`; `SaleInvoice.categories` + `categoriesTotal` virtual; transformer writes `itemsTotal + categoriesTotal` into `balance`. GL: CR per category vs income account at indexGroup 15 (items 10, tax 30); AR DR sums both. **`GetSaleInvoice` MUST `.withGraphFetched('categories.incomeAccount')` AND transformer MUST expose `categories`** — without both, edit form hydrates empty and next save's `upsertGraphAndFetch` deletes every row (data destruction). Commit `877284f72`.
- **Credit note direct-account income allocations** — AR mirror of invoice. `credit_note_income_categories`. **GL direction reversed vs invoice**: DR per category vs income account. Transformer writes `itemsTotal + categoriesTotal` into `amount`. Same hydrate-empty-deletes-rows trap if `withGraphFetched` + transformer field aren't both wired.
- **Shared allocations helpers** — all four types (Bill/VendorCredit/SaleInvoice/CreditNote) share code. **Add new allocation types here, don't clone.**
  - Server `packages/server/src/modules/_shared/allocations/AllocationCategory.helpers.ts`: `normalizeAllocationCategories`, `validateAllocationAtLeastOneLine`, `validateAllocationCategoryAccountsType`, `mapAllocationLedgerEntries`.
  - Webapp `packages/webapp/src/containers/_shared/Allocations/`: `AllocationsCategoriesEditor`/`Table` (param by `accountField`/`accountRootType`/`labelKey`), `utils.ts`, `schema.ts`.
  - **Pitfall**: `AllocationsCategoriesTable` is NOT form-context-aware — every caller must pass `accounts={accounts}` (from `useAccounts({ page_size: 10000 })`). Omit → dropdown silently empty.
  - Per-form `utils`/`schema` keep one-line wrappers. `AccountNormal` imported from `@/modules/Accounts/Accounts.types` (re-exports `@/interfaces/Account`).
- **Descriptive report-PDF download filenames** — all 17 financial-statement PDF dialogs build filename via shared `buildReportPdfFilename(reportSlug, httpQuery)` in `packages/webapp/src/containers/FinancialStatements/common.tsx`. Output `slug_YYYY-MM-DD_to_YYYY-MM-DD_basis_YYYY-MM-DD-HHmm.pdf` (range) / `slug_as-of_..._....pdf` (as-of). Handles `from_date`/`to_date`, `as_date`, `basis`/`accounting_method`. Replaced hardcoded `download={'invoice.pdf'}` on 5 reports. Commit `a2fbb5446`.
- **Bank/cash account cards (cashflow-accounts) overhaul** — (1) default alphabetical (name A–Z) with server-side **sort dropdown** in `CashFlowAccountsActionsBar`; (2) colored circular **type badge** top-right (bank=blue/cash=green/credit-card=violet; clearing=teal `swap-horiz`); (3) titled **sections**: Cash → Checking → Savings → Bank → Clearing → Credit Card (empty hidden; unmatched → "Other Accounts"). Checking/Savings/Clearing from nullable `accounts.bank_account_subtype` column (migration `20260530160000`; `checking|savings|clearing|other|null`) set via **"Account Subtype"** dropdown in Account dialog (shown for Bank + Other-Current-Asset; Checking/Savings/Other bank-only, Clearing both — Clearing is the ONLY subtype that surfaces an OCA account on the cashflow page). `GetBankAccounts` returns cash/bank/credit-card **plus** any `bank_account_subtype='clearing'` → OCA clearing accounts (Square/Stripe/DoorDash settlement) surface on cashflow page **without changing balance-sheet type**. New column flows through DTO spread + transformer `toJSON()`. Commits `a6e9f0070`, `7e1ac92be`, `3ee410e72`, `6640838e8`. **Run tenant migrations.** **QA-hardening follow-up** (commits `78cfbd4d3`, `3ef138e9b`, `8ebd9df0b`, `82cd1b5ab`, `54b90f801`): subtype literals (`checking|savings|clearing|other`) centralize in **`BANK_ACCOUNT_SUBTYPE`** (`@/constants/accountTypes`) — dialog/grid/badge all consume it + the global `ACCOUNT_TYPE`, so **add new subtypes there, don't clone**; the subtype field validates via `.oneOf([...Object.values(BANK_ACCOUNT_SUBTYPE), '', null])` — the **`''` no-subtype sentinel** (form default in `AccountDialogForm.tsx` + reset on type change) MUST stay in the list or untyped accounts 400 on save; sort labels are i18n under `banking.accounts.sort.*` (was hardcoded English). The cash-card badge icon `payments` already exists in `static/json/icons.tsx` as an **unquoted** key — when auditing the icon set, grep both quoted (`'name':`) and unquoted (`name:`) forms.
- **Invoice & Bill list default sort + per-user persistence** — both default **oldest-first** by date; persists across full reload via shared `store/persistListSort.ts` (`createListSortPersistConfig` — persists only `tableState.sortBy` via redux-persist transform + `autoMergeLevel2`). See "List table-state defaults" gotcha. Commit `0771c21e7`.
- **"Bill(s)" → "Purchase Invoice(s)" relabel** — user-facing labels only via `lang/en/index.json` **values**; i18n keys, routes (`/bills`), models, API, `resource:'Bill'`/`value:'Bill'` unchanged. "Billing"/"Billed to/from"/"Billable"/"Bill To" (customer) left as-is. Commit `6858851b2`.
- **Removed global Lemon Squeezy script** — `app.lemonsqueezy.com/js/lemon.js` no longer in `index.html` (was on every page incl. pre-auth login — referer leak + supply-chain). Three subscription call sites guard `window.LemonSqueezy?.` with `window.open(url)` fallback. Commit `37a007768`.

## Active gotchas (rules to follow)

Break these and recreate the bug. Post-mortems in `docs/FORK-BUG-HISTORY.md`.

### Server / NestJS

- **`SerializeInterceptor` mutates inbound `request.body` + `request.query` snake→camelCase.** New webhook handlers (Square/Stripe/Plaid) MUST read camelCase (`merchantId`, not `merchant_id`). `req.rawBody` holds original bytes for HMAC.
- **`require('@/...')` does NOT resolve at runtime in Objection `relationMappings`.** `@/` alias is compile-time `import` rewrite only. Use relative paths in `static get relationMappings()`.
- **`filterSupportFeatures` is async — `await` it.** Goes through async `getResourceFields2(...)`. Non-awaited Promises are truthy → silently keep Branch/Warehouse fields required.
- **New importables need `@ImportableService({ name })`.** Use the literal resource string the webapp sends if it differs from model class. Check: `grep -L '@ImportableService' packages/server/src/modules/**/*Importable*.ts` should print nothing.
- **Resource-name aliases**: webapp string ≠ model class name (e.g. `PaymentReceive` vs `PaymentReceived` model) → add to `RESOURCE_NAME_ALIASES` in `Resource/_utils.ts`. Don't rename the model.
- **`Scope.TRANSIENT` + property injection + class-field arrow methods is a Nest trap.** Symptom: `<prop>.<method> is not a function`. TRANSIENT proxy wrapper lacks instance methods. **Default for new services: constructor injection, default singleton scope.** Tenant model proxies are CLS-aware factories (singleton consumers still resolve per-tenant). If TRANSIENT truly needed, declare methods as `public foo(...)` (prototype), not class-field arrows.
- **NestJS-migration commented-out subscribers compile fine and register nothing.** A whole-file `//`-commented Typedi subscriber (`// @Service()`/`// @Inject()` shape at top, e.g. `RefundSyncVendorCreditBalanceSubscriber.ts`) compiles, Nest sees no provider, the effect silently never runs. Treat as broken — port to `@OnEvent` + `@Injectable` + module registration. Candidates: `grep -l '// @Service()\|// @Injectable' packages/server/src/modules/**/subscribers/*.ts`.
- **List-query DTOs validating `sortOrder` with `@IsEnum(ISortOrder)` 400 on the webapp's lowercase `asc`/`desc`.** `transformTableStateToQuery` emits lowercase `sort_order` but `ISortOrder` is uppercase `ASC`/`DESC` (symptom: "no … with current filter criteria", Network `message[].constraints.isEnum`). Sibling DTOs extending `DynamicFilterQueryDto` use `@IsString()` and are immune. Fix: `@Transform(({value}) => typeof value === 'string' ? value.toUpperCase() : value)` **before** `@IsEnum(ISortOrder)`. Bit `BankAccountsQueryDto` + `GetAccountsQueryDto`; commit `ec13d5b99`. **When adding a default/served `sortBy`, grep its server DTO for `@IsEnum(ISortOrder)` first.**

### Knex / MariaDB

- **MariaDB on Linux is case-sensitive for table names.** `knexSnakeCaseMappers({ upperCase: true })` emits UPPER CASE — actual tables are `SQUARE_CONNECTIONS`, `EXPENSE_PAYMENT_SPLITS`. Use uppercase in mysql CLI.
- **Knex unique/index names overshoot MySQL's 64-char limit** (UPPER-CASE mapping). Pass explicit short name: `table.unique([cols], 'uq_short_name')`.
- **Stuck migration lock**: `UPDATE knex_migrations_lock SET is_locked = 0;` on the affected tenant DB.
- **Vendor/customer empty `code`**: `CONTACTS_CODE_UNIQUE` rejects second `''` (MySQL: `''` dup, `NULL` non-dup). DTOs coerce falsy `code` → `null`. Existing rows: `UPDATE CONTACTS SET CODE = NULL WHERE CODE = '';`.
- **Never `whereRaw` with literal table/column names.** Bypasses `snakeCaseMappers({ upperCase: true })`. Use `whereColumn('a.col','b.col')`, `?? = ??` bindings, or structured `.where()`/`.whereNull()`. Same for `joinRaw`/`select(knex.raw(...))` with literal identifiers. Worst case: callers in `PromisePool` (e.g. `GetMatchedTransactions.service.ts`) swallow per-task errors → 200 OK, missing rows, no log.
- **Raw-SQL `static get modifiers` silently fail when chained with `withGraphJoined` inside a PromisePool task.** A `dueBills` modifier using `raw('COALESCE(AMOUNT,0)-... > 0')` works alone but throws chained with `withGraphJoined('matchedBankTransaction')` — PromisePool swallows it, empty 200. **Filter "remaining due" on the model virtual in JS after the query** — or rewrite modifier with `??` bindings. Commits `83c4545fd` → `bc3dfeef2`.
- **Never run parallel writes on a Knex transaction.** `trx` is not concurrency-safe — parallel `INSERT`s give non-deterministic per-row failures. **Never `async.queue` without an error handler** (fire-and-forget swallows failures; `await queue.drain()` resolves regardless). Combined: bad row vanishes silently, UoW commits, only symptom is a trial-balance imbalance weeks later. Use sequential `for…await` for per-row writes that must all succeed. Any "queue concurrency > 1 inside a UoW trx" is suspect.
- **`UnitOfWork.withTransaction` must `await` both `commit()` and `rollback()`.** Already correct in `Tenancy/TenancyDB/UnitOfWork.service.ts` — keep it.
- **Trial-balance audit recipe**: `SELECT REFERENCE_TYPE, REFERENCE_ID, SUM(DEBIT)-SUM(CREDIT) AS diff FROM ACCOUNTS_TRANSACTIONS GROUP BY 1, 2 HAVING ABS(SUM(DEBIT)-SUM(CREDIT)) > 0.005` names every unbalanced leg-set. Once it names a doc, **first step is server logs at the surviving GL row's `CREATED_AT`** — `docker compose logs --since … --until … server | grep -A 20 'ERROR \[Event\]'`. Nest's event-emitter wraps subscribers in try/catch and only logs, so per-row INSERT failures (FK, `ER_DATA_TOO_LONG`) bail the saveEntries `for…await` loop after the AR/AP debit lands, UoW commits, green toast. Swallowed-INSERT is more common than concurrency — check logs before chasing Promise.all/async.queue. Join `ITEMS_ENTRIES` on `(REFERENCE_ID, ITEM_ID, ACCOUNT_ID)` for missing legs.
- **`ACCOUNTS_TRANSACTIONS.NOTE` is `TEXT`** (was `varchar(255)`, migrated 2026-05-28, commit `227b77893`). GL writers copy `ItemEntry.description` verbatim into ledger `note`; >255-char descriptions used to throw `ER_DATA_TOO_LONG` and lose every credit leg downstream of AR debit (SaleInvoice 114 break).

### Cascading deletes (service-layer pattern)

- **Service-side cascade**, NOT DB-level `ON DELETE CASCADE`. Explicit `.where('parentId', id).delete()` inside parent's UoW trx. Precedent: `expense_transaction_categories`, `expense_payment_splits`.
- **When adding a child table, audit the parent's Delete service.** Missing line = 500 FK violation. With a backfill migration the bug is universal from day one.
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

- **Pagination order, running-balance walk, and infinite-scroll direction are coupled — change together.** Reads oldest→newest (top→bottom). `GetBankAccountTransactionsRepo` paginates `date asc, created_at asc`; running balance walked oldest→newest (opening = net of `pageSize × (page-1)` older rows, zero on page 1; apply-then-capture so each row shows balance _after_ it); client `AccountTransactionsDataTable` sets `initialSortBy={[{ id:'date', desc:false }]}` to MATCH server so initial client sort is a no-op and pages append at bottom. Mismatched client sort re-sorts each page to top → "list won't load, scroll+click a header to fix." Commit `77be587aa`. Validate balance changes with `SUM(DEBIT-CREDIT) OVER (ORDER BY DATE, CREATED_AT)`.
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

- **`FSelect` dropdowns (and `AccountsListFieldCell`) filter in-memory** — form provider MUST request `page_size: 10000` on `useVendors`/`useCustomers`/`useAccounts`/`useItems`/`useBranches`/`useProjects`/`useWarehouses`/`useTaxRates` and every list hook feeding a select. Symptom: a selected id whose record lives past page 1 renders as an **empty dropdown row**, looks like "value got deleted" on edit re-open. Commit `3b6d4b105`. Grep every `useXxx(` for missing `page_size`.
- **`FDateInput` call sites must spread `momentFormatter('MM/DD/YYYY')`** — upstream `@blueprintjs-formik/datetime` serializes via `Date.toISOString()` / parses via `new Date(str)`, both crossing local↔UTC → day-shift in non-UTC clients. `momentFormatter` (`packages/webapp/src/utils/index.tsx`) round-trips tz-free `YYYY-MM-DD` (parser slices first 10 chars). Check: `grep -L 'momentFormatter' <file>` for any file touching `FDateInput`.
- **moment.js `MM` vs `mm`**: `MM` = month, `mm` = minutes. `HH:MM` renders current month as the minute (old report-footer bug).
- **Currency-math gates need ε tolerance, not `> 0`.** Floating dust (~1e-13) formats as `$0.00` but `> 0` is true → excess-credit dialog fires on a balanced payment ("record $0.00 as credit"). Use `> 0.005`. Commit `a5893e40c` (`PaymentMadeForm` + `PaymentReceiveForm`); grep other money gates when touching this area.
- **New report PDF dialogs MUST use `buildReportPdfFilename`** from `FinancialStatements/common.tsx` for `<AnchorButton download={...}>`. Check: `grep -rn "download={'" packages/webapp/src/containers/FinancialStatements/` should print nothing.
- **Entry-total helpers must coerce `amount` to number — never `sumBy(rows, 'amount')`.** Trailing empty line carries `amount: ''`; lodash `sumBy` concatenates (`2500 + '' === "2500"`), then `"2500" + 0 === "25000"` — silent 10× on whole-dollar docs. `getEntriesTotal` in `Entries/utils.tsx` sums `toSafeNumber(entry.amount)`; apply same coercion to any new sum over form rows. Commit `0e40703a3`.
- **Document discounts: `null`/missing `discount_type` means fixed amount, NOT percentage.** Edit forms strip null fields on hydrate (`transformToForm`) → default `discount_type` to `'amount'` on hydrate. Server: all six doc models' `discountAmount` getter must read `=== DiscountType.Percentage ? subtotal*discount/100 : discount` (treating not-Amount as percentage made a `$111.53` fixed discount post as `111.53%` → `$497.56`). Commit `193e615d2`.
- **List table-state defaults + persistence (invoices/bills pattern).** Default sort lives in `defaultTableQuery.sortBy` in `store/<Resource>/*.reducer.tsx` (e.g. `[{ id: 'invoice_date', desc: false }]` / `[{ id: 'bill_date', desc: false }]`, both **oldest-first**), mapped to `column_sort_by`/`sort_order` by `transformTableStateToQuery`. Three things make it stick:
  - **Across Edit round-trip (popup → `/…/edit` → back):** do NOT `reset…TableState()` on list unmount; pass `initialSortBy={tableState.sortBy || []}` + `autoResetSortBy={false}` to `DataTable`. Redux survives SPA nav.
  - **Across full page reload:** reducer's redux-persist CONFIG must persist the sort — use shared `createListSortPersistConfig(STORAGE_KEY)` from `store/persistListSort.ts` (NOT `whitelist: []`); persists only `tableState.sortBy` (transform + `autoMergeLevel2`). Pass same CONFIG to `persistReducer` and `purgeStoredState`.
  - **Server must accept the sort key.** `column_sort_by` resolved by `DynamicListService` via `model.getField(key)` → `sortBy[0].id` must be a field key in the model's `*.meta.ts` `fields` (`invoice_date`, `bill_date`; cashflow accounts `name`/`code`/`balance`/`type`/`created_at` — note `balance`→`amount` column). Unknown key throws server-side.
  - Commits `e569bfc13` (orig), `0771c21e7` (oldest-first + reload persistence + bills parity), `a6e9f0070` (cashflow-accounts sort dropdown).
- **Form `onError` reads `response.data.errors`, but the global class-validator pipe returns `response.data.message`** (array of ValidationError). Pipe (`common/pipes/ClassValidation.pipe.ts`) is `whitelist: true` (no `forbidNonWhitelisted`) → a 400 on save is a field-level DTO failure in `message`. Symptom: silent `AxiosError`, no toast. Read the Network `message` array; surface `message` in form `onError`.
- **Blueprint `<Tooltip>`/`<Popover>` with a dynamic child must guard empty values.** A `null`/`''`/`undefined` child renders no target and logs `[Blueprint] <Popover> requires target prop or at least one child element` on every blank cell. Shared `TextOverviewTooltipCell` (`components/DataTableCells/`) returns `null` early when empty — keep that, apply to any new Popover/Tooltip whose single child is a data value. Warning fires on load→render (`onSuccess → setData → re-render`), NOT on request failure — get Network status + body before theorizing about a 400. Commit `48ba12e8f`.
- **Account `account_type` is locked on edit (by design).** `AccountDialog` disables type select in Edit/NewChild/NewDefinedType (`getDisabledFormFields`). When a feature needs an account in a different bucket, prefer a non-type marker over a type change/SQL conversion — `bank_account_subtype='clearing'` is the precedent (surface by tag, widen list query, keep real type). Commit `6640838e8`.

## Conventions

- **Naming**: Containers `bigcapital-fork-*` (staging), `bigcapital-sandbox-*` (sandbox). Image tags `:uat-v*` (staging), `:sandbox-v*` (sandbox). Networks `bigcapital_fork_network` + volumes `bigcapital_prod_fork_*` (staging); `bigcapital_sandbox_network` + volumes `bigcapital_sandbox_*` (sandbox). Both attach public containers to external `portal-net`.
- **i18n labels**: Title Case for headers/labels ("Payment Date"). "Note" not "Statement" for memo. "Reference No." consistently.
- **Date format on financial reports**: single source = tenant Preferences → General → Date Format. `FinancialSheetMeta.meta()` exposes `dateFormat` (→ `date_format` on webapp); shared `FinancialSheet.tsx` footer reads `meta?.date_format`. **Never hardcode a date format in a report container.**

---

# Deployment

Prod + UAT run via Docker (`docker-compose.prod.yml`). Traefik handles TLS, OAuth forward-auth, routing (NestJS API + Vite SPA). **Full guide: `docs/DEPLOY.md`. CI/CD runbook: `docs/CI-CD.md`.**

## Push-to-deploy (GHCR — sandbox + UAT)

`git push origin develop` → `.github/workflows/deploy.yml` builds linux/arm64 images for `server` + `webapp` → `ghcr.io/crxnit/bigcapital-{server,webapp}:sha-<short>` → Trivy HIGH/CRITICAL gate → SSH VPS → `deploy.sh` pulls, runs tenant migration, brings up server+webapp with `/api/health` smoke gate.

- **Sandbox + UAT auto-deploy on push to `develop`, in sequence**: sandbox first; UAT only if sandbox's smoke gate (and every earlier step) passes. **Docs-only pushes don't deploy** — `paths-ignore: docs/**, **/*.md, archive/**` (incl. `.claude/CLAUDE.md`). Mix code + docs in one push to deploy both. **`.github/workflows/**`is NOT in`paths-ignore`\** — pushing a workflow change triggers a deploy that runs with the *new\* workflow definition, so a workflow edit is self-validating (used to verify the Node 24 actions bump).
- **Manual single-env dispatch** (redeploy without new commit, e.g. after `.env` change): `gh workflow run deploy.yml -f environment={sandbox|uat}`. By ID if name fails: `gh api -X POST repos/crxnit/bigcapital/actions/workflows/275652569/dispatches --input - <<<'{"ref":"develop","inputs":{"environment":"uat"}}'`.
- **Legacy tarball compose files** (`docker-compose.prod.yml`, `docker/sandbox-bc/docker-compose.yml`) remain as rollback paths.

### Solo-dev workflow — no PR ceremony

Single-developer fork. Commit + push directly to `develop`; rides sandbox → UAT automatically. To gate a commit, hold off pushing — once on develop it lands on UAT as soon as sandbox passes. Don't open a PR / feature branch unless explicitly asked.

## Always-relevant deploy notes

- **Colima memory** for builds: ≥ 8 GB (Vite needs ~4 GB heap). `colima stop && colima start --cpu 2 --memory 8 --disk 20`. OOM symptom: `ResourceExhausted: cannot allocate memory`.
- **Image tarballs** (legacy) → `current-images/<env>/` (gitignored).
- **Migration `cwd` must be `/app/packages/server`** — system migration path (`./src/database/system/migrations`) is cwd-relative.
- **API rate limit**: NestJS throttler (`THROTTLE_GLOBAL_LIMIT`/`THROTTLE_GLOBAL_TTL`, `THROTTLE_AUTH_LIMIT`/`THROTTLE_AUTH_TTL`). Set `THROTTLE_GLOBAL_LIMIT=600`, `THROTTLE_AUTH_LIMIT=60`, `TTL=60000` (defaults 100/10 too strict for SPA). Legacy `API_RATE_LIMIT` NOT used. State in Redis — restart Redis to clear lockouts.
- **MinIO** (self-hosted S3 for attachments): `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION=us-east-1`, `S3_ENDPOINT=http://bigcapital-fork-minio:9000`, `S3_BUCKET=bigcapital-attachments`, `S3_FORCE_PATH_STYLE=true`. `createbuckets` one-shot creates bucket idempotently per `docker compose up`.
- **`docker compose restart` does NOT apply compose-file changes** — use `docker compose up -d <service>`.
- **Fonts**: NotoSans + Segoe must be in `packages/webapp/public/fonts/` for prod builds (Vite SCSS URL resolution doesn't hash them).
- **`GOTENBERG_DOCS_URL`** uses container name `http://bigcapital-fork-server:3000/public/` — must match `container_name`.

## Traefik

- **Dynamic files**, not Docker labels. Routers/services/middlewares in `*.yml` under Traefik's watched dir. Do NOT add `traefik.*` labels to compose.
- Bigcapital containers attach to Traefik's external network. Keep `mysql`, `redis`, `gotenberg`, `database_migration` internal-only. Container names drive dynamic-file service URLs — keep `container_name:` stable.
- **Routing split** (same host, path-prefix): `bigcapital-fork-api` (priority 10) `Host(host) && (PathPrefix('/api') || PathPrefix('/socket') || PathPrefix('/public'))` → `bigcapital-fork-server:3000` (sticky cookies for Socket.IO under scale-out). `bigcapital-fork-webapp` (priority 1) `Host(host)` catch-all → `bigcapital-fork-webapp:80`.

## OAuth pattern — network-level gate

OAuth forward-auth at Traefik edge is a **network-level access gate**, NOT identity federation:

- Wraps both routers; unauth → OAuth provider redirect. Bigcapital's internal `AuthModule` (JWT) remains identity source of truth. Users see two logins: OAuth once per browser session, Bigcapital signin once per JWT lifetime (1 day).
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

## Open items (CI/CD bring-up, 2026-05-13)

- **Staging `.env` missing**: `WEBAPP_BASE_URL`, `SQUARE_APPLICATION_ID`, `SQUARE_APPLICATION_SECRET`, `SQUARE_APPLICATION_ACCESS_TOKEN`, `SQUARE_ENVIRONMENT`, `SQUARE_OAUTH_REDIRECT_URL`, `SQUARE_TOKEN_ENCRYPTION_KEY` → Square on staging silently broken. Fix `/srv/portal/clients/staging-bc/.env` → `docker compose -f docker-compose.ghcr.yml up -d --force-recreate server`.
- **Trivy gate is warn-only.** Tighten to `exit-code: '1'` after dep cleanup: bump `@casl/ability` 5.x→6.x (CRITICAL proto pollution), dedupe `axios`, move `@babel/plugin-transform-modules-systemjs` out of prod install. TODO in `docs/CI-CD.md`.
- **Restic 0.12.1 on VPS** lacks compression (0.14+) and parallel prune (0.13+). Perf only.
- **Backup env-file naming**: sandbox `/etc/restic/bigcapital-sandbox.env`, staging `/etc/restic/bigcapital-staging-bc.env` (`-bc` leaks from dir basename in `vps-backup.sh`). Cosmetic.
- **Production deploy (Phase 9)** deferred until sandbox + staging ride a few real commits cleanly. Same recipe, new env dir/SSH key/GH Environment.
- **GHCR PAT** on VPS (`/root/.docker/config.json`) expires ~2027-05-12. Set reminder.
- **Node 24 actions bump — DONE 2026-05-30.** Swept all `.github/workflows/*.yml`/`.yaml` to node24-runtime majors: `actions/checkout@v6`, `actions/setup-node@v6`, `actions/upload-artifact@v7`, `actions/cache@v5`, `docker/setup-buildx-action@v4`, `docker/login-action@v4`, `docker/build-push-action@v7`, `pnpm/action-setup@v6`. Runners are GitHub-hosted ubuntu (meet the node24 ≥ runner-v2.327.1 requirement). **Still on older pins (intentional):** `docker/metadata-action@<SHA>` (security SHA pin — leave), `aquasecurity/trivy-action`/`rtCamp/action-slack-notify` (Docker container actions, no node runtime), `peter-evans/create-pull-request@v6` (not verified for node24 — bump when touching `generate-openapi.yml`). Context: Node 20 deprecated 2025-09-19; GitHub force-defaults node24 on 2026-06-02; removes node20 on 2026-09-16. `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` remains the fallback opt-in if a future action lags.
- **Containerd layer-extraction flake on rapid back-to-back deploys (2026-05-21).** `failed to extract layer ... link ... no such file or directory` in overlayfs; VPS-side `docker compose pull`, retry succeeds. **Monthly housekeeping cron WIRED 2026-05-31** (`deploy/vps-docker-prune.sh` + `deploy/bigcapital-{sandbox,uat}-docker-prune.cron`, 04:30/04:50 UTC on the 1st). Deliberately **scoped** (not daemon-global `system prune -af`): removes only the env's own exited containers (by `container_name` prefix) + bigcapital images >14d not backing a container — safe on the shared daemon. `vps-deploy.sh:80` already does a global `image prune -af` per deploy (reclaims images on every deploy; flag if co-tenant safety on the shared daemon matters). **Repo side done; still needs one-time VPS install** (`install` commands in `docs/CI-CD.md`).

## Future enhancements & known gaps

See `docs/FUTURE-ENHANCEMENTS.md`: multi-organization per user, behavioral hardening (security/audit). Hardening must complete before production data.

### Deferred

- **Receipts/invoices CSV import from scanning app** — shelved. Separate app OCRs receipts, emits paired CSVs (header + line items linked by `receipt_id`, Bill-vs-Expense indicator). Intended as dedicated import flow (not generic `Importable`), fuzzy-match vendors + line items (→ Items for bills, → Accounts for expenses), fallback "Unknown Vendor" + ad-hoc items. Open: CSV column contract; expense line→account vs single category; tax handling (candidate: bill `adjustment` field).
