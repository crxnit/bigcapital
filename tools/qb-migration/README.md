# QuickBooks Desktop → Bigcapital migration tools

Standalone, zero-dependency helpers for migrating a QuickBooks Desktop file into Bigcapital
via the per-resource CSV importers. Not part of the app build — run them locally with the
stock Python 3.8+ interpreter.

## `qb_to_bigcapital_accounts.py` — Chart of Accounts

Converts a QuickBooks Desktop **Account Listing** export into a Bigcapital
Chart-of-Accounts import CSV.

### Get the input from QuickBooks

`Lists → Chart of Accounts → Reports (bottom) → Account Listing`, then
`Excel → Create New Worksheet`, save as CSV.

### Run

```bash
python3 qb_to_bigcapital_accounts.py INPUT.csv accounts.csv \
    --refine --default-currency USD
```

- `--refine` — name heuristics: `Inventory Asset → Inventory`, `*Sales Tax Payable → Tax Payable`.
- `--default-currency USD` — fills blank currency cells (else left blank → tenant base currency).
- `--allow-warnings` — exit 0 even when rows produced warnings. By default the script exits **1**
  if anything needs review, so a bad mapping can't slip into an import unnoticed.

### What it handles

- QuickBooks account type → Bigcapital type label (incl. `Other Asset → Non-Current Asset`).
- Colon sub-account paths `Parent:Child` → `name=Child` + `Parent Account=Parent`
  (parent linking is deferred server-side, so row order doesn't matter).
- Account-code window **3–6 chars, unique**: zero-pads short numeric codes, blanks codes that are
  too long / non-numeric-short / duplicate (all reported).
- Unique account names: disambiguates colliding leaf names as `Leaf (Parent)`.
- `Active/Inactive → T/F`.

### What it deliberately does NOT do

- **Opening balances.** The accounts importer has no balance field. With the journal-replay
  method, balances arrive naturally as you replay every transaction (see the journal tool below);
  for a TB-snapshot migration instead, post one **Manual Journal** from the QuickBooks Trial
  Balance as of cutover.

### The name-map sidecar (feeds the journal replay)

Alongside `accounts.csv` the tool writes **`accounts.namemap.json`** (override the path with
`--name-map`). Because sub-accounts were renamed to leaf-only and colliding leaves disambiguated,
the journal replay can't reference accounts by their original QuickBooks names without this map.
It records, lowercased for case-insensitive lookup:

- `by_full_name` — every QB full path (`Deposits in Transit:Square DIT`) → Bigcapital name (`Square DIT`)
- `by_leaf` — leaf → Bigcapital name, **unambiguous leaves only**
- `ambiguous_leaves` — leaves that collided (the journal tool fails loudly if the export gives a bare one)
- `accounts` — the full per-account detail (qb_full_name, bigcapital_name, code, leaf, parent)

### Then import

Bigcapital UI → Settings → Import → **Accounts** → upload `accounts.csv`. Chart of Accounts is
**step 1** — import it before customers/vendors/items/transactions.

Field contract mirrored from:
`packages/server/src/modules/Accounts/{AccountsImportable.service.ts, CreateAccount.dto.ts, models/Account.meta.ts}`,
`packages/server/src/constants/accounts.ts`, `packages/server/src/modules/Import/_utils.ts`.

---

## `qb_journal_to_bigcapital_manualjournals.py` — journal replay

Converts a QuickBooks Desktop **Journal** report into a Bigcapital **Manual Journals** import CSV:
every QB transaction → one balanced Manual Journal, every split line → one entry (leg). This is
the core of the journal-replay migration — replaying all history reproduces every balance, so the
Bigcapital Trial Balance ties out to QuickBooks by construction.

### Get the input from QuickBooks

`Reports → Accountant & Taxes → Journal`, set **Dates = All** (or through your cutover date),
`Excel → Create New Worksheet`, save as CSV. Also export the **Trial Balance** as of the same
date — that's your reconciliation target.

### Run

```bash
python3 qb_journal_to_bigcapital_manualjournals.py JOURNAL.csv manual-journals.csv \
    --name-map accounts.namemap.json
```

- `--name-map` — the sidecar from the accounts tool. **Strongly recommended**; without it account
  names pass through unchanged and the TB won't tie out.
- `--with-contacts` — carry the QB `Name` onto each leg's `Contact` (matched by display name).
  Default blank — the GL ties out without contacts and it avoids contact-match failures. Requires
  Customers/Vendors imported first if used.
- `--default-currency USD` — value for the Currency Code column (default blank → tenant base).
- `--draft` — import as drafts (`Publish=F`, does **not** hit the ledger). Default `Publish=T`.
- `--split-by-year` — write one `OUTPUT-<year>.csv` per calendar year (import-batch headroom on a
  small box).
- `--allow-warnings` — exit 0 despite warnings. By default any unbalanced journal, unmapped
  account, <2-leg journal, or unparseable date/amount exits **1**.

### What it handles

- Skips QB report **title rows**; auto-detects the real header (Account + Debit/Credit).
- Groups split lines into transactions by `Trans #` (falls back to `Type`/`Date`), **forward-filling**
  the date/type/num/name QB prints only on each transaction's first line.
- Drops per-transaction and grand **Total** rows.
- Remaps every account through the name-map (full path → leaf → unambiguous-leaf fallback); **fails
  loudly** on anything unmapped.
- Parses `1,234.56` / `$…` / `(123.45)` amounts; nets debit−credit per leg; drops zero legs.
- Asserts **each journal balances** and **>= 2 legs**, plus a global debit==credit check.

### Then import

Import order: TaxRate → **Accounts** (+ Customers/Vendors/Items if used) → **Manual Journals**
(this file). Then diff the Bigcapital Trial Balance against the QuickBooks one at the same date and
iterate until it ties.

> ⚠️ QuickBooks Journal CSV headers vary by version/locale. `HEADER_CANDIDATES` covers the common
> US-desktop layout; confirm against the real export and extend if a column isn't found (the tool
> errors clearly when it can't locate Account or Debit/Credit).

Field contract mirrored from:
`packages/server/src/modules/ManualJournals/{commands/ManualJournalsImport.ts, models/ManualJournal.meta.ts, dtos/ManualJournal.dto.ts, constants.ts}`.

---

## `bc_import.py` — push a CSV into a running instance via the Import API

Manual Journals has **no webapp import page** (only Accounts + TaxRate do), so the journal
replay loads through the generic Import API. `bc_import.py` drives it end-to-end:
`POST /import/file` → auto-build mapping → `POST /import/<id>/mapping` → `GET /import/<id>/preview`
→ `POST /import/<id>/import`. Reusable for Accounts too (skips the wizard) and at cutover.

```bash
python3 bc_import.py \
    --base-url https://books.sofisminidonuts.com/api \
    --token "<JWT>" --org-id "<orgId>" \
    --resource Account --file accounts.csv          # then --resource ManualJournal --file manual-journals.csv
```

- **Auth** = Bigcapital JWT + `organization-id` header (no OAuth edge on the Sofi box). Grab both
  from the browser: DevTools → Network → any `/api` request → Request Headers.
- **Auto-mapping** matches each sheet header to a resource field by display **name OR key**
  (so `Currency Code`→`currencyCode`, and the ManualJournal `entries` group `Account`→`accountId`).
- `--skip-errors` — commit the valid rows past expected duplicate-name errors (QB accounts that
  collide with the org's seed accounts).
- `--dry-run` — stop before the commit call. ⚠️ **The server's PREVIEW step itself persists created
  rows in the current build** (its rollback doesn't hold), so `--dry-run` is NOT side-effect-free —
  only ever use it against a throwaway/sandbox org you intend to wipe.

Validated 2026-06-17: loaded the 2023 dry-run CSVs into the live Sofi stack — 88 accounts + 411
journals, live Trial Balance reconciled to QuickBooks account-for-account.
