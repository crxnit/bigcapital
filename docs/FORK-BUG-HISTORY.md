# Fork Bug-Fix History

Post-mortems for bugs fixed in this fork. Active gotchas (rules to remember) live in `.claude/CLAUDE.md`; this file is the archive of context for _why_ a fix was made.

For Square-specific bugs, see `docs/SQUARE-INTEGRATION.md`.

## Infrastructure / build

### Redis config permissions

`COPY --chown=redis:redis` in Redis Dockerfile.

### Migration path

`working_dir: /app/packages/server` in compose so system migration directory resolves correctly.

### Empty email verification token

`AuthMailSubscriber` skips sending verification email when `SIGNUP_EMAIL_CONFIRMATION=false` (token is empty).

### Rate limit env var mismatch

`API_RATE_LIMIT` in `.env.example` is a legacy/dead variable that the server doesn't read. Actual vars are `THROTTLE_GLOBAL_LIMIT`/`THROTTLE_GLOBAL_TTL` (default 100 req/60s) and `THROTTLE_AUTH_LIMIT`/`THROTTLE_AUTH_TTL` (default 10 req/60s). Updated deploy docs to reference the correct names.

### `sed` `|` delimiter conflicts with regex alternation

The sed snippet for image-tag bumps in `deploy.sh` uses `|` as the substitute delimiter to avoid escaping path slashes. That works fine for simple patterns but breaks when the regex itself uses `|` for alternation (e.g. `(server|webapp)`) — sed reads the inner `|` as another delimiter and errors with `unknown option to 's'`. Fix: switch the delimiter to `#` or run two simpler `sed` commands without alternation. The deploy.sh script uses the latter approach (per-target sed in a loop) and is unaffected.

### `docker/sandbox-bc/deploy.sh` syncs image tags but not other compose changes

The script's remote step runs a targeted `sed` against `docker-compose.yml` to bump only `bigcapital-fork-{server,webapp}:<env>-v<N>` tags. Any other compose change (new env-var passthrough, port change, new service, etc.) is invisible to the script and won't reach the host. After making such a change in the repo, manually edit `/srv/portal/clients/<env>-bc/docker-compose.yml` on the host (or `scp` the updated file in) before running `up -d --force-recreate`. Otherwise the new env var is in the image but won't be injected into the running container.

## UI labels and date handling

### UI label inconsistencies

Standardized "Statement"→"Note", "Reference #"→"Reference No.", date/account field capitalization, "Full Amount"→"Amount", credit note using invoice date label, vendor credit using bill date label, withdrawal account mislabeled as deposit account.

### DateInput "Invalid date" on calendar navigation

Blueprint v4.4.37's `DatePicker.handleMonthChange` fires `onChange(null)` when the user clicks an already-selected day during month navigation. `handleDateChange` in `packages/webapp/src/utils/index.tsx` now guards against `null` before calling `moment(date).format(...)`.

### Date format inconsistency

All 50 date input/edit fields across the app standardized to `MM/DD/YYYY` via `momentFormatter('MM/DD/YYYY')`. Replaced `YYYY/MM/DD`, `YYYY-MM-DD`, and locale-dependent `toLocaleDateString()` patterns.

### Date inputs shifted by ±1 calendar day on save / display

Every form built on `FDateInput` from `@blueprintjs-formik/datetime` — invoice / money in & out / expense / journal / vendor financial / project / etc. — saved dates on the wrong calendar day. The picker's `parseDate` returns a JS Date at _local_ midnight, but the upstream Formik bridge then calls `Date.toISOString()` on it, tagging the instant `Z` and shifting the calendar day in any non-UTC client. The default parser compounds it on edit by reading a bare `YYYY-MM-DD` string with `new Date(str)`, which JS treats as **UTC** midnight, then re-displaying it in local tz. Direction of the shift depends on the user's tz vs the server's, but the round trip is always unstable. Fixed by overriding `formFormatDate` and `formParseDate` in the shared `momentFormatter` helper (`packages/webapp/src/utils/index.tsx`) so every FDateInput site round-trips through Formik as a tz-free `YYYY-MM-DD` string. `formParseDate` slices the first 10 characters of the incoming value so existing server responses (DATE columns serialized as ISO instants like `"2026-05-13T00:00:00.000Z"`) still round-trip without a server-side change.

### "Other Income" label confusing in Category dropdown

`banking.other_income` i18n key in `src/lang/en/index.json` renamed from "Other income" to "Income". The underlying value `other_income` is kept as-is (accounting term for non-operating income; stored in DB). The label "Expenses" (for `other_expense`) already omitted "Other" — this makes income consistent.

## List pages, filters, pagination

### Import preview auto-refresh

`staleTime: Infinity` and `refetchOnWindowFocus: false` on import preview/meta queries. Added missing `Account` case to `invalidateResourcesOnImport()`.

### List pagination broken

`DynamicFilterQueryDto` was missing `page` and `pageSize` fields so the whitelist validator stripped them and server defaults always won. Added both fields to the shared DTO so all list endpoints (expenses, bills, invoices, etc.) respect the client's requested page and page size. Also corrected the expense list default from 12 to 20 to match the UI selector.

### Filter button crashes all list pages

`GET /resources/:model/meta` returned the meta object directly. After `SerializeInterceptor` applies camelToSnake the response body IS the meta object, but the webapp does `res.data.resource_meta` expecting it wrapped. Always received `undefined`, fell back to empty fields, and the filter component crashed. Fixed by returning `{ resourceMeta }` from the controller so the interceptor emits `{ resource_meta: {...} }`.

## Forms and selects

### Vendor selector missing from expense form

Added vendor/payee field (`payee_id`) to the expense form header, wired to `useVendors` via `ExpenseFormPageProvider`.

### Vendor/customer duplicate code constraint

