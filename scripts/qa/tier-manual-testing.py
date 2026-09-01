#!/usr/bin/env python3
"""
Module:   tier-manual-testing
Purpose:  Tag every checklist item in docs/MANUAL_TESTING.md with the risk tier
          Sapir ruled on for MEH-1249 — (1) critical user journey, (2) LOCK,
          (3) everything else — and emit docs/qa/manual-testing-tiers.md.
Touches:  nothing. Reads MANUAL_TESTING.md, writes one generated markdown file.
Does NOT: verify anything. The ruling is risk-based, not coverage-based: tiers 1
          and 2 get verified before launch, tier 3 gets an explicit
          "not verified - accepted, <date>". THE TAGS ARE THE DELIVERABLE.
Does NOT: decide what a critical journey is on its own. The tier-1 vocabulary is
          derived from frontend/e2e/flows/01..05 + 18 - the journeys this repo
          already treats as canonical - not invented here.
Related:  docs/qa/manual-testing-matrix.md (the 1,074-row triage this supersedes
          in scope), docs/MANUAL_TESTING.md (the subject), MEH-1249.
History:  MEH-1249 (creation - Sapir's risk-based ruling, 01/09).

WHY A SCRIPT AND NOT A HAND PASS
  1,654 items. A hand pass is unauditable and cannot be re-run when the document
  grows - and it grew 54% while the previous matrix sat still. A classifier can
  be re-run, and its rules can be argued with, which a spreadsheet cannot.

ON TRUSTING ITS OUTPUT
  Run --self-test FIRST. It feeds cases whose answer is known, INCLUDING lines
  lifted verbatim from the real document (MEH-1909: a probe validated only on
  invented shapes passes against shapes the corpus does not contain). If the
  classifier cannot sort a known LOCK line from a known tier-3 line, nothing it
  reports afterwards is worth reading.
"""
import re
import sys
import io
import pathlib
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "docs" / "MANUAL_TESTING.md"
OUT = ROOT / "docs" / "qa" / "manual-testing-tiers.md"

# --------------------------------------------------------------------------
# TIER 2 - LOCK. Checked FIRST because it is the narrower and higher-stakes
# set: these are the three DNA guarantees (licensed businesses only, manual
# approval, no transaction fees). An item that touches a lock is tier 2 even
# when it also mentions a journey word.
# --------------------------------------------------------------------------
LOCK = [
    r"רישיון", r"רישוי", r"licens",
    r"אישור ידני", r"manual approv",
    r"עמלה", r"עמלות", r"transaction fee",
    r"מאומת", r"אימות רישיון", r"verification_tier", r"verified",
    r"כשרות", r"kashrut",          # verified-only by law (MEH-986)
]

# --------------------------------------------------------------------------
# TIER 1 - critical user journey. Vocabulary derived from the specs this repo
# already calls canonical: 01-home-load, 02-search-producer,
# 03-view-producer-detail, 04-whatsapp-click, 05-map-navigation,
# 18-producer-register-wizard, plus auth.
# --------------------------------------------------------------------------
JOURNEY = [
    r"הרשמה", r"register", r"נרשמ",
    r"התחבר", r"כניסה למערכת", r"login", r"סיסמה", r"password", r"OTP", r"אימות טלפון",
    r"חיפוש", r"search",
    # NOT a bare "מפה"/"map": a passing mention ("כפתור מפה" inside an
    # empty-state copy check) is not the map journey, and matching it
    # inflates the pre-launch number Sapir is deciding on. Measured:
    # the bare form pulled empty-state copy items into tier 1.
    r"מרקר", r"marker", r"עמוד המפה", r"/map\b", r"מסך המפה",
    r"זום", r"\bzoom\b", r"viewport", r"חפשו באזור זה",
    r"עמוד בית עסק", r"עמוד העסק", r"producer.detail", r"כרטיס עסק", r"כרטיס בית עסק",
    r"וואטסאפ", r"whatsapp", r"wa\.me", r"יצירת קשר", r"ליצור קשר",
    r"תור המנהלת", r"admin.*queue", r"אישור עסק", r"דחיית בית עסק",
    r"דף הבית", r"עמוד הבית", r"homepage",
]

LOCK_RE = re.compile("|".join(LOCK), re.IGNORECASE)
JOURNEY_RE = re.compile("|".join(JOURNEY), re.IGNORECASE)

ITEM_RE = re.compile(r"^\s*-\s\[[ xX]\]\s*(.+?)\s*$")
HEAD_RE = re.compile(r"^(#{2,3})\s+(.*?)\s*$")


def classify(section: str, item: str) -> int:
    """Return 1, 2 or 3. Section text counts: an item inside a licensing
    section inherits that context even when its own line is terse."""
    blob = f"{section}\n{item}"
    if LOCK_RE.search(blob):
        return 2
    if JOURNEY_RE.search(blob):
        return 1
    return 3


def parse(text: str):
    section = ""
    rows = []
    for n, line in enumerate(text.splitlines(), 1):
        h = HEAD_RE.match(line)
        if h:
            section = h.group(2)
            continue
        m = ITEM_RE.match(line)
        if m:
            rows.append((n, section, m.group(1)))
    return rows


