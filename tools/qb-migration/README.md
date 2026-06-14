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

- **Opening balances.** The accounts importer has no balance field. Post balances separately via a
  **Manual Journal** built from the QuickBooks Trial Balance as of your cutover date.

### Then import

Bigcapital UI → Settings → Import → **Accounts** → upload `accounts.csv`. Chart of Accounts is
**step 1** — import it before customers/vendors/items/transactions.

Field contract mirrored from:
`packages/server/src/modules/Accounts/{AccountsImportable.service.ts, CreateAccount.dto.ts, models/Account.meta.ts}`,
`packages/server/src/constants/accounts.ts`, `packages/server/src/modules/Import/_utils.ts`.