`CONTACTS_CODE_UNIQUE` rejects a second empty-string `code` (MySQL treats `''` as duplicate but `NULL` as non-duplicate). Fixed in `CreateEditVendorDTO.ts` and `CreateEditCustomerDTO.service.ts` by coercing falsy `code` to `null` before insert/update. Existing rows with `CODE = ''` must be patched manually: `UPDATE CONTACTS SET CODE = NULL WHERE CODE = '';` on each tenant DB. **Done on staging 2026-04-21** for both tenant DBs (`bigcapital_tenant_35i5f1mo1oztqd` and `bigcapital_tenant_35i5f1mo1phc5w`).

### Expense form vendor/customer dropdowns missed older records

`ExpenseFormPageProvider` called `useVendors({}, {})` and `useCustomers()` with no `page_size`, so the server returned only the default first page. `VendorsSelect` / `CustomersSelect` filter purely client-side over the `items` prop, so vendors and customers beyond page 1 never appeared in the dropdown and weren't searchable either. Fixed to `useVendors({ page_size: 10000 })` and `useCustomers({ page_size: 10000 })` to match the bill / invoice / vendor-credit-note form providers. **Reminder for any new form**: dropdowns built on `FSelect` filter in-memory — the provider must request a large enough page or those records are invisible.

## Attachments / S3

### Attachment upload S3 endpoint crash

`S3.module.ts` now only passes `endpoint` and `forcePathStyle` to `S3Client` when `S3_ENDPOINT` is non-empty. An empty/missing `S3_ENDPOINT` previously caused `ERR_INVALID_URL` (500) on every file upload.

### Attachment upload ACL error

Removed hardcoded `acl: 'public-read'` from `multerS3` config in `Attachment.module.ts`. Modern S3 buckets and MinIO have ACLs disabled by default; the setting was also dead code (`true ? 'public-read' : 'private'`). Files are served via presigned URLs so no public ACL is needed.

### Attachment upload path-style routing

`S3_FORCE_PATH_STYLE` was missing from the server's environment block in `docker-compose.prod.yml`. Without it the AWS SDK constructs virtual-hosted URLs (`{bucket}.{host}`) which fail DNS on MinIO. Added `- S3_FORCE_PATH_STYLE=${S3_FORCE_PATH_STYLE}` to the compose env block. Note: `docker compose restart` does not apply compose file changes — use `docker compose up -d server` after any compose or env update.

### Attachment view URL unreachable from browser

`GetAttachmentPresignedUrl.ts` now returns a server-proxied URL (`BASE_URL/api/attachments/:key`) when `S3_ENDPOINT` is set, instead of a presigned URL containing the internal MinIO hostname. Real AWS S3 (no custom endpoint) continues using presigned URLs.

### Attachment view 401

`GET /attachments/:id` marked `@PublicRoute()` so it is accessible without a JWT. The file key acts as the implicit auth token (same model as a real presigned URL); Traefik OAuth gates the deployment at the network level.

### Attachment view 500

`mime-types` is a CJS module with no default export; changed `import mime from 'mime-types'` to `import * as mime from 'mime-types'` in `Attachments.controller.ts`.

## Bank-transaction categorize / match flows

### Categorize transaction category dropdown resets to "Other income"

All six account sub-components in `CategorizeTransactionFormContent.tsx` were `React.lazy`-loaded. The `<Suspense>` boundary sits above `<Formik>`, so selecting any new type suspended the lazy module, unmounted the entire form, and remounted it from `initialValues` (always `other_income` from the server autofill). Fixed by converting to static imports — the sub-components are in the same lazy chunk as the drawer anyway.

### Categorize transaction sub-form doesn't switch when type changes

`CategorizeTransactionFormSubContent` used `useFormikContext()` to read `transactionType`, but the `FastField[name='category']` ancestor was blocking re-renders triggered by changes to a different field. Fixed by calling `useField('transactionType')` directly in `CategorizeTransactionFormContent` (the parent) and passing the value as a prop to `CategorizeTransactionFormSubContent` — guaranteeing a re-render whenever the field changes.

### Edit categorization dialog: account dropdown empty and unfiltered

`AccountsSelect` was called with `items={[]}` so no accounts ever appeared. Added `useAccounts()` and a `CATEGORY_ACCOUNT_ROOT_TYPES` map so the dropdown filters to the correct account type when the transaction type changes. Also fixed `'OwnerDrawings'` → `'OwnerDrawing'` to match the server's `CASHFLOW_TRANSACTION_TYPE` constant (mismatch would cause a server validation error on save).

### Categorize transaction Category dropdown limited to 3 options

`CategorizeTransactionFormContent` filtered `transactionTypes` to only MoneyIn or MoneyOut options based on `isDepositTransaction`. Fixed to show all 6 types always, with the direction-relevant options ordered first (`[...MoneyInOptions, ...MoneyOutOptions]` for deposits, reversed for withdrawals).

### Match aside silently dropped _all_ expense candidates on MariaDB-on-Linux