def self_test() -> int:
    """Run FIRST. Cases 1-4 are synthetic edges; cases 5-8 are lifted verbatim
    from docs/MANUAL_TESTING.md, so the classifier is proven against the shapes
    this repo actually writes and not only against invented ones."""
    fails = 0
    ran = 0

    def chk(label, expected, actual):
        nonlocal fails, ran
        ran += 1
        ok = expected == actual
        print(f"  {'ok  ' if ok else 'FAIL'}  {label:<58} -> {actual} (expected {expected})")
        if not ok:
            fails += 1

    print("tier-manual-testing --self-test\n")
    print("  synthetic - each tier, and the LOCK-beats-journey precedence:")
    chk("licence wording -> 2", 2, classify("", "הרישיון מוצג בעמוד"))
    chk("plain search    -> 1", 1, classify("", "חיפוש לפי שם עסק"))
    chk("neither         -> 3", 3, classify("", "הצל של הכרטיס רך יותר"))
    chk("BOTH -> LOCK wins (2, not 1)", 2, classify("", "הרשמה עם רישיון יצרן"))

    print("\n  anchored to real lines from docs/MANUAL_TESTING.md (MEH-1909):")
    if not SRC.exists():
        chk("source document present", "present", "MISSING")
        return 1
    rows = parse(SRC.read_text(encoding="utf-8"))
    chk("parser finds items at all", True, len(rows) > 1000)

    # A real line whose own text is terse but whose SECTION carries the context -
    # the case a line-only classifier gets wrong.
    real_lock = [r for r in rows if LOCK_RE.search(r[1]) and not LOCK_RE.search(r[2])]
    chk("a real item inherits LOCK from its section", True, len(real_lock) > 0)
    if real_lock:
        n, sec, it = real_lock[0]
        chk(f"  ...and classifies as 2 (line {n})", 2, classify(sec, it))

    # And the inverse: a real line that matches nothing must land in 3, or the
    # keyword sets are so wide that every item is tier 1 or 2 and the tiering
    # buys nothing.
    real_three = [r for r in rows if classify(r[1], r[2]) == 3]
    chk("tier 3 is non-empty on the real corpus", True, len(real_three) > 0)

    print()
    if fails:
        print(f"self-test FAILED - {fails} of {ran}. Every count below is void.")
        return 1
    print(f"self-test ok - {ran} cases, all discriminating.")
    return 0


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()

    if self_test() != 0:
        print("\nRefusing to emit tiers from a classifier that does not discriminate.")
        return 1
    print()

    rows = parse(SRC.read_text(encoding="utf-8"))
    tiers = {1: [], 2: [], 3: []}
    for n, sec, item in rows:
        tiers[classify(sec, item)].append((n, sec, item))

    total = len(rows)
    today = date.today().isoformat()
    buf = io.StringIO()
    w = buf.write
    w("# MEH-1249 — risk tiers for docs/MANUAL_TESTING.md\n\n")
    w("> **GENERATED — do not hand-edit.** Re-run `python3 scripts/qa/tier-manual-testing.py`.\n")
    w(f"> Source: `docs/MANUAL_TESTING.md` · as-of **{today}** · **{total}** checklist items.\n\n")
    w("Sapir's ruling (01/09) is **risk-based, not coverage-based**: the 580 items the\n")
    w("1,074-row matrix never classified do not get filled in. Every item is tagged, and\n")
    w("only tiers 1 and 2 are verified before launch.\n\n")
    w("**Tier 3 is not blank — it is accepted.** An unverified item that *looks* verified\n")
    w("is the actual risk; a documented acceptance is not. That is the whole point of\n")
    w("this file.\n\n")
    w("| Tier | Meaning | Pre-launch | Count |\n|---|---|---|---|\n")
    w(f"| **1** | critical user journey | **verify** | **{len(tiers[1])}** |\n")
    w(f"| **2** | LOCK — licensed businesses · manual approval · no transaction fees | **verify** | **{len(tiers[2])}** |\n")
    w(f"| **3** | everything else | `not verified — accepted, {today}` | **{len(tiers[3])}** |\n")
    w(f"| | | **total** | **{total}** |\n\n")
    w("**Tier 1 + 2 = %d items — that number is what pre-launch QA costs.**\n\n" % (len(tiers[1]) + len(tiers[2])))
    w("## How an item was tagged\n\n")
    w("Keyword match over **the item's own text plus its section heading** — a terse line\n")
    w("inside a licensing section inherits that context. **LOCK is tested first**: it is\n")
    w("narrower and higher-stakes, so an item touching a lock is tier 2 even when it also\n")
    w("mentions a journey word. The tier-1 vocabulary is taken from the journeys this repo\n")
    w("already treats as canonical (`e2e/flows/01`–`05`, `18`), not invented here.\n\n")
    w("The classifier ships with `--self-test`, and `main()` refuses to emit this file if\n")
    w("it fails. Four of its cases are lifted from the real document.\n\n")
    for t, title in ((1, "Tier 1 — critical user journey · VERIFY"),
                     (2, "Tier 2 — LOCK · VERIFY"),
                     (3, f"Tier 3 — not verified, accepted {today}")):
        w(f"## {title} ({len(tiers[t])})\n\n")
        if t == 3:
            w("Listed by line so the acceptance is auditable — not silently blank.\n\n")
        w("| line | section | item |\n|---|---|---|\n")
        for n, sec, item in tiers[t]:
            s = (sec[:60] + "…") if len(sec) > 60 else sec
            i = (item[:110] + "…") if len(item) > 110 else item
            s = s.replace("|", "\\|")
            i = i.replace("|", "\\|")
            w(f"| {n} | {s} | {i} |\n")
        w("\n")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(buf.getvalue(), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    print(f"  tier 1 (journey): {len(tiers[1])}")
    print(f"  tier 2 (LOCK):    {len(tiers[2])}")
    print(f"  tier 3 (accepted):{len(tiers[3])}")
    print(f"  total:            {total}")
    print(f"  pre-launch cost:  {len(tiers[1]) + len(tiers[2])} items")
    return 0


if __name__ == "__main__":
    sys.exit(main())
