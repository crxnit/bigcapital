#!/usr/bin/env python3
"""
QuickBooks Desktop "Account Listing" CSV  ->  Bigcapital Chart-of-Accounts import CSV.

Mirrors the contract enforced by the server importer:
  - packages/server/src/modules/Accounts/AccountsImportable.service.ts  (deferred parent resolution)
  - packages/server/src/modules/Accounts/CreateAccount.dto.ts           (name 3-255, code 3-6, required type)
  - packages/server/src/modules/Accounts/models/Account.meta.ts         (fields2 + enum options)
  - packages/server/src/constants/accounts.ts                           (account-type keys/labels)
  - packages/server/src/modules/Import/_utils.ts                        (enum matched by key OR label, lowercased)

What it does (see docs spec for the why):
  * Maps QuickBooks account types -> Bigcapital type labels (incl. Other Asset -> Non-Current Asset).
  * Optional --refine: Inventory Asset -> Inventory, *Sales Tax Payable -> Tax Payable (name heuristics).
  * Splits colon paths "Parent:Child" -> name=Child, Parent Account=Parent (deferred link, any row order).
  * Validates/pads account codes to the 3-6 char window; blanks codes it can't make valid; dedupes codes.
  * Enforces unique account names; disambiguates collisions by appending " (Parent)".
  * Maps Active/Inactive -> T/F. Drops balances (those come via a separate opening-balance journal).

It NEVER invents data: anything it can't map cleanly is reported to stderr and the run exits non-zero
unless you pass --allow-warnings, so a botched mapping can't slip into an import silently.

Usage:
  python3 qb_to_bigcapital_accounts.py INPUT.csv OUTPUT.csv [--refine] [--default-currency USD] [--allow-warnings]

Zero dependencies (stdlib only). Python 3.8+.
"""

import argparse
import csv
import json
import os
import sys
from collections import defaultdict

# --- Bigcapital valid type labels (from constants/accounts.ts ACCOUNT_TYPES) ------------------
BIGCAPITAL_TYPES = {
    "cash": "Cash",
    "bank": "Bank",
    "accounts receivable": "Accounts Receivable",
    "inventory": "Inventory",
    "other current asset": "Other Current Asset",
    "fixed asset": "Fixed Asset",
    "non-current asset": "Non-Current Asset",
    "accounts payable": "Accounts Payable",
    "credit card": "Credit Card",
    "tax payable": "Tax Payable",
    "other current liability": "Other Current Liability",
    "long term liability": "Long Term Liability",
    "non-current liability": "Non-Current Liability",
    "equity": "Equity",
    "income": "Income",
    "other income": "Other Income",
    "cost of goods sold": "Cost of Goods Sold",
    "expense": "Expense",
    "other expense": "Other Expense",
}

# --- QuickBooks Desktop type -> Bigcapital type label ------------------------------------------
# Keys are lowercased QB type strings. QB localized/abbreviated variants included.
QB_TYPE_MAP = {
    "bank": "Bank",
    "accounts receivable": "Accounts Receivable",
    "a/r": "Accounts Receivable",
    "other current asset": "Other Current Asset",
    "fixed asset": "Fixed Asset",
    "fixed assets": "Fixed Asset",
    "other asset": "Non-Current Asset",
    "accounts payable": "Accounts Payable",
    "a/p": "Accounts Payable",
    "credit card": "Credit Card",
    "other current liability": "Other Current Liability",
    "long term liability": "Long Term Liability",
    "equity": "Equity",
    "income": "Income",
    "other income": "Other Income",
    "cost of goods sold": "Cost of Goods Sold",
    "cogs": "Cost of Goods Sold",
    "expense": "Expense",
    "other expense": "Other Expense",
}

# Candidate header names per logical field (case-insensitive). QB varies by version/locale.
HEADER_CANDIDATES = {
    "account": ["account", "full name", "name", "account name"],
    "type": ["type", "account type"],
    "description": ["description", "desc"],
    "active": ["active status", "active", "status"],
    "currency": ["currency", "currency code"],
    "code": ["account #", "number", "account number", "acct #", "code", "account code"],
}

OUTPUT_HEADERS = [
    "Account Name", "Type", "Account Code",
    "Description", "Active", "Currency Code", "Parent Account",
]


