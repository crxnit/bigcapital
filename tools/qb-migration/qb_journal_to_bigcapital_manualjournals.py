#!/usr/bin/env python3
"""
QuickBooks Desktop "Journal" report CSV  ->  Bigcapital Manual Journals import CSV.

Part 2 of the QuickBooks Desktop -> Bigcapital journal-replay migration. Part 1
(qb_to_bigcapital_accounts.py) converts the Chart of Accounts AND emits the account
name-map this tool consumes (--name-map). Run part 1 first.

Each QuickBooks transaction (grouped by "Trans #") becomes ONE balanced Bigcapital
Manual Journal; each split line becomes one entry (leg). The Bigcapital importer
aggregates flat CSV rows into journals by the "Journal No" column
(ManualJournal.meta.ts: importAggregator 'group', importAggregateOn 'entries',
importAggregateBy 'journalNumber'). Each journal needs >= 2 legs and must balance.

Output columns (exact, from the importer's shipped sample sheet
ManualJournals/constants.ts ManualJournalsSampleData):
  Date, Journal No, Reference No., Currency Code, Exchange Rate, Journal Type,
  Description, Credit, Debit, Note, Account, Contact, Publish

Account names are remapped through the name-map JSON from the COA tool, because that
tool renamed sub-accounts to leaf-only ("Deposits in Transit:Square DIT" -> "Square DIT")
and disambiguated colliding leaves ("Leaf (Parent)"). The server matches the Account
column by account name OR code (Account.meta.ts relationImportMatch ['name','code']),
so the replayed names must be the imported names or the Trial Balance will not tie out.

Loud-fail philosophy (same as the COA tool): any unbalanced journal, unmapped account,
under-2-leg journal, or unparseable date/amount is reported to stderr and the run exits
non-zero unless --allow-warnings, so a botched replay can't slip into an import silently.

NOTE: QuickBooks Journal CSV headers vary by version/locale. HEADER_CANDIDATES below
covers the common US-desktop layout (Trans #, Type, Date, Num, Name, Memo, Account,
Debit, Credit); confirm against the real export and extend if a column isn't found.

Usage:
  python3 qb_journal_to_bigcapital_manualjournals.py INPUT.csv OUTPUT.csv \
      --name-map accounts.namemap.json [--with-contacts] [--default-currency USD] \
      [--draft] [--split-by-year] [--allow-warnings]

Zero dependencies (stdlib only). Python 3.8+.
"""

import argparse
import csv
import json
import os
import sys
from collections import defaultdict
from datetime import datetime

EPS = 0.005  # currency balance tolerance (sub-half-cent dust is balanced)

# Candidate header names per logical field (case-insensitive). QB varies by version/locale.
HEADER_CANDIDATES = {
    "trans": ["trans #", "trans#", "trans no", "trans no.", "transaction #", "transaction"],
    "type": ["type", "transaction type"],
    "date": ["date"],
    "num": ["num", "number", "ref", "ref no", "ref no.", "reference"],
    "name": ["name", "payee", "contact"],
    "memo": ["memo", "memo/description", "description", "desc"],
    "account": ["account", "split account", "account name"],
    "debit": ["debit", "debits"],
    "credit": ["credit", "credits"],
}

# Boundary column preference: a non-blank value in the FIRST available of these starts a new
# transaction (QB prints these only on a transaction's first split line).
BOUNDARY_PREFERENCE = ["trans", "type", "date"]

DATE_FORMATS = ["%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d", "%m-%d-%Y", "%b %d, %Y", "%B %d, %Y"]

OUTPUT_HEADERS = [
    "Date", "Journal No", "Reference No.", "Currency Code", "Exchange Rate",
    "Journal Type", "Description", "Credit", "Debit", "Note", "Account", "Contact", "Publish",
]


def find_header_row(rows):
    """QB CSV exports start with title rows. Find the real column-header row: the first row
    that names an Account column AND a Debit or Credit column."""
    for idx, row in enumerate(rows):
        low = [(c or "").strip().lower() for c in row]
        has_account = any(c in ("account", "split account", "account name") for c in low)
        has_amount = any(c in ("debit", "debits", "credit", "credits") for c in low)
        if has_account and has_amount:
            return idx
    return -1


def find_col(header, candidates):
    lower = {(h or "").strip().lower(): i for i, h in enumerate(header)}
    for cand in candidates:
        if cand in lower:
            return lower[cand]
    return None


def parse_amount(raw):
    """'1,234.56' / '$1,234.56' / '(123.45)' / '-5' / '' -> float. Returns None on garbage."""
    s = (raw or "").strip()
    if not s:
        return 0.0
    neg = False
    if s.startswith("(") and s.endswith(")"):
        neg, s = True, s[1:-1]
    s = s.replace("$", "").replace(",", "").strip()
    if s.startswith("-"):
        neg, s = True, s[1:]
    if not s:
        return 0.0
    try:
        v = float(s)
    except ValueError:
        return None
    return -v if neg else v


def norm_date(raw):
    s = (raw or "").strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def fmt_amt(x):
    return f"{x:.2f}"