After the split-payment-aware matching feature shipped, the matching aside on every bank transaction stopped showing expense candidates entirely — bills, invoices, manual journals, and cashflow candidates kept appearing, so it looked like matching "mostly worked" and the missing rows seemed account-/date-specific. Root cause: `GetMatchedTransactionsByExpenses.ts` filters out already-matched splits with a `whereNotExists(...)` subquery whose inner JOIN was written with two `whereRaw('matched_bank_transactions.reference_id = expense.id')` / `... .reference_sub_id = expense_payment_splits.id` clauses. `whereRaw` is verbatim and bypasses Knex's `snakeCaseMappers({ upperCase: true })`. On MariaDB-on-Linux (`lower_case_table_names=0`) the actual tables are `MATCHED_BANK_TRANSACTIONS` / `EXPENSE_PAYMENT_SPLITS`, so the subquery threw `Table 'tenant.matched_bank_transactions' doesn't exist`. The error was swallowed by `GetMatchedTransactions.service.ts`'s `PromisePool.withConcurrency(2).process(...)` — per-task errors go to `results.errors` and are never read; only `results.results` is flattened — so the API returned a 200 with the other four candidate types intact and zero expense candidates, no log unless you went looking. Fixed by replacing both `whereRaw` calls with `whereColumn(...)` so the identifier mapper runs and the qualifiers come out as `MATCHED_BANK_TRANSACTIONS.REFERENCE_ID` / `EXPENSE_PAYMENT_SPLITS.ID` etc. Diagnostic that nailed it: running the service's effective SQL by hand — uppercase identifiers returned the expected splits, lowercase identifiers errored with "table doesn't exist".

### `DELETE /accounts/:id` 500 — `matched_bank_transactions` FK blocks uncategorized cleanup

`DeleteUncategorizedTransactionsOnAccountDeleting` subscriber did `uncategorized_cashflow_transactions.where('accountId', oldAccount.id).delete()` without first dropping rows that reference those uncategorized rows from `matched_bank_transactions.uncategorized_transaction_id` and `recognized_bank_transactions.uncategorized_transaction_id`. Both FKs default to RESTRICT. Symptom: user "removed all transactions" (categorized bank-side cashflow) but matched/recognized rows persisted; account delete returned 500. The event-emitter's per-subscriber try/catch swallowed the inner FK error and logged it as `[Event]`, so the parent `DeleteAccount` continued and hit its own `ACCOUNTS_*` FK on the bare `accounts.id` delete — second 500 with a different constraint name, masking the real cause. Frontend's `AccountDeleteAlert` then crashed with `Cannot read properties of undefined (reading 'find')` because the generic Nest 500 body has no `errors` array. Fixed in `DeleteUncategorizedTransactionsOnAccountDeleting.ts`: collect uncategorized IDs first, delete `matched_bank_transactions` and `recognized_bank_transactions` rows that reference them, then delete the uncategorized rows. Also added the `BankingMatchingModule` import to `BankAccountsModule` so `MatchedBankTransaction` is injectable. Hardened the frontend alert to fall back to `errors ?? []` when the response shape is non-standard.

While in the file, also guarded `revertRecognizedTransactions(foundAssociatedRulesIds, null, trx)`: when this account had no associated rules, `castArray([]).length === 0` fell through the inner `if (rulesIds.length > 0)` rule filter in `RevertRecognizedTransactions.service.ts` and the query would have reverted every recognized transaction across every bank account. Latent — the parent FK failure aborted before damage could land — but worth not relying on that. The subscriber now skips the call when there are no rule IDs.

### Categorizing a deposit as OtherExpense (vendor refund) posted as a withdrawal

The bidirectional-categorize feature (commit `68a420fc4`) relaxed `validateUncategorizeTransactionType` so `OtherIncome` is allowed on withdrawals (customer refund reducing income) and `OtherExpense` on deposits (vendor refund reducing expense), and the categorize sub-form's labels became deposit/withdrawal-aware. The commit message said "the cashflow GL is already direction-aware via the bank transaction `isCashCredit`/`isCashDebit`" — it isn't: those virtuals read `typeMeta.direction`, which is hard-coded `OUT` for OtherExpense and `IN` for OtherIncome, with no signal from the original deposit/withdrawal direction. So a vendor refund deposit categorized as OtherExpense posted `DR Expense / CR Cash` (a second outflow) instead of `DR Cash / CR Expense`, and the cash account drifted out of balance with the bank statement. Validator + UI were correct; the GL writer was the missing piece. Fix recovers the original sign from the source uncategorized transaction: `transformCategorizeTransToCashflow` now stamps `uncategorizedTransactionId` on the new `cashflow_transactions` row (column existed since migration `20240308122047` but was never populated), `BankTransaction` gains a `uncategorizedTransaction` BelongsToOne relation, `BankTransactionGLEntries.writeJournalEntries` hydrates it, and `BankTransactionGL` overrides `isCashCredit`/`isCashDebit` based on `source.amount > 0` _only_ for OtherIncome/OtherExpense — all other types still fall through to `typeMeta` unchanged. Backfill for rows produced before the fix: first restore the back-link (`UPDATE CASHFLOW_TRANSACTIONS ct JOIN UNCATEGORIZED_CASHFLOW_TRANSACTIONS uct ON uct.CATEGORIZE_REF_ID = ct.ID AND uct.CATEGORIZE_REF_TYPE = 'CashflowTransaction' SET ct.UNCATEGORIZED_TRANSACTION_ID = uct.ID WHERE ct.UNCATEGORIZED_TRANSACTION_ID IS NULL;`), identify wrong-direction rows (`SELECT ct.ID FROM CASHFLOW_TRANSACTIONS ct JOIN UNCATEGORIZED_CASHFLOW_TRANSACTIONS uct ON uct.ID = ct.UNCATEGORIZED_TRANSACTION_ID WHERE ct.TRANSACTION_TYPE IN ('OtherIncome','OtherExpense') AND ((ct.TRANSACTION_TYPE = 'OtherExpense' AND uct.AMOUNT > 0) OR (ct.TRANSACTION_TYPE = 'OtherIncome' AND uct.AMOUNT < 0));`), then hit Edit Category on each in the UI — `EditCategorizeBankTransaction` runs `revertJournalEntries + writeJournalEntries`, which now writes the correct direction. Commit `3562a0abb`.

### Match aside showed "undefined for $X" on cashflow-typed possible matches

Five sibling transformers populate `transsactionTypeFormatted` (typo intentional, both webapp and server agree). Bills/Expenses/Invoices/ManualJournals hardcode their label string; only `GetMatchedTransactionCashflowTransformer` read `transaction.transactionTypeFormatted` from the model. That virtual attribute was listed in `BankTransaction.virtualAttributes` but its getter was commented out, so the field was always undefined → `${undefined} for $X` rendered as the literal string. Fixed the cashflow transformer to compute the label via `getCashflowTransactionFormattedType(...)` + `i18n.t(...)`. Also cleaned up two related issues at the same time: removed the orphan `'transactionTypeFormatted'` from `BankTransaction.virtualAttributes` (and deleted the commented-out getter), and fixed `BankTransactionTransformer.transactionTypeFormatted` which was calling `i18n.t('OtherIncome')` directly (PascalCase, no namespace match) instead of mapping through `getCashflowTransactionFormattedType` first to get `'transaction_type.other_income'`.

## CSV import

### CSV import 500 for Customer / Vendor / SaleReceipt / Bill / TaxRate

`POST /api/import/file` errored with `No importable service found for resource "X". Make sure the resource has an @ImportableService decorator registered.` `@ImportableService({ name })` registers the importable in a `Map` at module-load time via the decorator side-effect, but five upstream importables shipped _without_ the decorator: `CustomersImportable`, `VendorsImportable`, `BillsImportable`, `SaleReceiptsImportable`, `TaxRatesImportable`. (Items, SaleInvoices, Expenses, etc. all had it.) Fixed by adding the decorator to each. `TaxRate` is registered with the literal string `'TaxRate'` because the model class is `TaxRateModel` while the webapp sends `TaxRate` as the resource name; using `TaxRateModel.name` would mismatch.

**Sanity check for any new importable**: `grep -L '@ImportableService' packages/server/src/modules/**/*Importable*.ts` should print nothing.

### CSV import enum fields silently rejected ("X is a required field")

For fields with `fieldType: 'enumeration'` (e.g. `Item.type` with options `inventory|service|non-inventory`), the import-row parser at `Import/_utils.ts` was matching CSV values only against `option.label` case-insensitively. But option labels in the model meta are i18n _keys_ (`'item.field.type.service'`) and `ResourceService.localizeField` only translates `field.name` and `field.importHint` — never the option labels. So no possible CSV value could match: neither the localized label (`Service`), nor the lowercase key (`service`), nor anything reasonable. The parser silently set the field to `undefined`, then the Yup `required()` check fired with the misleading message _"Item Type is a required field"_ even though every CSV row populated it. Fixed by also matching against `option.key` (case-insensitive). Lowercase enum keys (`service`, `inventory`, `non-inventory`) now work directly.

**CSV authoring rule for enum fields**: emit the lowercase key — `service`, `inventory`, `non-inventory`, etc. — not the labels.

### `filterSupportFeatures` ignored its async dependencies, leaving Branch/Warehouse fields always required

`ResourceService.filterSupportFeatures` filters out fields gated by `Features.BRANCHES` / `Features.WAREHOUSES` when those features are off. But it called the async `branchesSettings.isMultiBranchesActive()` / `warehousesSettings.isMultiWarehousesActive()` _without_ awaiting them, capturing the returned `Promise<bool>` into `isMultiFeaturesEnabled`. Promises are objects → always truthy → `!isMultiFeaturesEnabled` is always `false` → the filter never removed the field, regardless of what was in the SETTINGS table. Symptom: SaleInvoice (and any model with `features: [Features.BRANCHES]` on a field) imports failed with _"Branch is a required field"_ / _"Warehouse is a required field"_ on every row, even with no `features` rows in `SETTINGS` and no UI toggle. Fixed by making `filterSupportFeatures` async and awaiting the two settings calls. Cascaded `async`/`await` through `getResourceFields2`, `getResourceColumns` (now both return Promises), and the five callers across Import + Export modules.

**Lesson for any new feature-gated field**: the `features:` array on a field's meta only takes effect if `filterSupportFeatures` actually runs against awaited booleans — the path goes through `getResourceFields2(...)` which is now async, so callers must `await`.

### `PaymentReceive` resource name doesn't match the `PaymentReceived` model class

The webapp sends `PaymentReceive` (no `-d`) as the resource for both the importable lookup and `getResourceModel`, but the Nest provider + Importable were registered under `PaymentReceived`. CSV import errored with _"Nest could not find PaymentReceive element"_ at `ResourceService.getResourceModel`. Fixed in two places: (1) added a `RESOURCE_NAME_ALIASES` map in `Resource/_utils.ts` so `resourceToModelName('PaymentReceive')` returns `'PaymentReceived'`, and (2) registered `PaymentsReceivedImportable` under the literal string `'PaymentReceive'` (same precedent as `TaxRate`/`TaxRateModel`).

When you see _"Nest could not find X element"_ on import for some resource, add an alias entry — don't rename the model class.

### `CustomersImportable` doesn't dedupe by Display Name — re-imports bloat the table 1:1

Every row in customers.csv calls `createCustomer` unconditionally, no upsert by Display Name. Re-uploading the same customers.csv (e.g. to pick up new Square customers) creates a fresh row for every existing customer, doubling the contact list. The other transactional importables don't have this problem because their natural keys are deterministic and unique-checked: items by `Item Name` (Bigcapital errors `name already exists`), invoices by `Invoice No.` (errors `INVOICE_NUMBER_NOT_UNIQUE`), payment-received by `Payment Receive No.`, sale-receipts by `Receipt Number` (we use `REC-${payment.id.slice(-8)}` deterministic per Square payment).

Fix when this happens: a `MERGE + DELETE` pass against `CONTACTS` keyed on (DISPLAY_NAME, CONTACT_SERVICE) — keep the lower ID (older, has transactions), copy any non-empty newer email/company onto it via COALESCE, delete the higher ID. The bulk SQL is a single `UPDATE ... JOIN` + `DELETE c2 FROM ... INNER JOIN c2 ON c1.ID < c2.ID`.

**Practical workflow rule for refreshing Square data into an already-imported tenant**: items / invoices / invoice_payments / receipts are safe to re-upload (collisions silently skip); customers is NOT — either skip the re-upload or run the dedupe SQL after.

## Expenses

### `DELETE /expenses/:id` 500 — `expense_payment_splits` FK never cleaned up

After the split-payment-expenses feature shipped, `DELETE /api/expenses/:id` returned 500 on every attempt. The fork's `20260423100000_create_expense_payment_splits_table.ts` migration declares `expense_id` as a plain FK to `expenses_transactions(id)` with no `ON DELETE CASCADE`, and the companion backfill `20260423100001_backfill_expense_payment_splits.ts` inserts a split row for every existing expense — so post-migration, _every_ expense had at least one child row, and _every_ delete tripped the FK. `DeleteExpense.service.ts` already deletes `expense_transaction_categories` rows explicitly under the same `trx` before deleting the expense; the new `expense_payment_splits` table needed the same treatment but was missed when the feature landed. Fix: inject `ExpensePaymentSplit` and add a `.where('expenseId', expenseId).delete()` line right after the categories cleanup. `BulkDeleteExpensesService` delegates per-row to `DeleteExpense`, so it's covered too. The frontend `Cannot read properties of undefined (reading 'find')` from `ExpenseDeleteAlert` was downstream noise — the alert's error-handler tried to look up an i18n message on the empty 500 body and threw; it disappears once delete succeeds.

**Lesson — when adding a child table whose FK references an existing parent**: the fork's pattern is service-side cascade (explicit `.delete()` lines under the parent's UoW transaction), not DB-level `ON DELETE CASCADE`. Audit the parent's Delete service whenever you add a child table — a missing line is a 500 waiting to happen, and won't surface in dev until something populates the child row. The backfill migration here meant "production-only" cases were instantly universal.

## Payments / vendor credits

### Excess-credit dialog fired on perfectly balanced payments

New Payment Made / New Payment Received showed the "Would you like to record the excess amount of **$0.00** as credit payment?" dialog when entries summed to exactly the payment amount. `getPaymentExcessAmountFromValues` / `getExceededAmountFromValues` compute `totalAmount - sum(entries.payment_amount)` and the gate fired on `> 0`; with IEEE-754 dust (e.g. `315.72 - (183.42 + 0 + 87.38 + 44.92)` ≈ `1e-13`) the result is a positive value formatted as `$0.00` — true `> 0`, dialog appears. Fixed both gates to `> 0.005` (half a cent — matches the existing split-payment validator tolerance). Generalizes: any currency-math `> 0` gate in payment / allocation / reconcile flows is suspect by default. Commit `a5893e40c`.

### VendorCredit refunded-amount never decremented — status stuck on Open

VendorCredit's `isClosed` virtual is `openedAt && creditsRemaining === 0` where `creditsRemaining = max(amount - refundedAmount - invoicedAmount, 0)`. Creating a `RefundVendorCredit` posts the GL legs fine but never bumps the parent's `refundedAmount`, so the credit stays Open with the full balance even after the refund deposit is recorded, categorized, and reconciled. Root cause: `RefundSyncVendorCreditBalanceSubscriber.ts` was a wholly `//`-block-commented Typedi file the NestJS migration left in place — TS compiles, Nest registers no provider, no subscriber listens to `events.vendorCredit.onRefundCreated` for the balance side. (The GL side was wired by `RefundVendorCreditGLEntriesSubscriber`; only the balance subscriber was dead.) The companion `RefundSyncCreditRefundedAmount.service.ts` (scopes by id via `findById`) had no callers anywhere; an alternative `RefundSyncVendorCreditBalance.service.ts` in the same dir does an _unscoped_ `vendorCreditModel().query().increment('refundedAmount', amount)` — would corrupt every VC in the tenant if wired, footgun left uncalled. Fix re-implements `RefundSyncVendorCreditBalanceSubscriber` against `@OnEvent(events.vendorCredit.onRefundCreated)` / `onRefundDeleted`, routed through `RefundSyncCreditRefundedAmount` (the per-id one). Wired into `VendorCreditsModule` with `VendorCreditsRefundModule` imported and `RefundSyncCreditRefundedAmount` exported. Backfill for stuck-Open VCs: `UPDATE VENDOR_CREDITS vc LEFT JOIN (SELECT VENDOR_CREDIT_ID, COALESCE(SUM(AMOUNT),0) AS refunded FROM REFUND_VENDOR_CREDIT_TRANSACTIONS GROUP BY 1) r ON r.VENDOR_CREDIT_ID = vc.ID SET vc.REFUNDED_AMOUNT = COALESCE(r.refunded, 0);`. Commit `d40e5b275`.