def find_col(fieldnames, candidates):
    lower = {h.strip().lower(): h for h in fieldnames if h is not None}
    for cand in candidates:
        if cand in lower:
            return lower[cand]
    return None


def map_type(qb_type, name, refine, warnings, row_no):
    raw = (qb_type or "").strip()
    mapped = QB_TYPE_MAP.get(raw.lower())
    if mapped is None:
        # Maybe the source already uses a Bigcapital label/key verbatim.
        mapped = BIGCAPITAL_TYPES.get(raw.lower())
    if mapped is None:
        warnings.append(f"row {row_no}: unrecognized account type {raw!r} for {name!r} - left as-is, FIX before import")
        return raw
    if refine:
        n = name.lower()
        if mapped == "Other Current Asset" and "inventory" in n:
            return "Inventory"
        if mapped == "Other Current Liability" and "sales tax" in n:
            return "Tax Payable"
    return mapped


def split_path(full):
    """QuickBooks 'Parent:Sub:Leaf' -> (leaf, immediate_parent)."""
    parts = [p.strip() for p in full.split(":")]
    leaf = parts[-1]
    parent = parts[-2] if len(parts) >= 2 else ""
    return leaf, parent


def normalize_code(raw, used_codes, name, warnings, row_no):
    code = (raw or "").strip()
    if not code:
        return ""
    # Strip a trailing '.0' QB/Excel sometimes adds when a numeric col is exported.
    if code.endswith(".0") and code[:-2].isdigit():
        code = code[:-2]
    if len(code) > 6:
        warnings.append(f"row {row_no}: code {code!r} for {name!r} > 6 chars - blanked (re-number or import name-only)")
        return ""
    if len(code) < 3:
        if code.isdigit():
            padded = code.zfill(3)
            warnings.append(f"row {row_no}: code {code!r} for {name!r} < 3 chars - zero-padded to {padded!r}")
            code = padded
        else:
            warnings.append(f"row {row_no}: code {code!r} for {name!r} < 3 chars and non-numeric - blanked")
            return ""
    if code in used_codes:
        warnings.append(f"row {row_no}: duplicate code {code!r} ({name!r} vs {used_codes[code]!r}) - blanked on {name!r}")
        return ""
    used_codes[code] = name
    return code


def map_active(raw):
    v = (raw or "").strip().lower()
    if v in ("inactive", "f", "false", "n", "no", "0"):
        return "F"
    return "T"  # QB default / "Active" / blank -> active


