#!/usr/bin/env python3
"""Launch data-readiness report — how many approved businesses actually render
a complete page (MEH-1967).

READ-ONLY. Every request is a GET against the **public** API; nothing here
writes to the database, to the API, or to any file outside ``--out``.

Why this does not just page ``/producers``
------------------------------------------
The catalog listing default-hides ``availability_state = "on_vacation"``
(``services/producer_listing.py``, MEH-291 Phase 3), so paging it silently
omits approved businesses. A readiness report that inherits the listing's
blind spot would report a completeness figure over a subset while presenting
it as the whole — so the enumeration unions the default listing with one
explicit query per availability state, and then reconciles the total against
``/producers/count``. A mismatch after that is printed as a finding rather
than swallowed: a paginated listing is evidence of presence, never of absence.

Seed fixtures
-------------
``backend/seed_data.py`` ships five demo producers. They are read out of that
file (by slug, no network) and reported in their own column, because a
completeness percentage that counts fixtures as businesses answers a question
nobody asked.

Usage
-----
    python scripts/checks/data-readiness.py
    python scripts/checks/data-readiness.py --base-url https://staging.mehamakor.online/api
    python scripts/checks/data-readiness.py --out /tmp/report.md --raw /tmp/raw.json

Exit codes: 0 = report written. 1 = the API could not be enumerated.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
SEED_FILE = REPO_ROOT / "backend" / "seed_data.py"

DEFAULT_BASE_URL = "https://mehamakor.co.il/api"

# services/producer_listing.py hides on_vacation from the default listing, so
# the union below is what makes the enumeration complete. Kept in sync by the
# reconciliation against /producers/count rather than by hope — a state added
# to schemas.AVAILABILITY_STATES and not to this tuple shows up as a gap in
# the "unreachable" line of the report.
AVAILABILITY_STATES = (
    "accepting_orders",
    "available_today",
    "full_this_week",
    "on_vacation",
)

# The card's definition of a launch-ready page.
MIN_DESCRIPTION_CHARS = 100

TIMEOUT_S = 25


# ---------------------------------------------------------------- HTTP (GET only)


def _get(base_url: str, path: str, **params: Any) -> Any:
    """GET a JSON endpoint. The only network primitive in this file."""
    query = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    url = f"{base_url.rstrip('/')}/{path.lstrip('/')}" + (f"?{query}" if query else "")
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:  # noqa: S310
        return json.loads(resp.read().decode("utf-8"))


# ---------------------------------------------------------------- enumeration


def enumerate_slugs(base_url: str) -> tuple[list[str], list[str], int]:
    """Return (all_slugs, listing_only_slugs, count_endpoint_total).

    ``listing_only_slugs`` is what the default catalog shows; ``all_slugs``
    adds everything reachable through an explicit availability_state filter.
    The difference is the set of approved businesses a visitor cannot browse
    to, and it is reported rather than merged away.
    """
    listing: list[str] = []
    offset = 0
    while True:
        page = _get(base_url, "/producers", limit=100, offset=offset)
        if not page:
            break
        listing.extend(p["slug"] for p in page)
        if len(page) < 100:
            break
        offset += 100

    every = list(listing)
    for state in AVAILABILITY_STATES:
        for p in _get(base_url, "/producers", limit=100, availability_state=state):
            if p["slug"] not in every:
                every.append(p["slug"])

    total = int(_get(base_url, "/producers/count").get("count", 0))
    return every, listing, total


def seed_slugs() -> set[str]:
    """Slugs shipped as demo fixtures by backend/seed_data.py (no network).

    Raises rather than returning an empty set when the file is unreadable or
    parses to nothing. An empty set here is not a harmless default: every
    fixture would be reclassified as a real business and the headline number
    would invert, silently and in the reassuring direction.
    """
    if not SEED_FILE.is_file():
        raise FileNotFoundError(
            f"{SEED_FILE} not found — cannot tell fixtures from real businesses. "
            "Run this from inside the repo."
        )
    found = set(re.findall(r'"slug":\s*"([a-z0-9-]+)"', SEED_FILE.read_text("utf-8")))
    if not found:
        raise ValueError(
            f"{SEED_FILE} parsed to zero slugs — the seed file's shape changed and "
            "this regex no longer matches it. Fix the pattern; do not ship the report."
        )
    return found


# ---------------------------------------------------------------- field scoring

# (key, label, predicate) — every predicate takes the detail dict.
FIELDS: tuple[tuple[str, str, Any], ...] = (
    ("hero", "תמונת נושא", lambda d: bool(d.get("images"))),
    ("gallery_3", "גלריה (≥3 תמונות)", lambda d: len(d.get("images") or []) >= 3),
    (
        "description",
        f"תיאור (≥{MIN_DESCRIPTION_CHARS} תווים)",
        lambda d: len((d.get("description") or "").strip()) >= MIN_DESCRIPTION_CHARS,
    ),
    ("short_description", "תיאור קצר", lambda d: bool((d.get("short_description") or "").strip())),
    ("hours", "שעות פתיחה", lambda d: bool(d.get("opening_hours"))),
    ("categories", "קטגוריה (≥1)", lambda d: bool(d.get("categories"))),
    ("products", "מוצרים (≥1)", lambda d: bool(d.get("products"))),
    ("product_prices", "מחיר לכל מוצר", lambda d: bool(d.get("products"))
        and all(
            p.get("price_range") or p.get("price_min") is not None
            for p in d["products"]
        )),
    ("product_images", "תמונה לכל מוצר", lambda d: bool(d.get("products"))
        and all(p.get("image_url") for p in d["products"])),
    ("location", "מיקום על המפה", lambda d: bool(d.get("locations")) or (
        d.get("lat") is not None and d.get("lng") is not None)),
    ("delivery_or_pickup", "משלוח או איסוף מוגדר", lambda d: bool(
        d.get("delivery_areas") or d.get("delivery_nationwide")
        or d.get("has_physical_location") or d.get("pickup_points"))),
    ("delivery_fees", "מינימום הזמנה לכל אזור משלוח", lambda d: bool(d.get("delivery_areas"))
        and all(a.get("min_order") is not None for a in d["delivery_areas"])),
    ("phone", "טלפון", lambda d: bool((d.get("phone") or "").strip())),
    ("phone_verified", "טלפון מאומת", lambda d: bool(d.get("phone_verified"))),
    ("contact_channel", "ערוץ קשר נוסף (מייל/אתר/רשת)", lambda d: any(
        (d.get(k) or "").strip() for k in
        ("contact_email", "website", "instagram", "facebook", "whatsapp_group"))),
    ("owner_story", "סיפור בעלת העסק", lambda d: bool((d.get("owner_bio") or "").strip())),
    ("owner_photo", "תמונת בעלת העסק", lambda d: bool(d.get("owner_photo_url"))),
    ("slug", "כתובת קבועה (slug)", lambda d: bool((d.get("slug") or "").strip())),
)

# The card's launch-ready gate: hero + description ≥100 chars + hours + ≥1 category.
LAUNCH_READY_KEYS = ("hero", "description", "hours", "categories")


def score(detail: dict) -> dict[str, bool]:
    out: dict[str, bool] = {}
    for key, _label, predicate in FIELDS:
        try:
            out[key] = bool(predicate(detail))
        except (TypeError, AttributeError, KeyError):
            # A shape the predicate did not expect is a gap, not a crash — but
            # it is recorded as False so it surfaces in the report rather than
            # being counted as complete.
            out[key] = False
    return out


# ---------------------------------------------------------------- report


def render(
    rows: list[dict],
    listing_only: list[str],
    count_total: int,
    base_url: str,
    *,
    with_contact: bool = False,
) -> str:
    today = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
    real = [r for r in rows if not r["is_seed"]]
    seeds = [r for r in rows if r["is_seed"]]
    ready_real = [r for r in real if r["launch_ready"]]
    ready_all = [r for r in rows if r["launch_ready"]]

    L = []
    L.append(f"# דוח מוכנות דטה ל-launch — {today}")
    L.append("")
    L.append(f"> נמדד מול `{base_url}` ב-{dt.datetime.now(dt.timezone.utc):%Y-%m-%d %H:%M} UTC.")
    L.append("> קריאה בלבד — GET בלבד, אפס כתיבות. להרצה חוזרת:")
    L.append("> `python scripts/checks/data-readiness.py`")
    L.append("")
    L.append("## המספר")
    L.append("")
    if not real:
        L.append(
            f"**אין ולו בית עסק אמיתי אחד בקטלוג.** כל {len(rows)} העסקים המאושרים "
            f"הם fixtures מ-`backend/seed_data.py`, כך שהשאלה ששאלת — כמה עסקים מוכנים "
            "לתצוגה — עדיין אין לה מכנה. זה הממצא, לא תקלה בדוח."
        )
        L.append("")
        L.append(
            f"לשם השוואה בלבד, ה-fixtures עצמם: **{len(ready_all)}/{len(rows)}** "
            "עוברים את הסף."
        )
    else:
        L.append(f"**{len(ready_real)} מתוך {len(real)} בתי עסק אמיתיים מוכנים לתצוגה.**")
        L.append("")
        L.append(
            f"סה\"כ עסקים מאושרים ב-API: **{len(rows)}** — מתוכם **{len(seeds)}** הם "
            f"fixtures מ-`backend/seed_data.py` ו-**{len(real)}** אמיתיים. "
            f"כולל ה-fixtures: {len(ready_all)}/{len(rows)} עוברים את הסף."
        )
    L.append("")
    L.append(
        '"מוכן לתצוגה" = תמונת נושא **וגם** תיאור באורך ≥'
        f"{MIN_DESCRIPTION_CHARS} תווים **וגם** שעות פתיחה **וגם** קטגוריה אחת לפחות "
        "(ההגדרה מהכרטיס)."
    )
    L.append("")

    # Reconciliation — the presence/absence rule, made explicit.
    L.append("## אימות ספירה")
    L.append("")
    L.append("| מקור | כמות |")
    L.append("|---|---|")
    L.append(f"| `/producers/count` | {count_total} |")
    L.append(f"| `/producers` (קטלוג ברירת מחדל) | {len(listing_only)} |")
    L.append(f"| איחוד כל מצבי הזמינות (הבסיס לדוח) | {len(rows)} |")
    L.append("")
    hidden = [r["slug"] for r in rows if r["slug"] not in listing_only]
    if hidden:
        subject = "עסק מאושר אחד אינו מופיע" if len(hidden) == 1 else (
            f"{len(hidden)} עסקים מאושרים אינם מופיעים"
        )
        L.append(
            f"**{subject} בקטלוג**: "
            + ", ".join(f"`{s}`" for s in hidden)
            + ". זה default-hide של `on_vacation` (MEH-291 Phase 3) — התנהגות מכוונת "
            "בקטלוג, אבל `/producers/count` ו-`/producers/cities` אינם מחילים אותה, "
            "ולכן הם סופרים עסק שאי אפשר להגיע אליו דרך הקטלוג."
        )
        L.append("")
    if count_total != len(rows):
        L.append(
            f"⚠️ **פער בלתי מוסבר**: `/producers/count` מדווח {count_total} "
            f"והאיחוד מצא {len(rows)}. עסק שאינו מגיע לאף אחד מהמסננים אינו נספר בדוח הזה."
        )
        L.append("")

    # Per-field summary.
    L.append("## שלמות פר-שדה")
    L.append("")
    L.append("| שדה | אמיתיים | כלל העסקים |")
    L.append("|---|---|---|")
    for key, label, _ in FIELDS:
        r_n = sum(1 for r in real if r["fields"][key])
        a_n = sum(1 for r in rows if r["fields"][key])
        r_pct = f"{100 * r_n // len(real)}%" if real else "—"
        a_pct = f"{100 * a_n // len(rows)}%" if rows else "—"
        L.append(f"| {label} | {r_n}/{len(real)} ({r_pct}) | {a_n}/{len(rows)} ({a_pct}) |")
    L.append("")

    # Per-producer gaps, worst first.
    L.append("## פערים פר-עסק — הגרוע ביותר קודם")
    L.append("")
    if not with_contact:
        L.append(
            "> עמודת הטלפון מציגה **קיים/חסר בלבד**. הריפו הזה ציבורי, ומספר טלפון של "
            "בעלת עסק אמיתית שנכתב לקובץ שנדחף אליו הוא פרסום, לא דוח. לרשימת חיוג "
            "מלאה: `python scripts/checks/data-readiness.py --with-contact --out "
            "/tmp/dialing-list.md` — מקומית, מחוץ ל-git."
        )
        L.append("")
    L.append("| עסק | עיר | טלפון | מקור | מוכן? | חסרים | מה חסר |")
    L.append("|---|---|---|---|---|---|---|")
    for r in sorted(rows, key=lambda x: (-x["gap_count"], x["name"])):
        missing = ", ".join(
            label for key, label, _ in FIELDS if not r["fields"][key]
        ) or "—"
        if with_contact:
            phone = r["phone"] or "—"
        else:
            phone = "✓" if r["phone"] else "✗"
        L.append(
            f"| {r['name']} | {r['city'] or '—'} | {phone} | "
            f"{'fixture' if r['is_seed'] else 'אמיתי'} | "
            f"{'✅' if r['launch_ready'] else '❌'} | {r['gap_count']} | {missing} |"
        )
    L.append("")
    L.append("## מה הדוח הזה **לא** אומר")
    L.append("")
    L.append(
        "- **`תמונת נושא` ריקה כאן היא פער דטה, לא תקלת Cloudinary.** ה-API מחזיר "
        "`images: []` — אין רשומת תמונה כלל, ולכן אין מה שייכשל בטעינה. תקלת ה-401 "
        "החיה היא שאלה נפרדת ובבעלות אחרת; שתיהן פוגעות באותו עמוד, אבל תיקון אחת לא "
        "מזיז את השנייה."
    )
    L.append(
        "- **מספרים שאין להם עדיין מכנה** מוצגים כ-`0/0 (—)` בעמודת האמיתיים, ולא "
        "כאפס אחוז. אחוז מתוך אפס אינו מדידה."
    )
    L.append(
        "- **סף ה-100 תווים הוא הגדרת הכרטיס**, לא תקן. שינוי הסף משנה את המונה — "
        "`MIN_DESCRIPTION_CHARS` בסקריפט."
    )
    L.append("")
    L.append("---")
    L.append("")
    L.append(
        "נוצר על ידי `scripts/checks/data-readiness.py`. הדוח מתעדכן בהרצה חוזרת של "
        "אותה פקודה; אין בו שום כתיבה לדטה. אימות עצמי של המסווג: "
        "`python scripts/checks/data-readiness.py --self-test`."
    )
    return "\n".join(L) + "\n"


# ---------------------------------------------------------------- self-test

FIXTURE = Path(__file__).with_name("testdata") / "producer-detail-galil-farm.json"


def self_test() -> int:
    """Prove the scorer discriminates, offline. Exit 0 = all cases as expected.

    Three synthetic cases pin the edges; the fourth is a **real** payload
    captured from the live API, because a suite built only from shapes I
    invented proves the scorer works on shapes I invented. That is the failure
    the migration-audit probe hit: four synthetic cases green, and `None` for
    every real file, because the repo used a form none of the fixtures had.
    """
    failures: list[str] = []

    def check(name: str, got: Any, want: Any) -> None:
        if got != want:
            failures.append(f"{name}: got {got!r}, want {want!r}")

    # 1 — complete: every predicate must fire.
    complete = {
        "slug": "x",
        "images": ["a", "b", "c"],
        "description": "ד" * MIN_DESCRIPTION_CHARS,
        "short_description": "קצר",
        "opening_hours": {"sunday": "09:00-17:00"},
        "categories": [{"id": 1}],
        "products": [{"price_range": "10₪", "image_url": "u"}],
        "locations": [{"kind": "branch"}],
        "delivery_areas": [{"city": "חיפה", "min_order": 100}],
        "phone": "050-0000000",
        "phone_verified": True,
        "contact_email": "a@b.c",
        "owner_bio": "סיפור",
        "owner_photo_url": "u",
    }
    s = score(complete)
    check("complete/all-true", sorted(k for k, v in s.items() if not v), [])
    check("complete/launch-ready", all(s[k] for k in LAUNCH_READY_KEYS), True)

    # 2 — empty: nothing may fire. A scorer that defaults to True would pass
    #     case 1 and fail here, which is the point of having both.
    s = score({})
    check("empty/all-false", sorted(k for k, v in s.items() if v), [])

    # 3 — the boundary the card's definition turns on: one character short of
    #     the description minimum must NOT count as launch-ready.
    s = score({**complete, "description": "ד" * (MIN_DESCRIPTION_CHARS - 1)})
    check("short-description/launch-ready", all(s[k] for k in LAUNCH_READY_KEYS), False)

    # 4 — REAL payload. Anchors every predicate to the shape the API actually
    #     serves, not to the shape assumed above.
    if not FIXTURE.is_file():
        failures.append(f"missing real-payload fixture: {FIXTURE}")
    else:
        real = json.loads(FIXTURE.read_text("utf-8"))
        s = score(real)
        # Known answers, read off the live response for this producer.
        check("real/categories", s["categories"], True)
        check("real/products", s["products"], True)
        check("real/product_prices", s["product_prices"], True)
        check("real/delivery_fees", s["delivery_fees"], True)
        check("real/location", s["location"], True)
        check("real/hero", s["hero"], False)
        check("real/hours", s["hours"], False)
        check("real/description", s["description"], False)
        check("real/launch-ready", all(s[k] for k in LAUNCH_READY_KEYS), False)

    # 5 — seed detection reads the real repo file, not a fixture of it.
    seeds = seed_slugs()
    for slug in ("galil-farm", "golan-cheese", "dana-sourdough", "tases-ferments", "teva-pure"):
        if slug not in seeds:
            failures.append(f"seed_slugs() missed {slug} in {SEED_FILE}")

    for f in failures:
        print(f"self-test FAIL — {f}", file=sys.stderr)
    if failures:
        return 1
    print("self-test OK — 3 synthetic cases + 1 real payload + seed detection")
    return 0


# ---------------------------------------------------------------- main


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--base-url", default=DEFAULT_BASE_URL)
    ap.add_argument("--out", default=None, help="default: docs/reports/data-readiness-<today>.md")
    ap.add_argument(
        "--raw",
        default=None,
        help="optional path for the raw API payloads. NOTE: these are verbatim API "
        "responses and DO contain unmasked phone numbers — --with-contact does not "
        "gate them. No default, so nothing is written unless you name a path; name "
        "one outside git.",
    )
    ap.add_argument(
        "--with-contact",
        action="store_true",
        help="print real phone numbers in the report. OFF by default: this repo is "
        "public and the default --out path is inside it. Use with an --out outside git.",
    )
    ap.add_argument(
        "--self-test",
        action="store_true",
        help="validate the scorer offline against known-answer cases; no network",
    )
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    try:
        slugs, listing_only, count_total = enumerate_slugs(args.base_url)
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        print(f"data-readiness: cannot enumerate {args.base_url}: {exc}", file=sys.stderr)
        return 1

    if not slugs:
        print(f"data-readiness: {args.base_url} returned no approved producers", file=sys.stderr)
        return 1

    seeds = seed_slugs()
    details: dict[str, dict] = {}
    rows: list[dict] = []
    for slug in slugs:
        try:
            d = _get(args.base_url, f"/producers/by-slug/{urllib.parse.quote(slug)}")
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            print(f"data-readiness: {slug}: {exc}", file=sys.stderr)
            continue
        details[slug] = d
        fields = score(d)
        rows.append(
            {
                "slug": slug,
                "name": d.get("name") or slug,
                "city": d.get("city"),
                "phone": d.get("phone"),
                "is_seed": slug in seeds,
                "fields": fields,
                "gap_count": sum(1 for v in fields.values() if not v),
                "launch_ready": all(fields[k] for k in LAUNCH_READY_KEYS),
            }
        )

    out = Path(args.out) if args.out else (
        REPO_ROOT / "docs" / "reports"
        / f"data-readiness-{dt.datetime.now(dt.timezone.utc):%Y-%m-%d}.md"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        render(
            rows,
            listing_only,
            count_total,
            args.base_url,
            with_contact=args.with_contact,
        ),
        "utf-8",
    )

    if args.raw:
        Path(args.raw).write_text(
            json.dumps(details, ensure_ascii=False, indent=1), "utf-8"
        )

    real = [r for r in rows if not r["is_seed"]]
    ready = [r for r in real if r["launch_ready"]]
    print(f"data-readiness: {len(ready)}/{len(real)} real businesses launch-ready "
          f"({len(rows)} approved total, {len(rows) - len(real)} seed fixtures) → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