Generalizes: NestJS-migration commented-out subscribers (`// @Service()` / `// @Injectable()` at the top) compile and register nothing — silent dead code waiting for a use case. `grep -l '// @Service()\|// @Injectable' packages/server/src/modules/**/subscribers/*.ts` flags candidates worth porting before the next stuck-status bug.

### Bill payment account dropdown excluded Credit Card accounts

`New Payment Made` form's AccountsSelect filter and `BillPaymentValidators.getPaymentAccountOrThrowError` both allowlisted only `BANK` / `CASH` / `OTHER_CURRENT_ASSET` as payment-account types. Paying a vendor bill on a credit card is a legitimate journal — `DR AP / CR Credit Card Liability` is the AP-to-CC liability transfer — but the user couldn't select the CC account from the dropdown, and even if a request bypassed the UI the server validator would reject it. The GL writer is account-agnostic (always credits `paymentAccountId`), so adding `CREDIT_CARD` to both allowlists was sufficient — no GL changes. Commit `5525a688a`.

## Ledger / GL emission

### Trial Balance off by clean dollar amounts — silent partial commits in `LedgerEntriesStorage.saveEntries`

The trial balance was off by $260 in Feb and $1,312.51 in March (cumulative). Drilling in by `(REFERENCE_TYPE, REFERENCE_ID)` showed 19 SaleInvoices across Feb–May 2026 each missing exactly one credit leg — the A/R debit and most credits were present, but one specific line item's CR row was simply absent from `accounts_transactions`. The missing row's amount always equalled the per-invoice imbalance to the cent, and no obvious data attribute (sell account, item id, line position, rate, quantity, discount) distinguished missing rows from present ones — strong signal of a non-deterministic write failure. Root cause: `LedgerEntriesStorage.service.ts:saveEntries` ran ledger-entry inserts via `async.queue(this.saveEntryTask, 10)` — concurrency 10 inside a single Knex transaction, with no `error` listener and `await drain()` that resolves regardless of per-task failures. Whichever entry's `INSERT` happened to lose a connection-state race (Knex transactions are not safe for concurrent queries; the underlying mysql2 driver serializes via its own queue and surfaces errors like "Cannot reuse trx", "lock wait timeout", or transient state mismatches) had its task error swallowed by the queue's missing handler — the queue continued, `drain()` resolved cleanly, and the wrapping unit-of-work committed thinking everything succeeded. Fix: replace the queue with a sequential `for…await` loop. While there, also fixed `UnitOfWork.withTransaction` which called `_trx.commit()` and `_trx.rollback()` without `await`, so the surrounding function could return before the trx finished — a separate latent bug that didn't cause this issue but was the same shape (silent partial completion). Removed the now-dead `saveEntryTask` and `ISaveLedgerEntryQueuePayload` interface in the same pass.