def resolve_account(qb_acct, name_map, unmapped, journal_no):
    """QB account name -> imported Bigcapital name via the COA name-map.
    Identity passthrough when no map is supplied (testing only)."""
    raw = (qb_acct or "").strip()
    if not raw:
        return None
    if name_map is None:
        return raw
    low = raw.lower()
    hit = name_map["by_full_name"].get(low) or name_map["by_leaf"].get(low)
    if hit:
        return hit
    if ":" in raw:  # QB gave a full path the map didn't key verbatim - try its leaf
        leaf = raw.rsplit(":", 1)[-1].strip().lower()
        if leaf in name_map["ambiguous_leaves"]:
            unmapped.append(f"{journal_no}: account {raw!r} resolves to ambiguous leaf "
                            f"{leaf!r} - add its full path to the COA/name-map")
            return None
        hit = name_map["by_leaf"].get(leaf)
        if hit:
            return hit
    if low in name_map["ambiguous_leaves"]:
        unmapped.append(f"{journal_no}: account {raw!r} is an ambiguous leaf - needs full QB path")
        return None
    unmapped.append(f"{journal_no}: account {raw!r} not found in name-map - "
                    f"add it to the Chart of Accounts import, then regenerate the map")
    return None


def main():
    ap = argparse.ArgumentParser(
        description="QuickBooks Desktop Journal report -> Bigcapital manual-journals.csv")
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--name-map", default="",
                    help="account name-map JSON from qb_to_bigcapital_accounts.py "
                         "(STRONGLY recommended; without it accounts pass through unchanged)")
    ap.add_argument("--with-contacts", action="store_true",
                    help="carry QB 'Name' onto each leg's Contact (matched by display name; "
                         "default: blank - GL ties out without contacts and avoids match failures)")
    ap.add_argument("--default-currency", default="",
                    help="value for the Currency Code column (default: blank -> tenant base currency)")
    ap.add_argument("--draft", action="store_true",
                    help="emit Publish=F (journals import as drafts, do NOT hit the ledger). "
                         "Default Publish=T so the replayed Trial Balance is live.")
    ap.add_argument("--split-by-year", action="store_true",
                    help="write one OUTPUT-<year>.csv per calendar year (import-batch headroom)")
    ap.add_argument("--allow-warnings", action="store_true",
                    help="exit 0 even if rows produced warnings (default: exit 1)")
    args = ap.parse_args()

    name_map = None
    if args.name_map:
        with open(args.name_map, encoding="utf-8") as f:
            name_map = json.load(f)
        # Normalize: ambiguous_leaves as a set for O(1) lookup.
        name_map["ambiguous_leaves"] = set(name_map.get("ambiguous_leaves", []))
    else:
        print("WARNING: no --name-map; account names pass through unchanged. The replayed "
              "Trial Balance will only tie out if QB names already equal Bigcapital names.",
              file=sys.stderr)

    with open(args.input, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    if not rows:
        sys.exit("ERROR: input is empty")
    hidx = find_header_row(rows)
    if hidx < 0:
        sys.exit("ERROR: could not find a header row with Account + Debit/Credit columns. "
                 "Confirm this is a QuickBooks 'Journal' report CSV and extend HEADER_CANDIDATES.")
    header = rows[hidx]
    data = rows[hidx + 1:]

    cols = {k: find_col(header, c) for k, c in HEADER_CANDIDATES.items()}
    if cols["account"] is None:
        sys.exit(f"ERROR: no Account column in header {header}")
    if cols["debit"] is None and cols["credit"] is None:
        sys.exit(f"ERROR: no Debit/Credit column in header {header}")

    boundary = next((b for b in BOUNDARY_PREFERENCE if cols.get(b) is not None), None)
    if boundary is None:
        sys.exit("ERROR: need a Trans #, Type, or Date column to group lines into journals")
    print(f"Grouping transactions by the {boundary!r} column.", file=sys.stderr)

    def cell(row, key):
        i = cols.get(key)
        return (row[i].strip() if i is not None and i < len(row) and row[i] else "")

    warnings = []
    unmapped = []
    journals = []          # list of dicts: {no, date, num, type, name, desc, legs[]}
    cur = None
    seq = 0
    seen_nos = defaultdict(int)

    for raw_row in data:
        if not any((c or "").strip() for c in raw_row):
            continue  # blank separator row
        account = cell(raw_row, "account")
        # The grand-total / subtotal row carries a "Total" marker in the boundary column
        # (e.g. QB prints "TOTAL" in the Trans # column) with no account. Skip it outright,
        # else it opens a phantom dateless, leg-less journal.
        if cell(raw_row, boundary).strip().lower() in ("total", "totals"):
            continue
        starts_new = bool(cell(raw_row, boundary))

        if starts_new:
            # Close previous, open a new transaction.
            seq += 1
            trans = cell(raw_row, "trans")
            base_no = f"QB-{trans}" if trans else f"QB-{seq:06d}"
            seen_nos[base_no] += 1
            jno = base_no if seen_nos[base_no] == 1 else f"{base_no}-{seen_nos[base_no]}"
            cur = {
                "no": jno,
                "date": cell(raw_row, "date"),
                "num": cell(raw_row, "num"),
                "type": cell(raw_row, "type"),
                "name": cell(raw_row, "name"),
                "desc": "",
                "legs": [],
            }
            journals.append(cur)

        if cur is None:
            warnings.append(f"orphan line before first transaction boundary (account {account!r}) - skipped")
            continue

        # Total / subtotal / separator rows carry no account (or a literal "Total" marker) - skip.
        if not account or account.strip().lower() in ("total", "totals"):
            continue

        d = parse_amount(cell(raw_row, "debit"))
        c = parse_amount(cell(raw_row, "credit"))
        if d is None or c is None:
            warnings.append(f"{cur['no']}: unparseable amount on account {account!r} "
                            f"(debit={cell(raw_row, 'debit')!r} credit={cell(raw_row, 'credit')!r}) - skipped")
            continue
        net = round((d or 0.0) - (c or 0.0), 2)
        if net == 0.0:
            continue  # zero-value leg adds nothing to the GL
        memo = cell(raw_row, "memo")
        if not cur["desc"] and memo:
            cur["desc"] = memo  # first non-empty memo becomes the journal description
        cur["legs"].append({
            "account": account,
            "debit": net if net > 0 else 0.0,
            "credit": -net if net < 0 else 0.0,
            "note": memo,
            "name": cell(raw_row, "name"),
        })

    # --- build output rows + validate ----------------------------------------------------------
    out_rows = []
    total_debit = total_credit = 0.0
    for j in journals:
        if len(j["legs"]) < 2:
            warnings.append(f"{j['no']}: only {len(j['legs'])} leg(s) - Bigcapital requires >= 2; "
                            f"FIX or drop before import")
        jdebit = round(sum(l["debit"] for l in j["legs"]), 2)
        jcredit = round(sum(l["credit"] for l in j["legs"]), 2)
        if abs(jdebit - jcredit) > EPS:
            warnings.append(f"{j['no']}: UNBALANCED debit {jdebit:.2f} != credit {jcredit:.2f} "
                            f"(diff {jdebit - jcredit:+.2f})")
        total_debit += jdebit
        total_credit += jcredit

        jdate = norm_date(j["date"])
        if jdate is None:
            warnings.append(f"{j['no']}: unparseable date {j['date']!r} - left raw, FIX before import")
            jdate = j["date"]

        desc = j["desc"] or " ".join(x for x in (j["type"], j["num"]) if x)
        for l in j["legs"]:
            acct = resolve_account(l["account"], name_map, unmapped, j["no"])
            out_rows.append({
                "Date": jdate,
                "Journal No": j["no"],
                "Reference No.": j["num"],
                "Currency Code": args.default_currency,
                "Exchange Rate": "",
                "Journal Type": j["type"],
                "Description": desc,
                "Credit": fmt_amt(l["credit"]),
                "Debit": fmt_amt(l["debit"]),
                "Note": l["note"],
                "Account": acct if acct is not None else l["account"],
                "Contact": (l["name"] if args.with_contacts else ""),
                "Publish": ("F" if args.draft else "T"),
            })

    if abs(total_debit - total_credit) > EPS:
        warnings.append(f"GLOBAL totals unbalanced: debit {total_debit:.2f} != credit "
                        f"{total_credit:.2f} (diff {total_debit - total_credit:+.2f})")

    # --- write -------------------------------------------------------------------------------
    if args.split_by_year:
        buckets = defaultdict(list)
        for r in out_rows:
            year = r["Date"][:4] if r["Date"][:4].isdigit() else "unknown"
            buckets[year].append(r)
        stem, ext = os.path.splitext(args.output)
        for year, rs in sorted(buckets.items()):
            path = f"{stem}-{year}{ext or '.csv'}"
            with open(path, "w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=OUTPUT_HEADERS)
                w.writeheader()
                w.writerows(rs)
            print(f"Wrote {len(rs)} legs ({year}) -> {path}", file=sys.stderr)
    else:
        with open(args.output, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=OUTPUT_HEADERS)
            w.writeheader()
            w.writerows(out_rows)
        print(f"Wrote {len(out_rows)} legs -> {args.output}", file=sys.stderr)

    print(f"\n{len(journals)} journal(s), {len(out_rows)} leg(s). "
          f"Totals: debit {total_debit:.2f} / credit {total_credit:.2f}.", file=sys.stderr)

    if unmapped:
        uniq = sorted(set(unmapped))
        print(f"\n{len(uniq)} unmapped-account problem(s):", file=sys.stderr)
        for u in uniq:
            print(f"  - {u}", file=sys.stderr)
        warnings.extend(uniq)

    if warnings:
        # De-dup while preserving order, but unmapped already appended; just count distinctly.
        print(f"\n{len(warnings)} warning(s):", file=sys.stderr)
        for w in warnings:
            print(f"  - {w}", file=sys.stderr)
        print("\nReview each, then re-run. A replay that imports unbalanced or with unmapped "
              "accounts will NOT reconcile to the QuickBooks Trial Balance.", file=sys.stderr)
        if not args.allow_warnings:
            sys.exit(1)


if __name__ == "__main__":
    main()
