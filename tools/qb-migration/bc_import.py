#!/usr/bin/env python3
"""
Drive the Bigcapital generic Import API for a CSV produced by the QB-migration
tools (or any importable resource). Used to load the journal-replay output into
an instance that has no dedicated webapp import page (Manual Journals), and to
load Accounts without clicking through the wizard.

Mirrors what the webapp import flow does, over the documented endpoints
(packages/server/src/modules/Import/Import.controller.ts):
  1. POST /import/file        (multipart: file, resource[, params])  -> importId,
                               sheetColumns, resourceColumns[{key,name,required}]
  2. POST /import/<id>/mapping ({mapping:[{from,to}]})  -- auto-built here by
                               matching each sheet column header to a resource
                               column's display name (our CSV headers are the
                               importer's own sample-sheet labels, so it's 1:1)
  3. GET  /import/<id>/preview -- validation; prints createable/error counts
  4. POST /import/<id>/import  -- commits (skipped with --dry-run)

Auth: Bigcapital JWT only (the Sofi box has no OAuth edge). Grab the token and
org id from the browser: DevTools -> Network -> any /api request -> Request
Headers -> `authorization: Bearer <token>` and `organization-id: <id>`.

Zero dependencies (stdlib urllib). Python 3.8+.

Usage:
  python3 bc_import.py \
      --base-url https://books.sofisminidonuts.com/api \
      --token "<JWT>" --org-id "<orgId>" \
      --resource Account      --file dryrun-2023/accounts.csv
  python3 bc_import.py ... --resource ManualJournal \
      --file dryrun-2023/manual-journals-2023.csv [--dry-run]
"""

import argparse
import csv
import json
import mimetypes
import os
import re
import sys
import urllib.error
import urllib.request
import uuid


def _get(d, *keys, default=None):
    """First present key among variants (responses are snake_cased outbound;
    accept camelCase too for safety)."""
    for k in keys:
        if isinstance(d, dict) and k in d and d[k] is not None:
            return d[k]
    return default


def _req(method, url, token, org_id, *, data=None, headers=None):
    h = {
        "Authorization": f"Bearer {token}",
        "organization-id": org_id,
        "Accept": "application/json",
    }
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        sys.exit(f"ERROR {method} {url} -> HTTP {e.code}\n{detail}")
    except urllib.error.URLError as e:
        sys.exit(f"ERROR {method} {url} -> {e.reason}")
    return json.loads(body) if body.strip() else {}


def _multipart(fields, file_field, filename, file_bytes, content_type):
    """Build a minimal multipart/form-data body (stdlib only)."""
    boundary = f"----bcimport{uuid.uuid4().hex}"
    crlf = b"\r\n"
    buf = []
    for name, value in fields.items():
        buf.append(b"--" + boundary.encode())
        buf.append(f'Content-Disposition: form-data; name="{name}"'.encode())
        buf.append(b"")
        buf.append(str(value).encode())
    buf.append(b"--" + boundary.encode())
    buf.append(
        f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"'.encode()
    )
    buf.append(f"Content-Type: {content_type}".encode())
    buf.append(b"")
    body = crlf.join(buf) + crlf + file_bytes + crlf
    body += (b"--" + boundary.encode() + b"--" + crlf)
    return body, f"multipart/form-data; boundary={boundary}"


def _norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _flatten_fields(resource_columns):
    """resource_columns is a list of GROUPS: {group_key, fields:[{key,name,required}]}.
    (Older/flat shape: a list of bare {key,name} — handled too.)
    Returns [(group_key, field_dict)] preserving the entries-group key."""
    flat = []
    for rc in resource_columns:
        fields = rc.get("fields")
        if isinstance(fields, list):
            gkey = rc.get("group_key") or rc.get("groupKey") or ""
            for f in fields:
                flat.append((gkey, f))
        elif "key" in rc:
            flat.append(("", rc))
    return flat


def build_mapping(sheet_columns, resource_columns):
    """Match each sheet header to a resource field by normalized display NAME or
    field KEY (sheet 'Currency Code' has no name match but keys to currencyCode;
    'Account' lives in the entries group). Returns (mapping, required_missing)."""
    flat = _flatten_fields(resource_columns)
    mapping = []
    used_idx = set()
    used_keys = set()
    for col in sheet_columns:
        cn = _norm(col)
        for i, (gkey, f) in enumerate(flat):
            if i in used_idx:
                continue
            if cn and (cn == _norm(f.get("name")) or cn == _norm(f.get("key"))):
                used_idx.add(i)
                used_keys.add(f["key"])
                m = {"from": col, "to": f["key"]}
                if gkey:
                    m["group"] = gkey
                mapping.append(m)
                break
    required_missing = [
        f["name"] for (gkey, f) in flat
        if f.get("required") and f["key"] not in used_keys
    ]
    return mapping, required_missing