**Data backfill**: 20 INSERTs total — 19 missing CR legs (one per affected invoice) plus a $18 A/R top-up on invoice 106 (whose A/R debit was emitted as the subtotal $1593 instead of subtotal + $18 adjustment = $1611, so the $18 OtherCharges CR leg sat on top of an under-emitted A/R DR). Verification chain: per-invoice diff = 0, per-month diff = 0 across all months in the books, and the master `HAVING ABS(SUM(DEBIT)-SUM(CREDIT)) > 0.005` master query returns Empty Set.

**Diagnostic recipe for future GL audits** (kept in CLAUDE.md): trial-balance imbalance → group `ACCOUNTS_TRANSACTIONS` by `(REFERENCE_TYPE, REFERENCE_ID)` and `HAVING ABS(SUM(DEBIT)-SUM(CREDIT)) > 0.005` — names the offending transactions in seconds. Then per-invoice/expense, join `ITEMS_ENTRIES` (or relevant child table) to existing GL legs by `ITEM_ID + ACCOUNT_ID` to spot which line wasn't emitted. Generate INSERTs that mirror the existing GL pattern; wrap in `START TRANSACTION` and verify before `COMMIT`.

## Financial reports

### Profit & Loss "Cash Basis" toggle was a no-op

`GET /reports/profit-loss-sheet?basis=cash` returned identical numbers to `basis=accrual`. The flag was declared on `IProfitLossSheetQuery` (`ProfitLossSheet.types.ts:63`) and accepted on the DTO, but `ProfitLossSheetRepository.accountsTotal` / `accountsDatePeriods` never inspected it — both methods only filtered by date range and branches. Real-world impact: a catering customer's August event was invoiced in February, and the unpaid February revenue showed on both bases.

