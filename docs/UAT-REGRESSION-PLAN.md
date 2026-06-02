# Bigcapital Staging — Regression & UAT Plan

**Build under test:** `50d2a54bd` (Sandbox + Staging) · **Created:** 2026-06-01 · **Host:** https://staging.bc.jjocllc.com

Scoped to the ~2-week changeset (commits `0bc552f74` → `50d2a54bd`): GL/currency fixes, four new
direct-account allocation flows, banking-match rewrites, parent-account posting guard, webhook
hardening, and a whole-server backend QA pass.

The **GL Integrity Gate (§1) runs before and after** everything — it's the single highest-value
check, because most risky fixes are in ledger-writing paths where failures are silent (green toast,
imbalance surfaces later in a report).

**Priority key:** P0 = blocker / money-correctness · P1 = core flow · P2 = UX / cosmetic.

---

## Findings log

| ID             | Pri | Area                  | Status                                                                    | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------- | --- | --------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REGRESSION-001 | P0  | §3 allocations        | **Fixed + verified** (`InvoiceGLEntries.ts:31`, build `056eb355b`)        | Direct-account-allocation **sale invoice** posts AR debit, silently drops income credit leg (missing `categories` eager-load) → unbalanced. Found via §1 gate on `SaleInvoice 116`. Post-mortem in `docs/FORK-BUG-HISTORY.md`. **Cleanup done:** invoice 116 re-saved → DR 445 / CR 445 / diff 0.                                                                                                                                                                                                                                                                                                                                                                   |
| REGRESSION-002 | P0  | §3 allocations        | **Fixed + verified** (`CreditNoteGLEntries.ts:43`, build `9122f1a43`)     | Same root cause for direct-account-allocation **credit notes** (reads `creditNoteModel.categories`, fetch omitted it). **Verified:** `CreditNote 1` (GBP, rate 0.89, £15, alloc_rows=1) → 2 legs DR 13.35 = CR 13.35 (= £15×0.89 local), diff 0.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| BUG-003        | P2  | §2 FX (pre-existing)  | **Fixed + deployed** (`exchangeRates.tsx:26`, build `e360c6551`)          | Latest-exchange-rate auto-fetch 404'd: webapp called `/api/exchange_rates/latest` (underscore); server route is `/api/exchange-rates/latest` (hyphen). **Upstream bug since 2024-01-28**, not a changeset regression. Fixing the URL exposed BUG-004 underneath.                                                                                                                                                                                                                                                                                                                                                                                                    |
| BUG-004        | P2  | §2 FX (pre-existing)  | **Fixed** (`ExchangeRates.{service,application,controller}.ts`)           | After BUG-003, `/latest` 500'd: controller read a never-populated `req.tenantId` → `TenantMetadata.findOne({tenantId: undefined})` → Objection "undefined passed … for 'where'". Fix: resolve `tenantId` from `ClsService` (house pattern) + null-org guard (→400). Then a 400 `EX_RATE_SERVICE_API_KEY_REQUIRED` surfaced — staging's `OPEN_EXCHANGE_RATE_APP_ID` is the leaked template comment (`# [CHANGE] …`; docker `env_file` keeps inline comments). Final fix: **best-effort degrade — catch ANY provider failure → rate=1** + `warn` log, so the form always falls back to manual entry with no console error. Post-mortem in `docs/FORK-BUG-HISTORY.md`. |
| CONFIG-005     | P3  | infra / staging .env  | **Open (operational)**                                                    | Staging `OPEN_EXCHANGE_RATE_APP_ID` value is the leaked `.env.production` inline comment. Code now tolerates it (BUG-004), but clean the `.env` line (`OPEN_EXCHANGE_RATE_APP_ID=` no inline comment, or a real paid key) and audit other untouched template value lines. Auth/DB work → critical secrets were set properly. CLAUDE.md deploy note added.                                                                                                                                                                                                                                                                                                           |
| REGRESSION-006 | P1  | §3 allocations (edit) | **Fixed + verified** (`EditCreditNote.service.ts:124`, build `73d2970da`) | Editing a **published credit note** updated the doc but left its **GL stale** — reproduced: CN1 £15→£20, child+header=20 but GL still 13.35 (£15×0.89). Internally balanced so §1 gate misses it. Root cause: emitted bare `upsertGraph` result (lacks `openedAt` for already-published notes) → `onEdited` GL subscriber's `isPublished` gate falsy → rewrite skipped. **Affects all published-CN edits, not just allocations.** Fix: `upsertGraph` → `upsertGraphAndFetch` (mirrors EditSaleInvoice). Post-mortem + CLAUDE.md gotcha added. **Verified + cleaned:** CN1 re-saved → GL DR 17.80 = CR 17.80.                                                        |
| BUG-007        | P3  | §3 delete (cosmetic)  | **Open (cosmetic, won't fix mid-run)**                                    | After deleting an invoice, the webapp refetches the just-deleted entity → `GET /sale-invoices/:id` returns **400** (`{type:"SALE_INVOICE_NOT_FOUND", message:null}`) instead of **404**, logging a scary console error. Delete itself works fine (§3.2 cascade verified clean). Minor: missing-resource should be 404, and the post-delete invalidate shouldn't refetch a deleted id.                                                                                                                                                                                                                                                                               |

---

## DB connection cheat-sheet (verified 2026-06-01)

MariaDB on Linux is **case-sensitive**; Knex runs with `knexSnakeCaseMappers({ upperCase: true })`,
so physical tables/columns are **UPPERCASE**.

- **System DB** = `bigcapital_system` — holds `TENANTS`, `TENANTS_METADATA`, system users.
  - **Base currency** lives here: `TENANTS_METADATA.BASE_CURRENCY` (NOT in any tenant `SETTINGS` table).
- **Tenant DB** = per-org, named `bigcapital_tenant_<hash>` (`SHOW DATABASES LIKE 'bigcapital%'`, the
  non-`system` ones) — holds `ACCOUNTS_TRANSACTIONS`, `CONTACTS`, documents, etc. Staging has multiple
  orgs (verified 2026-06-01):
  - **`bigcapital_tenant_35i5f1mo1phc5w`** — 1038 ledger rows (primary test org; holds "Test FX" GBP customer).
  - `bigcapital_tenant_35i5f1mo1oztqd` — 4 ledger rows (secondary).
  - Both passed the §1 gate clean. **Confirm which DB holds your test org before testing** (see below)
    and run all §1/§2 SQL against that one.

```sql
-- Base currency (system DB)
SELECT T.ID AS tenant_id, T.ORGANIZATION_ID, TM.NAME AS org_name,
       TM.BASE_CURRENCY, TM.DATE_FORMAT
FROM   bigcapital_system.TENANTS T
JOIN   bigcapital_system.TENANTS_METADATA TM ON TM.TENANT_ID = T.ID;
```

---

## 0. Pre-flight (5 min)

| #   | Check                                                                          | Expected                                                                          |
| --- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 0.1 | App loads, sign in (OAuth → Bigcapital JWT)                                    | Dashboard renders, no console errors                                              |
| 0.2 | `/api/health` returns 200                                                      | Smoke gate green                                                                  |
| 0.3 | Browser console on a few pages                                                 | **No** Blueprint `<Popover> requires target` warnings; **no** LemonSqueezy errors |
| 0.4 | Confirm test org has FX currency set up (≥1 non-base-currency customer/vendor) | See below — **verified present:** "Test FX" customer, GBP (base = USD)            |

**§0.4 procedure** — base currency is in the system DB; the FX contact is in the tenant DB:

```sql
-- run against the per-org TENANT DB (not bigcapital_system)
SELECT ID, DISPLAY_NAME, CONTACT_SERVICE, CURRENCY_CODE
FROM   CONTACTS
WHERE  CURRENCY_CODE IS NOT NULL
  AND  CURRENCY_CODE <> 'USD';   -- paste BASE_CURRENCY from the system-DB query
```

Passes if ≥1 row. If empty: Preferences → Currencies (add e.g. GBP), then create a customer/vendor
with that currency in its **Financial** section. Base currency is **locked** once transactions exist
(`OrganizationBaseCurrencyLocking`) — don't try to change it.

> ⚠️ The **exchange rate is entered per-document, not on the contact.** Every §2 FX document MUST use
> a rate ≠ 1 (e.g. `1.27`). At rate = 1 local == foreign and the FX tests give a false pass.

---

## 1. ⚖️ GL Integrity Gate — RUN FIRST (baseline), and LAST (regression)

Master correctness check. Capture a **baseline imbalance set now**; re-run after §2–§6. Any _new_
unbalanced `(REFERENCE_TYPE, REFERENCE_ID)` is a regression. Run against the **tenant DB**.

```sql
SELECT REFERENCE_TYPE, REFERENCE_ID, SUM(DEBIT)-SUM(CREDIT) AS diff
FROM   ACCOUNTS_TRANSACTIONS
GROUP  BY 1, 2
HAVING ABS(SUM(DEBIT)-SUM(CREDIT)) > 0.005;
```

- **Expected:** ideally empty. Record existing rows as baseline.
- New row after a test → **stop, check server logs** at that GL row's `CREATED_AT` for swallowed
  `ERROR [Event]` (swallowed INSERT is more likely than concurrency):
  `docker compose logs --since … --until … server | grep -A 20 'ERROR \[Event\]'`
- Also eyeball **Trial Balance** + **Balance Sheet**: assets = liabilities + equity.

---

## 2. 💰 P0 — Ledger / Currency / Document Totals (highest risk)

Maps to `5ee475805`, `85d795131`, `193e615d2`, `0e40703a3`, `227b77893`.

| #   | Test                                   | Steps                                                     | Expected                                                              |
| --- | -------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| 2.1 | **Invoice in foreign currency**        | Invoice for "Test FX" (GBP), exchangeRate ≠ 1, post       | GL balanced in **local** currency; both legs same basis               |
| 2.2 | **Credit note + FX refund**            | Issue GBP credit note, then refund it                     | Zero-value legs omitted; refund posts in **local** currency; balanced |
| 2.3 | **Invoice write-off**                  | Write off an open invoice                                 | AR leg + expense leg same basis; balanced (`SaleInvoiceWriteoffGL`)   |
| 2.4 | **Fixed-amount discount**              | Doc with fixed `$` discount, `discount_type` left default | Applied as **dollar amount**, not %                                   |
| 2.5 | **Subtotal w/ trailing blank line**    | Add lines, leave trailing empty row, save                 | Subtotal correct — not 10× inflated                                   |
| 2.6 | **Long line description (>255 chars)** | Invoice line w/ 300-char description, save                | Saves; **all** GL legs present (NOTE is TEXT); balanced               |
| 2.7 | **Auto-numbering**                     | Create two invoices / bills back-to-back                  | Sequential, no collision/SQL error                                    |

FX leg-set check after 2.1/2.2:

```sql
SELECT REFERENCE_TYPE, REFERENCE_ID, SUM(DEBIT) dr, SUM(CREDIT) cr, SUM(DEBIT)-SUM(CREDIT) diff
FROM   ACCOUNTS_TRANSACTIONS
WHERE  REFERENCE_TYPE IN ('SaleInvoice','CreditNote','RefundCreditNote')
GROUP  BY 1,2
HAVING ABS(SUM(DEBIT)-SUM(CREDIT)) > 0.005;
```

---

## 3. 🧩 P0 — Direct-Account Allocations (4 new flows)

New surface: Invoice / Bill / VendorCredit / CreditNote line-level account allocation
(`1fb2030db`, `aeb5b5816`, `2342779cf` + shared helpers). Watch the
**hydrate-empty-deletes-rows** trap and paired-row error surfacing.

| #   | Test                                                                      | Expected                                                                        |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 3.1 | Create each of the 4 docs using **direct-account allocations** (no items) | Saves; GL posts to chosen accounts; balanced                                    |
| 3.2 | **Edit** each, re-open                                                    | Allocations re-hydrate (not blank); re-save doesn't drop rows                   |
| 3.3 | Percentage-based allocation (where supported)                             | Splits sum to 100%; rounding leaves no dust leg                                 |
| 3.4 | Trigger a paired-row validation error                                     | Error **surfaces in the form** (`response.data.message`), not silent AxiosError |
| 3.5 | **Delete** a doc that had allocations                                     | Child `*_categories` rows cascade-deleted, no FK 500                            |

---

## 4. 🏦 P0/P1 — Banking, Matching & Cashflow Accounts

| #    | Test                                                 | Pri | Expected                                                                                                                   |
| ---- | ---------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------- |
| 4.1  | **Parent-account posting guard**                     | P0  | Posting to an account with children → blocked (`POSTING_TO_PARENT_ACCOUNT_NOT_ALLOWED`); parents hidden from pickers       |
| 4.2  | **Cashflow accounts page**                           | P0  | Parents excluded; clearing accounts not double-listed; sections by type/subtype; sort dropdown; type badges + logos render |
| 4.3  | **Match — withdrawal** (amount<0)                    | P0  | SaleInvoice hidden; Bill/Expense/Cashflow/MJ shown                                                                         |
| 4.4  | **Match — deposit** (amount>0)                       | P0  | Bill & Expense hidden; SaleInvoice shown                                                                                   |
| 4.5  | **Partial-paid bill/invoice in match list**          | P0  | Shows **due** amount, not gross; matching balances                                                                         |
| 4.6  | **Cashflow match scoped to account**                 | P1  | Only candidates for selected payment account appear                                                                        |
| 4.7  | **Edit categorization** (change account/type)        | P1  | GL rewritten; old legs reversed; balanced                                                                                  |
| 4.8  | **Delete account** w/ matched + recognized bank txns | P1  | Cascades (matched/recognized/uncategorized cleared); no FK error; redirect off page; queries evicted                       |
| 4.9  | **Bank-txn CSV import** w/ new **Type** column       | P1  | Imports; bad rows give real error messages                                                                                 |
| 4.10 | **Account transactions register**                    | P1  | Oldest→newest; running balance = balance _after_ each row; infinite scroll appends at bottom (loads without header click)  |
| 4.11 | **Plaid sync / recognition rules**                   | P2  | Sync runs; rules apply to correct account scope                                                                            |

---

## 5. 💳 P1 — Payments

| #   | Test                                                       | Expected                                                                |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| 5.1 | **Credit card as Bill payment account** (New Payment Made) | Allowed; posts `DR AP / CR CC Liability`; balanced                      |
| 5.2 | **Credit card in Quick Payment Made**                      | Allowed (was inverted/blocked)                                          |
| 5.3 | **Vendor-credit apply-to-bills**                           | Bill balance syncs down; vendor-credit balance syncs (subscriber wired) |
| 5.4 | **Vendor-credit refund** create & delete                   | Refunded-amount syncs both ways; entered date preserved                 |
| 5.5 | **Net-zero payment** (excess credit applied exactly)       | **No** excess-credit dialog (ε tolerance, not `>0`)                     |
| 5.6 | **Payment Received** with FX                               | Balanced; cash ↔ AR only                                               |

---

## 6. 📊 P1 — Reports

| #   | Test                                                                                                           | Expected                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | Open all major statements (P&L, Balance Sheet, Trial Balance, GL, Cash Flow, AR/AP aging, Sales Tax Liability) | Render without error (35 files just had TS-checking restored)                                                                                                                                                                |
| 6.2 | **Sales Tax Liability** with a date range                                                                      | Range applied; null/empty tax-rate rows filtered correctly                                                                                                                                                                   |
| 6.3 | **PDF download** on every statement dialog                                                                     | Filename descriptive (`buildReportPdfFilename`), not generic                                                                                                                                                                 |
| 6.4 | Date format on reports                                                                                         | Matches tenant Preferences → General → Date Format                                                                                                                                                                           |
| 6.5 | ⚠️ **Cash-basis toggle**                                                                                       | **Known limitation:** only P&L implements the projection. Balance Sheet / GL / Trial Balance / Sales-Tax accept the flag but it's a **no-op**. Confirm P&L cash-basis works; note the others as expected-gap, not a new bug. |

---

## 7. 🔐 P1/P2 — Integrations & Security (verify, don't break)

| #   | Test                                                | Expected                                                                                                                                                    |
| --- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1 | **Square webhook** (if staging Square secrets set)  | HMAC verified vs `rawBody`; handler reads camelCase; posts SaleReceipt/CreditNote/MJ                                                                        |
| 7.2 | **Stripe checkout**                                 | Config/metadata correct; payment posts. ⚠️ no idempotency yet — don't redeliver                                                                             |
| 7.3 | **API key revoke**                                  | Revoked key rejected                                                                                                                                        |
| 7.4 | **Attachments** multi-file drop (≤10 files / 25 MB) | Uploads; thumbnails render                                                                                                                                  |
| 7.5 | ⚠️ Known-open (do **not** sign off as fixed)        | Public `GET /attachments/:id` IDOR; Plaid webhook sig verification; Stripe idempotency; `CategorizeTransactionAsExpense` unwired — all tracked in CLAUDE.md |

---

## 8. 🖥️ P2 — UI / List Behavior

| #   | Test                                             | Expected                                                                                |
| --- | ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 8.1 | Invoice & Bill lists                             | Default **oldest-first**; sort persists across edit round-trip **and** full reload      |
| 8.2 | "Bill" → "Purchase Invoice" relabel              | Labels updated; routes/URLs unchanged                                                   |
| 8.3 | FSelect dropdowns (vendor/customer/account/item) | A selected record beyond page 1 still renders (page_size 10000) — no empty dropdown row |
| 8.4 | Empty table cells                                | No Blueprint Tooltip console warnings                                                   |
| 8.5 | Date inputs (`FDateInput`)                       | No day-shift in non-UTC; round-trips correctly                                          |

---

## Sign-off checklist

- [ ] §1 GL gate: **no new unbalanced references** vs baseline (run last)
- [ ] §2 all P0 ledger/currency tests pass
- [ ] §3 all 4 allocation flows create + edit + delete clean
- [ ] §4.1–4.5 banking P0 pass
- [ ] §5 payments pass
- [ ] §6 reports render; known cash-basis gap noted
- [ ] Server logs reviewed for swallowed `ERROR [Event]` during the run
- [ ] Known-open items (§7.5) confirmed still tracked, not regressions

**Suggested order:** §0 → §1 baseline → §2 → §3 → §4 → §5 → §6 → §7/§8 → **§1 again** (final gate).
Budget ~3–4 hrs for a full P0+P1 pass, ~1 hr for P0-only smoke.
