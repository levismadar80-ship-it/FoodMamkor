#!/usr/bin/env python3
"""
Module:   pull_health_ministry_registry
Purpose:  One-off pull of the Ministry of Health "licensed food manufacturers"
          registry (the open-data copy on data.gov.il) into a UTF-8-sig CSV of
          Wave-1 outreach leads — licence-verified businesses in the launch
          towns, production businesses only.
Touches:  data.gov.il CKAN API (read-only GET, paged datastore_search). Writes
          two files under --out. Nothing else: no DB, no repo data, no other host.
Does NOT: run from Claude Code. EVER. data.gov.il denies automated access at
          the site-policy level (measured twice, two independent egress paths:
          CC got `403 CONNECT` while pypi/github returned 200 in the same run;
          Claude.ai got ROBOTS_DISALLOWED — MEH-2135 SYNC 20/08). This file was
          WRITTEN in a CC session and NEVER EXECUTED there; the only thing CC
          ran against it is `--dry-run` / `--self-test`, both offline. Sapir
          runs it locally (Git Bash, plain `python`, stdlib only).
Does NOT: write to the repo, touch the database, or mutate anything on the
          registry side. It also does not verify a licence — it lists what the
          registry lists on the day it runs. Cross-checking a specific business
          stays a manual step against the official portal
          (frontend/lib/official-registries.js →
          https://registries.health.gov.il/FoodManufacturers).
Related:  MEH-2135 (this card — the one-off), MEH-409 (consumer of the CSV),
          MEH-1272 (the post-launch V2 auto-verification feature, same dataset,
          different purpose — NOT this), MEH-413 (the outreach package the
          leads feed), frontend/lib/official-registries.js (canonical URLs).
History:  MEH-2135 (creation, 03/09 drain T5). A first version of this script
          lived outside the repo at ~/mehamakor-scratch/moh-registry/fetch_moh.py
          (SYNC 20/08); this is the in-repo, never-run rewrite with the guards
          that card's self-test surfaced, so the next session does not rebuild
          it from memory.

Usage (Sapir, locally — never CC):

  python scripts/oneoff/pull_health_ministry_registry.py --dry-run
      Prints the discovery URL, the datastore URL, the output columns and the
      filter lists. NO network. Safe anywhere.

  python scripts/oneoff/pull_health_ministry_registry.py --self-test
      36-ish offline checks of the two filters against synthetic rows. NO
      network. Exit 0 = the filter logic behaves; it says nothing about the
      live schema (see LIMITS).

  python scripts/oneoff/pull_health_ministry_registry.py --confirm --out ./moh
      The real pull. Refuses to run without --confirm.

Exit codes — keep stable, they get grepped:
  0 — CSV written (or dry-run / self-test passed)
  1 — self-test failed
  2 — the live schema has no recognisable settlement column (schema printed —
      read it and extend CITY_CANDIDATES rather than guessing)
  3 — geo filter matched ZERO rows. Deliberately NOT exit 0 with an empty CSV:
      an empty file reads as "no businesses in Wave 1", which is the one thing
      this script must never say by accident. Near-misses are printed.
  4 — refused: --confirm missing, or the API was unreachable / unauthorised
  5 — CKAN discovery found no datastore resource for the package

LIMITS — read before trusting a row count:
  * Column names are NOT hardcoded. Every field is resolved against a list of
    candidates and the choice is PRINTED. The self-test exercises a synthetic
    schema only; the live schema has never been seen from a CC session. The
    real check on a live run is the column-resolution report and the
    near-miss scan — read both, not just the count.
  * Filter B (business type) is an EXCLUSION list, not a whitelist (Sapir,
    20/08): a whitelist against an unknown vocabulary drops everything
    silently; an exclusion fails toward extra rows you can see and trim.
  * Stem matching, not substring: `הובלת מזון` must be excluded by the stem
    `הובל` (the construct form `הובלת` does not contain `הובלה`), and `מזון`
    is NOT a production signal — nearly every category in a food registry
    contains it (the bug the 20/08 self-test caught).
  * `אריזה` (packaging) stays neutral: a packer that also produces is a
    legitimate lead; better to see and trim than to lose.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# ---------------------------------------------------------------------------
# Sources — the human portal (official-registries.js) and the open-data copy.
# ---------------------------------------------------------------------------
OFFICIAL_PORTAL_URL = "https://registries.health.gov.il/FoodManufacturers"
CKAN_BASE = "https://data.gov.il/api/3/action"
PACKAGE_ID = "fcs-manufacturer"
# Candidate from the card; discovery (package_show) is still run because a
# resource id is not a promise. --resource-id overrides both.
CANDIDATE_RESOURCE_ID = "9c55a7dd-3b92-4141-811c-5e30cc74a8a4"
PAGE_SIZE = 1000

# ---------------------------------------------------------------------------
# Filter A — Wave 1 settlements (MEH-2135 card, step 3). Whitespace-stripped,
# exact match after normalisation; variants listed explicitly rather than
# fuzzed, and near-misses are reported so a spelling variant shows up.
# ---------------------------------------------------------------------------
WAVE1_TOWNS = [
    "בנימינה",
    "גבעת עדה",
    "בנימינה-גבעת עדה",
    "זכרון יעקב",
    "פרדס חנה",
    "כרכור",
    "פרדס חנה-כרכור",
    "חדרה",
    "אור עקיבא",
    "אביאל",
    "עמיקם",
    "מעיין צבי",
    "מעגן מיכאל",
    "עין שמר",
    "גן שומרון",
    "תלמי אלעזר",
    "כפר גליקסון",
    "עתלית",
    "פוריידיס",
    "ג'סר א-זרקא",
    "קיסריה",
]

# ---------------------------------------------------------------------------
# Filter B — EXCLUDE non-production categories by STEM. Anything not matching
# an exclusion stem is kept (see LIMITS: exclusion, not whitelist).
# ---------------------------------------------------------------------------
EXCLUDE_STEMS = ("הובל", "אחסנ", "אחסון", "שיווק בלבד", "הפצה")

# ---------------------------------------------------------------------------
# Column resolution — candidates per logical field, first match wins, choice
# is printed. Extend from the printed live schema, never by guessing.
# ---------------------------------------------------------------------------
FIELD_CANDIDATES: dict[str, list[str]] = {
    "name": ["שם עסק", "שם העסק", "שם_עסק", "business_name", "name"],
    "city": ["יישוב", "ישוב", "עיר", "שם יישוב", "שם_ישוב", "city", "settlement"],
    "address": ["כתובת", "רחוב", "address"],
    "category": ["קטגוריה", "סוג רישיון", "סוג_רישיון", "תחום", "ענף", "category", "license_type"],
    "license_valid_until": ["תוקף רישיון", "תוקף_רישיון", "תאריך תוקף", "valid_until", "expiry"],
    "phone": ["טלפון", "phone", "tel"],
    "email": ["אימייל", "דוא\"ל", "email"],
}
OUTPUT_COLUMNS = ["שם עסק", "יישוב", "כתובת", "קטגוריה/סוג רישיון", "תוקף רישיון", "טלפון", "אימייל"]


def _norm(value) -> str:
    return " ".join(str(value or "").replace("‏", "").split())


def resolve_columns(fields: list[str]) -> dict[str, str | None]:
    """Map logical field → live column name (or None). Deterministic, printed."""
    lowered = {f.strip().lower(): f for f in fields}
    out: dict[str, str | None] = {}
    for logical, candidates in FIELD_CANDIDATES.items():
        hit = None
        for c in candidates:
            if c.lower() in lowered:
                hit = lowered[c.lower()]
                break
        out[logical] = hit
    return out


def in_wave1(city_value) -> bool:
    return _norm(city_value) in {_norm(t) for t in WAVE1_TOWNS}


def is_excluded_type(category_value) -> bool:
    cat = _norm(category_value)
    return any(stem in cat for stem in EXCLUDE_STEMS)


def near_misses(cities: set[str]) -> list[str]:
    """Unmatched settlements sharing a whole word with a Wave-1 town — the
    spelling-variant detector. Printed, never auto-included."""
    target_words = {w for t in WAVE1_TOWNS for w in _norm(t).replace("-", " ").split()}
    out = []
    for c in sorted(cities):
        if in_wave1(c):
            continue
        words = set(_norm(c).replace("-", " ").split())
        if words & target_words:
            out.append(c)
    return out


# ---------------------------------------------------------------------------
# Network (only reached behind --confirm)
# ---------------------------------------------------------------------------
def _get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "mehamakor-oneoff/1.0 (manual, local)"})
    with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310 — https, fixed host
        return json.load(resp)


def discover_resource_id() -> str:
    url = f"{CKAN_BASE}/package_show?{urllib.parse.urlencode({'id': PACKAGE_ID})}"
    data = _get_json(url)
    resources = (data.get("result") or {}).get("resources") or []
    for r in resources:
        if r.get("datastore_active"):
            print(f"[discover] datastore resource: {r.get('id')}  ({r.get('name')})")
            return r["id"]
    print("[discover] no datastore_active resource in package:", file=sys.stderr)
    for r in resources:
        print(f"    {r.get('id')}  {r.get('name')}  format={r.get('format')}", file=sys.stderr)
    sys.exit(5)


def fetch_all_rows(resource_id: str) -> tuple[list[str], list[dict]]:
    rows: list[dict] = []
    fields: list[str] = []
    offset = 0
    while True:
        q = urllib.parse.urlencode({"resource_id": resource_id, "limit": PAGE_SIZE, "offset": offset})
        data = _get_json(f"{CKAN_BASE}/datastore_search?{q}")
        result = data.get("result") or {}
        if not fields:
            fields = [f["id"] for f in result.get("fields", [])]
            print(f"[fetch] total={result.get('total')}  columns={fields}")
        page = result.get("records") or []
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return fields, rows


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------
def run_filters(fields: list[str], rows: list[dict], *, out_dir: Path) -> int:
    cols = resolve_columns(fields)
    print("[columns] resolution (logical -> live):")
    for k, v in cols.items():
        print(f"    {k:20s} -> {v}")
    if not cols["city"]:
        print("[columns] no settlement column recognised — extend FIELD_CANDIDATES['city'] from the schema above.", file=sys.stderr)
        return 2

    cat_col = cols["category"]
    if cat_col:
        counts: dict[str, int] = {}
        for r in rows:
            counts[_norm(r.get(cat_col))] = counts.get(_norm(r.get(cat_col)), 0) + 1
        print("[type] category value counts BEFORE filtering:")
        for k, n in sorted(counts.items(), key=lambda kv: -kv[1]):
            print(f"    {n:6d}  {k}   {'(EXCLUDED)' if is_excluded_type(k) else ''}")
    else:
        print("[type] no category column recognised — filter B skipped, every geo row kept.")

    geo = [r for r in rows if in_wave1(r.get(cols["city"]))]
    print(f"[geo] {len(rows)} total -> {len(geo)} in Wave 1")
    if not geo:
        misses = near_misses({_norm(r.get(cols["city"])) for r in rows})
        print("[geo] ZERO matches. Near-miss settlements (share a word with a target):", file=sys.stderr)
        for m in misses:
            print(f"    {m}", file=sys.stderr)
        return 3

    kept = [r for r in geo if not (cat_col and is_excluded_type(r.get(cat_col)))]
    print(f"[type] {len(geo)} -> {len(kept)} after exclusion")

    per_town: dict[str, int] = {}
    for r in kept:
        per_town[_norm(r.get(cols["city"]))] = per_town.get(_norm(r.get(cols["city"])), 0) + 1
    print("[summary] per settlement:")
    for town, n in sorted(per_town.items()):
        print(f"    {n:4d}  {town}")

    out_dir.mkdir(parents=True, exist_ok=True)
    raw_path = out_dir / "moh_raw_rows.json"
    raw_path.write_text(json.dumps({"fields": fields, "rows": rows}, ensure_ascii=False), encoding="utf-8")
    csv_path = out_dir / "wave1_moh_producers.csv"
    with csv_path.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow(OUTPUT_COLUMNS)
        for r in sorted(kept, key=lambda r: _norm(r.get(cols["city"]))):
            w.writerow([
                _norm(r.get(cols["name"])) if cols["name"] else "",
                _norm(r.get(cols["city"])),
                _norm(r.get(cols["address"])) if cols["address"] else "",
                _norm(r.get(cat_col)) if cat_col else "",
                _norm(r.get(cols["license_valid_until"])) if cols["license_valid_until"] else "",
                _norm(r.get(cols["phone"])) if cols["phone"] else "",
                _norm(r.get(cols["email"])) if cols["email"] else "",
            ])
    print(f"[out] {csv_path}  ({len(kept)} rows)   raw: {raw_path}")
    misses = near_misses({_norm(r.get(cols["city"])) for r in rows})
    if misses:
        print("[geo] near-miss settlements NOT included (check for spelling variants):")
        for m in misses:
            print(f"    {m}")
    return 0


# ---------------------------------------------------------------------------
# Offline modes
# ---------------------------------------------------------------------------
def dry_run() -> int:
    print("DRY RUN — no network. What a real run would do:")
    print(f"  official portal (manual cross-check): {OFFICIAL_PORTAL_URL}")
    print(f"  discovery:  {CKAN_BASE}/package_show?id={PACKAGE_ID}")
    print(f"  datastore:  {CKAN_BASE}/datastore_search?resource_id={CANDIDATE_RESOURCE_ID}&limit={PAGE_SIZE}&offset=N")
    print(f"  output columns: {OUTPUT_COLUMNS}")
    print(f"  filter A (settlements, {len(WAVE1_TOWNS)}): {WAVE1_TOWNS}")
    print(f"  filter B (EXCLUDE by stem): {list(EXCLUDE_STEMS)}")
    print("  column candidates per logical field:")
    for k, v in FIELD_CANDIDATES.items():
        print(f"    {k:20s} {v}")
    print("  refuses to fetch without --confirm; never run from Claude Code (see docstring).")
    return 0


def self_test() -> int:
    """Offline checks against synthetic rows. Says nothing about the live schema."""
    fails: list[str] = []
    ran = 0

    def check(name: str, cond: bool) -> None:
        nonlocal ran
        ran += 1
        if not cond:
            fails.append(name)

    # Filter A — exact after normalisation, variants explicit.
    check("geo/exact", in_wave1("בנימינה"))
    check("geo/whitespace", in_wave1("  זכרון  יעקב "))
    check("geo/rlm-stripped", in_wave1("‏חדרה"))
    check("geo/hyphen-variant", in_wave1("פרדס חנה-כרכור"))
    check("geo/apostrophe", in_wave1("ג'סר א-זרקא"))
    check("geo/not-tel-aviv", not in_wave1("תל אביב"))
    check("geo/not-substring", not in_wave1("חדרה מזרח"))
    check("geo/none", not in_wave1(None))
    # Near-miss detector — surfaces variants, never includes them.
    nm = near_misses({"חדרה מזרח", "תל אביב", "בנימינה"})
    check("nearmiss/reports-variant", "חדרה מזרח" in nm)
    check("nearmiss/skips-exact", "בנימינה" not in nm)
    check("nearmiss/skips-unrelated", "תל אביב" not in nm)
    # Filter B — stems, construct form, מזון neutral, אריזה neutral.
    check("type/haval-construct", is_excluded_type("הובלת מזון"))
    check("type/hovala", is_excluded_type("הובלה"))
    check("type/ahsana", is_excluded_type("אחסנת מזון"))
    check("type/ahsun", is_excluded_type("אחסון"))
    check("type/hafatza", is_excluded_type("הפצה"))
    check("type/shivuk-only", is_excluded_type("שיווק בלבד"))
    check("type/mazon-neutral", not is_excluded_type("ייצור מזון"))
    check("type/bakery-kept", not is_excluded_type("מאפייה"))
    check("type/ariza-neutral", not is_excluded_type("אריזה"))
    check("type/dairy-kept", not is_excluded_type("מחלבה"))
    check("type/none-kept", not is_excluded_type(None))
    # Column resolution — case-insensitive, first candidate wins, printed choice.
    cols = resolve_columns(["שם עסק", "ישוב", "כתובת", "סוג רישיון", "תוקף רישיון", "טלפון"])
    check("cols/name", cols["name"] == "שם עסק")
    check("cols/city-variant", cols["city"] == "ישוב")
    check("cols/category", cols["category"] == "סוג רישיון")
    check("cols/valid", cols["license_valid_until"] == "תוקף רישיון")
    check("cols/phone", cols["phone"] == "טלפון")
    check("cols/email-missing", cols["email"] is None)
    cols2 = resolve_columns(["Business_Name", "CITY"])
    check("cols/case-insensitive", cols2["name"] == "Business_Name" and cols2["city"] == "CITY")
    check("cols/no-city", resolve_columns(["שם", "כתובת"])["city"] is None)
    # End-to-end on synthetic rows, in a temp dir (no network).
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        fields = ["שם עסק", "יישוב", "כתובת", "קטגוריה"]
        rows = [
            {"שם עסק": "מאפיית הכפר", "יישוב": "בנימינה", "כתובת": "", "קטגוריה": "ייצור מזון"},
            {"שם עסק": "הובלות דן", "יישוב": "בנימינה", "כתובת": "", "קטגוריה": "הובלת מזון"},
            {"שם עסק": "מחלבת רמות", "יישוב": "תל אביב", "כתובת": "", "קטגוריה": "מחלבה"},
        ]
        rc = run_filters(fields, rows, out_dir=Path(td))
        check("e2e/exit-0", rc == 0)
        out = (Path(td) / "wave1_moh_producers.csv").read_text(encoding="utf-8-sig").splitlines()
        check("e2e/header", out[0].split(",")[0] == "שם עסק")
        check("e2e/one-row", len(out) == 2)
        check("e2e/kept-bakery", "מאפיית הכפר" in out[1])
        check("e2e/no-city-exit-2", run_filters(["שם", "כתובת"], rows, out_dir=Path(td)) == 2)
        far = [dict(r, **{"יישוב": "תל אביב"}) for r in rows]
        check("e2e/zero-geo-exit-3", run_filters(fields, far, out_dir=Path(td)) == 3)

    print(f"self-test: {ran} checks, {len(fails)} failed")
    for f in fails:
        print(f"  FAIL {f}")
    return 1 if fails else 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[2].strip())
    p.add_argument("--dry-run", action="store_true", help="print URLs, columns and filters; no network")
    p.add_argument("--self-test", action="store_true", help="offline filter checks; no network")
    p.add_argument("--confirm", action="store_true", help="actually fetch from data.gov.il (Sapir, locally — never CC)")
    p.add_argument("--out", default="./moh-registry", help="output directory (default ./moh-registry)")
    p.add_argument("--resource-id", default=None, help="skip discovery and use this datastore resource id")
    a = p.parse_args(argv)

    if a.dry_run:
        return dry_run()
    if a.self_test:
        return self_test()
    if not a.confirm:
        print("refusing to fetch: pass --confirm to hit data.gov.il (or --dry-run / --self-test for offline modes).", file=sys.stderr)
        print("This script is never run from Claude Code — see the module docstring.", file=sys.stderr)
        return 4

    try:
        rid = a.resource_id or discover_resource_id()
        fields, rows = fetch_all_rows(rid)
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code} from data.gov.il — {e.reason}. Automated access is denied by site policy; run locally.", file=sys.stderr)
        return 4
    except urllib.error.URLError as e:
        print(f"unreachable: {e.reason}", file=sys.stderr)
        return 4
    return run_filters(fields, rows, out_dir=Path(a.out))


if __name__ == "__main__":
    sys.exit(main())