def main():
    ap = argparse.ArgumentParser(description="Bigcapital generic Import API driver")
    ap.add_argument("--base-url", required=True, help="e.g. https://books.sofisminidonuts.com/api")
    ap.add_argument("--token", required=True, help="Bigcapital JWT (without 'Bearer ')")
    ap.add_argument("--org-id", required=True, help="organization-id header value")
    ap.add_argument("--resource", required=True, help="resource name, e.g. Account or ManualJournal")
    ap.add_argument("--file", required=True, help="CSV path to import")
    ap.add_argument("--params", default="{}", help="JSON import params (default '{}')")
    ap.add_argument("--dry-run", action="store_true",
                    help="stop after preview; do NOT call the commit endpoint. WARNING: in the "
                         "current server build the PREVIEW step itself persists created rows "
                         "(its rollback does not hold), so --dry-run is NOT side-effect-free. "
                         "Only ever 'dry-run' against a throwaway/sandbox org you intend to wipe.")
    ap.add_argument("--skip-errors", action="store_true",
                    help="commit the valid rows even if preview reports row errors "
                         "(e.g. duplicate names that already exist as seed accounts)")
    args = ap.parse_args()

    base = args.base_url.rstrip("/")
    if not os.path.isfile(args.file):
        sys.exit(f"ERROR: file not found: {args.file}")

    # Local pre-flight: count data rows so we can sanity-check the server's view.
    with open(args.file, newline="", encoding="utf-8-sig") as f:
        local_rows = sum(1 for _ in csv.reader(f)) - 1
    print(f"Local: {local_rows} data row(s) in {args.file}", file=sys.stderr)

    with open(args.file, "rb") as f:
        file_bytes = f.read()
    ctype = mimetypes.guess_type(args.file)[0] or "text/csv"

    # 1. Upload ---------------------------------------------------------------
    body, ct = _multipart(
        {"resource": args.resource, "params": args.params},
        "file", os.path.basename(args.file), file_bytes, ctype,
    )
    up = _req("POST", f"{base}/import/file", args.token, args.org_id,
              data=body, headers={"Content-Type": ct})
    import_obj = _get(up, "import", default={})
    import_id = _get(import_obj, "import_id", "importId")
    sheet_cols = _get(up, "sheet_columns", "sheetColumns", default=[])
    resource_cols = _get(up, "resource_columns", "resourceColumns", default=[])
    if not import_id or not sheet_cols or not resource_cols:
        sys.exit("ERROR: unexpected /import/file response shape:\n"
                 + json.dumps(up, indent=2)[:2000])
    print(f"Uploaded -> importId={import_id}; {len(sheet_cols)} sheet column(s), "
          f"{len(resource_cols)} resource field(s)", file=sys.stderr)

    # 2. Auto-build + post mapping -------------------------------------------
    mapping, required_missing = build_mapping(sheet_cols, resource_cols)
    print("Column mapping (sheet -> field key):", file=sys.stderr)
    for m in mapping:
        grp = f"  [group={m['group']}]" if m.get("group") else ""
        print(f"    {m['from']!r:32} -> {m['to']}{grp}", file=sys.stderr)
    unmapped_sheet = [c for c in sheet_cols
                      if c not in {m["from"] for m in mapping}]
    if unmapped_sheet:
        print(f"  (ignored sheet columns: {unmapped_sheet})", file=sys.stderr)
    if required_missing:
        sys.exit(f"ERROR: required field(s) have no matching column: {required_missing}")

    _req("POST", f"{base}/import/{import_id}/mapping", args.token, args.org_id,
         data=json.dumps({"mapping": mapping}).encode(),
         headers={"Content-Type": "application/json"})

    # 3. Preview --------------------------------------------------------------
    preview = _req("GET", f"{base}/import/{import_id}/preview", args.token, args.org_id)
    # Shape varies a little by version; surface the common counters + any errors.
    created = _get(preview, "created_count", "createdCount", "imported", "created")
    skipped = _get(preview, "skipped_count", "skippedCount", default=0)
    errs = _get(preview, "errors", "invalid", "error", default=[]) or []
    total = _get(preview, "total_count", "totalCount", "total")
    print(f"\nPreview: total={total} createable={created} skipped={skipped} errors={len(errs)}",
          file=sys.stderr)
    if errs:
        print("First errors:", file=sys.stderr)
        for e in errs[:10]:
            print(f"  - {json.dumps(e)[:300]}", file=sys.stderr)

    if args.dry_run:
        print("\n--dry-run: stopping before commit. Re-run without --dry-run to import.",
              file=sys.stderr)
        return
    if errs and not args.skip_errors:
        sys.exit("\nRefusing to commit: preview reported errors. Fix the CSV and retry, "
                 "or pass --skip-errors to import the valid rows anyway (this guard is intentional).")
    if errs:
        print(f"\n--skip-errors: committing the {created} valid row(s); {len(errs)} errored "
              f"row(s) will NOT be created.", file=sys.stderr)

    # 4. Commit ---------------------------------------------------------------
    result = _req("POST", f"{base}/import/{import_id}/import", args.token, args.org_id,
                  data=b"", headers={"Content-Type": "application/json"})
    print("\nImport committed.", file=sys.stderr)
    print(json.dumps(result, indent=2)[:1500])


if __name__ == "__main__":
    main()