The naive fix — drop `SaleInvoice` GL rows on cash basis — is wrong. `PaymentReceive`'s GL only moves cash ↔ AR; it never touches the revenue account. Dropping `SaleInvoice` rows would leave cash-basis revenue stuck at zero for every AR-driven business. The correct fix has to **synthesize** revenue/expense recognition from payment events.

Implementation in `packages/server/src/modules/FinancialStatements/_shared/CashBasisProjection.{service,helpers}.ts`:

1. On cash basis, the repo runs the existing accrual SQL with `whereNotIn('referenceType', ['SaleInvoice','Bill','CreditNote','VendorCredit'])` so accrual-only document rows are excluded. Direct cash transactions (`CashflowTransaction`, `ManualJournal`, expenses from the Expense form) already write GL against revenue/expense accounts at the transaction date — they survive the filter and pass through unchanged.
2. `CashBasisProjection` loads the four payment-side document types (`PaymentReceive`, `BillPayment`, `RefundCreditNote`, `RefundVendorCredit`) in the date range, walks each link entry to the originating invoice/bill/credit-note, and projects synthetic GL rows: `accountId = line.sellAccountId` (or inventory-aware `costAccountId` for bills), `credit/debit = line.totalExcludingTax × document.exchangeRate × (paymentAmount / document.total)`, `date = payment.paymentDate`, `branchId = payment.branchId`. Refunds emit on the reversal side (DR revenue / CR expense).
3. The repo merges direct + projected aggregates by `accountId` (and period for the `accountsDatePeriods` path), back-fills the graph-fetched `account` model for any accountId present only in the projection, and returns rows shaped identically to the accrual path so downstream `Ledger.fromTransactions` consumers don't change.