def main():
    ap = argparse.ArgumentParser(description="QuickBooks Desktop Account Listing -> Bigcapital accounts.csv")
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--refine", action="store_true",
                    help="apply name heuristics: Inventory Asset->Inventory, *Sales Tax Payable->Tax Payable")
    ap.add_argument("--default-currency", default="",
                    help="value for blank Currency Code (default: blank -> tenant base currency)")
    ap.add_argument("--allow-warnings", action="store_true",
                    help="exit 0 even if rows produced warnings (default: exit 1 so warnings can't be ignored)")
    ap.add_argument("--name-map", default="",
                    help="path for the QB-full-name -> Bigcapital-name JSON sidecar consumed by the journal "
                         "transformer (default: <output>.namemap.json next to OUTPUT)")
    args = ap.parse_args()

    with open(args.input, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            sys.exit("ERROR: input has no header row")
        cols = {k: find_col(reader.fieldnames, c) for k, c in HEADER_CANDIDATES.items()}
        if not cols["account"]:
            sys.exit(f"ERROR: could not find an account-name column in {reader.fieldnames}")
        if not cols["type"]:
            sys.exit(f"ERROR: could not find an account-type column in {reader.fieldnames}")
        rows = list(reader)

    warnings = []
    used_codes = {}
    seen_names = {}          # final name -> row_no
    name_counts = defaultdict(int)  # leaf name -> count (to detect collisions)
    out_rows = []
    map_accounts = []        # per-account remap info for the name-map sidecar

    # First pass: count leaf names so we know which ones collide and need disambiguation.
    parsed = []
    for i, row in enumerate(rows, start=2):  # row 2 = first data row (header is row 1)
        full = (row.get(cols["account"]) or "").strip()
        if not full:
            continue
        leaf, parent = split_path(full)
        parsed.append((i, row, full, leaf, parent))
        name_counts[leaf.lower()] += 1

    for row_no, row, full, leaf, parent in parsed:
        name = leaf
        if name_counts[leaf.lower()] > 1 and parent:
            name = f"{leaf} ({parent})"  # disambiguate colliding leaf names
        if len(name) < 3:
            warnings.append(f"row {row_no}: name {name!r} < 3 chars (Bigcapital min) - FIX before import")
        if name.lower() in seen_names:
            warnings.append(f"row {row_no}: duplicate name {name!r} (also row {seen_names[name.lower()]}) - FIX before import")
        else:
            seen_names[name.lower()] = row_no

        acct_type = map_type(row.get(cols["type"]), name, args.refine, warnings, row_no)
        code = normalize_code(row.get(cols["code"]) if cols["code"] else "",
                              used_codes, name, warnings, row_no)
        desc = (row.get(cols["description"]) or "").strip() if cols["description"] else ""
        active = map_active(row.get(cols["active"]) if cols["active"] else "")
        currency = (row.get(cols["currency"]) or "").strip() if cols["currency"] else ""
        if not currency:
            currency = args.default_currency

        out_rows.append({
            "Account Name": name,
            "Type": acct_type,
            "Account Code": code,
            "Description": desc,
            "Active": active,
            "Currency Code": currency,
            "Parent Account": parent,
        })
        map_accounts.append({
            "qb_full_name": full,
            "bigcapital_name": name,
            "code": code,
            "leaf": leaf,
            "parent": parent,
            "ambiguous_leaf": name_counts[leaf.lower()] > 1,
        })

    with open(args.output, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_HEADERS)
        writer.writeheader()
        writer.writerows(out_rows)

    print(f"Wrote {len(out_rows)} accounts -> {args.output}", file=sys.stderr)

    # --- name-map sidecar (consumed by qb_journal_to_bigcapital_manualjournals.py) ------------
    # The journal replay references accounts by their ORIGINAL QuickBooks name, but we renamed
    # sub-accounts to leaf-only and disambiguated colliding leaves. This map lets the journal
    # transformer translate QB account names -> the Bigcapital names actually imported.
    # Lookup keys are lowercased (case-insensitive matching); values keep proper casing.
    by_full_name = {}
    leaf_to_names = defaultdict(set)
    for a in map_accounts:
        by_full_name[a["qb_full_name"].lower()] = a["bigcapital_name"]
        leaf_to_names[a["leaf"].lower()].add(a["bigcapital_name"])
    by_leaf = {leaf: next(iter(names)) for leaf, names in leaf_to_names.items() if len(names) == 1}
    ambiguous_leaves = sorted(leaf for leaf, names in leaf_to_names.items() if len(names) > 1)

    name_map = {
        "_comment": "QuickBooks account name -> Bigcapital account name. Keys lowercased for "
                    "case-insensitive lookup. Resolve via by_full_name first, then by_leaf "
                    "(unambiguous leaves only); an ambiguous_leaf needs its full QB path.",
        "generated_from": os.path.basename(args.input),
        "by_full_name": dict(sorted(by_full_name.items())),
        "by_leaf": dict(sorted(by_leaf.items())),
        "ambiguous_leaves": ambiguous_leaves,
        "accounts": map_accounts,
    }
    map_path = args.name_map or (os.path.splitext(args.output)[0] + ".namemap.json")
    with open(map_path, "w", encoding="utf-8") as f:
        json.dump(name_map, f, indent=2, ensure_ascii=False)
    print(f"Wrote name-map ({len(by_full_name)} accounts, "
          f"{len(ambiguous_leaves)} ambiguous leaf name(s)) -> {map_path}", file=sys.stderr)

    if warnings:
        print(f"\n{len(warnings)} warning(s):", file=sys.stderr)
        for w in warnings:
            print(f"  - {w}", file=sys.stderr)
        print("\nReview each, then re-run the import. Opening balances are NOT included "
              "(post them via a Manual Journal from the QuickBooks Trial Balance).", file=sys.stderr)
        if not args.allow_warnings:
            sys.exit(1)


if __name__ == "__main__":
    main()