Verification recipe (covers the brief's scenarios): unpaid invoice in Feb → cash $0 / accrual $1,000 in Feb; $300 payment in April → cash $300 / accrual $0 in April; full range Feb–April → cash $300 / accrual $1,000.

Unit tests in `CashBasisProjection.spec.ts` cover the proration math, multi-line fan-out, FX, inventory-vs-cost account selection, refunds, and period bucketing.

### Cash-basis P&L 500'd on first sandbox test — Nest `Scope.TRANSIENT` + property injection + class-field arrow methods

Manual verification of the cash-basis fix on sandbox surfaced `this.cashBasisProjection.aggregateTotals is not a function` on every `/api/reports/profit-loss-sheet?basis=cash` request. Unit tests passed (14/14) because the helpers tested were the pure functions in `CashBasisProjection.helpers.ts` — the service-level injection wiring was never exercised by tests. The accrual path was unaffected because it never touched `this.cashBasisProjection`.

Root cause: `CashBasisProjection` was declared `@Injectable({ scope: Scope.TRANSIENT })` and consumed via `@Inject(CashBasisProjection) public cashBasisProjection: CashBasisProjection` (property injection) inside the also-TRANSIENT `ProfitLossSheetRepository`. Nest's per-context proxy wrapper for TRANSIENT-scoped injection exposed a value to `this.cashBasisProjection` that didn't have the instance methods set by the constructor — the class-field arrow assignments (`public aggregateTotals = async (...) => {…}`) run in the constructor and end up on the new instance, but the proxy the consumer received was a different object. Compiled `__decorate` metadata showed both injections (the working `tenancyContext` and the broken `cashBasisProjection`) emitted identically — the difference was that `TenancyContext` is default-scoped (singleton) and `CashBasisProjection` was TRANSIENT.

Fix (`9fa81cd14`):

1. **Drop `Scope.TRANSIENT`** from `CashBasisProjection`. The service is stateless — its only dependencies are the four payment-side tenant model proxies, which are themselves CLS-aware factories registered with `type: 'function'` in `Tenancy.module.ts`. A singleton consumer calling `this.paymentReceivedModel()` still resolves to the tenant-bound model for the current request.
2. **Switch to constructor injection.** `constructor(@Inject(...) private readonly fooModel: …, …) {}`. This is the canonical Nest pattern and avoids the property-injection-into-TRANSIENT proxy interaction entirely.

The Nest trap is now captured as an active gotcha in `.claude/CLAUDE.md`. Default rule for new services: constructor injection + default singleton scope unless TRANSIENT is genuinely needed; if it is, define methods as regular `public foo(...)` rather than class-field arrows.

**Test gap noted**: the unit tests covered the projection _math_ but not the Nest wiring. Future projection-shaped services should land with at least one wiring test (e.g. a minimal `Test.createTestingModule(...)` that instantiates the consuming repository and exercises the method via Nest's DI), or accept that the first manual integration test is the wiring test.

### Sibling reports with the same `basis`-flag gap (deferred to follow-up PRs)

All four other financial reports accept a `basis` query parameter and silently ignore it — `grep -rn "basis" packages/server/src/modules/FinancialStatements --include="*.ts"` lists them; none of the four sibling repository files contain a `basis` reference. Fixes scoped out of the P&L PR:

- **Balance Sheet** (`BalanceSheetRepository.ts` + `BalanceSheetRepositoryNetIncome.ts`) — accepts `basis` but ignores it. Cash-basis BS is more involved than P&L: AR / AP balances should be zero (no accruals on the books), retained earnings flows from cash-basis P&L net income, and the same projection has to feed both repos. Worth a dedicated PR.
- **General Ledger** (`GeneralLedgerRepository.ts`) — accepts `basis` but ignores it. Conceptually, cash-basis GL excludes accrual-only document GL rows; same `whereNotIn` filter applies but the report shows individual entries, not aggregates, so the projection rows would need to be returned as ungrouped synthetic line items.
- **Cash Flow Statement** (`CashFlowRepository.ts`) — accepts `basis` but ignores it. By construction the report models cash movement, so basis may be conceptually moot, but the flag is still misleading; the UI surfaces the toggle as if it changes numbers.
- **Sales Tax Liability Summary** (`SalesTaxLiabilitySummaryRepository.ts`) — accepts `basis` but ignores it. Cash-basis tax liability should recognize tax only on actual cash receipts; correct fix requires the same projection plus tax-line proration. Probably the most accounting-policy-sensitive of the four.

Same diagnostic recipe applies to each: grep `basis` in the report module, then look at the repository's data-fetch query for the absence of `whereNotIn` on accrual-only `referenceType`s and the absence of a projection union.

## Documents — discounts, totals, list ordering (2026-05-29)

### Fixed-dollar discount read as a percentage when `discount_type` was null

Editing an invoice (#114) to add a `$111.53` discount stored it but showed the discount as `$497.56` and a total of `-$51.44`. Root cause: `discountAmount` getters on all six document models (`SaleInvoice`, `Bill`, `CreditNote`, `SaleReceipt`, `VendorCredit`, `SaleEstimate`) computed a fixed amount **only** when `discountType === DiscountType.Amount` and fell through to `subtotal * discount / 100` for everything else — including a `NULL`/`undefined` type. The invoice was created with no discount (`discount_type` NULL); the webapp edit form strips null fields on hydrate and never sent `discount_type`, so a bare `111.53` was read as `111.53%` of the `$446.12` subtotal (`497.56 × 100 / 446.12 = 111.53` confirms it). Fix (commit `193e615d2`): inverted the getter to compute a percentage **only** when the type is explicitly `DiscountType.Percentage`; null/undefined/amount all behave as a fixed amount (mirrors the `discountPercentage` getter). Also defaulted `discount_type` to `'amount'` on invoice edit-form hydration. `SaleEstimate.dto`/`Bill.dto` already defaulted `discountType = Amount`; `SaleInvoice.dto` did not. Computed getter, so display corrects on read; rows whose GL discount leg was physically written wrong need one Edit→Save to rewrite the ledger.

### Subtotal inflated 10× on edit (`"2500" + 0 === "25000"`)

Opening a whole-dollar invoice for edit showed Subtotal/Total/Due at 10× (e.g. `$2,500` → `$25,000`) while the line-item Total stayed correct. `getEntriesTotal` used `sumBy(entries, 'amount')`; the always-present trailing empty line (added by `ensureEntriesHaveEmptyLine` **after** the numeric recompute) carries `amount: ''`, so lodash concatenated: `2500 + '' === "2500"`. A string total was harmless flowing straight into `formattedAmount` (coerces), so the bug sat dormant until the direct-allocations feature added `itemsTotal + categoriesTotal` to `useInvoiceSubtotal` — `"2500" + 0 === "25000"`. Only bit whole-dollar invoices (`"334.59" + 0 === "334.590"` ≈ unchanged), which is why it looked intermittent. Fix (commit `0e40703a3`): `getEntriesTotal` sums `toSafeNumber(entry.amount)`, always returning a number. Fixes all six forms (Invoice/Bill/Estimate/CreditNote/Receipt/VendorCredit) that share the helper. Display-only — the server recomputes `balance` from `quantity × rate` numerically, so no data was corrupted.

### Invoices list: no default sort + sort lost after editing

The invoices list had no default sort and reset its entire table state on unmount, so opening an invoice from the row popup's Edit (routes to `/invoices/:id/edit`) wiped the sort, and returning landed unsorted. Fix (commit `e569bfc13`): `defaultTableQuery.sortBy = [{ id: 'invoice_date', desc: true }]` (mapped to `column_sort_by`/`sort_order`, the same server path a header click uses); `InvoicesDataTable` passes `initialSortBy={invoicesTableState.sortBy}`; removed the `resetInvoicesTableState()` unmount effect so sort/page/filters survive the edit round-trip (SPA nav keeps Redux state; full reload still falls back to the default).

### Bank account transactions list — load jank + register ordering

The account transactions list "didn't load properly" on large accounts (scroll down/up + click a header to get a coherent list). It combines infinite scroll (pages of 50, served **newest-first** `date desc, created_at desc`), client-side react-table sorting, and a react-virtualized `WindowScroller`. The default client sort was **ascending**, fighting the server order: each older page pulled in by the scroll got re-sorted to the **top**, jumping the list. First shipped a newest-first default (`3608cf125`), then the user clarified the register should read **oldest → newest** (top → bottom). A client-only ascending flip would re-introduce the jank (and the bottom-anchored scroll observer could never reach older pages), so the final fix (commit `77be587aa`) is coordinated server + client:

- **Server paginates `date asc, created_at asc`** so page 1 = oldest and newer pages append at the bottom on scroll.
- **Running balance walked oldest → newest**: opening balance = balance **before** the page's oldest row = net of the `pageSize × (page − 1)` older rows (zero on page 1); then apply-this-row's-amount-then-capture so each row still shows the balance **after** its transaction. Validated against real data (account 1633): oldest row = its own amount, newest row = the account total.
- **Client `initialSortBy` back to ascending**, matching the server so the initial sort is a no-op.

**Still-open**: a possible separate react-virtualized `WindowScroller` initial-measurement issue ("rows don't render until you scroll once") was flagged but not fixed — it would need a change to the shared `TableVirtualizedRows` component and UAT verification. Pick up only if the symptom persists after the ordering fix.

### Prior-session error loop (diagnosis only)

The "perpetual loop of errors" the user reported from the previous session was a harness/API glitch — a `400 ... thinking or redacted_thinking blocks ... cannot be modified` baked into the conversation history, so every retry replayed the same rejected request. Cleared by restarting; nothing wrong in the repo. A secondary contributor was ~135 cascade-cancellation errors from batching `awk`/`ugrep`/`wc` Bash calls against a wrong path (`InvoiceForm/utils.ts` — the file is `utils.tsx`); one wrong-path failure cancels the whole parallel batch.

### RESOLVED (2026-05-30) — "edit-invoice 400" was a misdiagnosis; real issue was an empty-child Blueprint `<Tooltip>` warning on invoice OPEN

The "edit-invoice save returns 400" framing from the prior wrap-up was wrong — there was never a failing save. Capturing the actual evidence (user opened invoice **107**, not the stale-snapshot invoice 8) showed: the `GET /api/sale-invoices/107` returns **200** with valid data, and the only console output was a Blueprint render warning that fires on the **load→render** path (`onSuccess → setData → re-render`), not on any PUT:

```
[Blueprint] <Popover> requires target prop or at least one child element.
```

**Root cause**: `packages/webapp/src/components/DataTableCells/TextOverviewTooltipCell.tsx` rendered `<Tooltip content={value}>{value}</Tooltip>` unconditionally. Blueprint `<Tooltip>` wraps a `<Popover>`; when `value` is `null`/empty the `{value}` child renders nothing, so the Popover has no target/child and logs the warning. Invoice 107's line item #4 has `description: null` → the readonly entries table renders that cell with a null child → warning. Harmless (nothing breaks), but fires for any document with a blank description/name cell, and this cell is shared across the Invoice / Bill / Estimate / Expense / CreditNote / ManualJournal detail drawers.

**Fix**: return `null` early when `value` is `null`/`undefined`/`''`, only wrapping in a tooltip when there's content. Commit (this session).

**Process notes for next time** (two traps re-tripped this session): (1) **Anchor on real evidence before fan-out** — the original 400 theory came from a stale audit snapshot of the wrong invoice; one Network-tab response (status + body) collapsed the whole investigation. (2) **Cascade-cancellation**, exactly as the entry above warns: batching tool calls where one references a wrong path (`Drawers/InvoiceDetail/…`, the dir is `Drawers/InvoiceDetailDrawer/…`) cancels every sibling call in the same assistant turn — including unrelated Edits. When exploring unfamiliar paths, verify the directory first or issue calls one at a time.

The separate idea from the prior wrap-up — surfacing `response.data.message` in form `onError` handlers so genuine class-validator 400s aren't invisible — remains a valid latent improvement but was NOT the cause here and was not applied. Pick it up only if a real silent-400 surfaces.
