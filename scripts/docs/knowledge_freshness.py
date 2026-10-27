#!/usr/bin/env python3
"""
Module:   knowledge_freshness.py
Purpose:  One implementation behind the two staleness guards and the HANDOFF
          archiver, so the parsing rule ("what counts as a dated section", "what
          counts as a Last-reviewed date") has a single owner (ADR-035).
Touches:  reads HANDOFF.md / the watched docs. `archive-handoff` (and only it)
          rewrites HANDOFF.md and writes docs/archive/handoff/YYYY-MM.md.
Does NOT: judge whether a section's CONTENT is still true, block anything (the
          guards that call it are warn-only), or touch any file in check mode.
Related:  scripts/checks/handoff-retention-guard.sh,
          scripts/checks/doc-freshness-guard.sh,
          docs/decisions/ADR-035-one-home-per-fact.md,
          docs/archive/handoff/README.md
History:  MEH-2346 (creation).

WHY
  HANDOFF.md was defined as "rolling 7-day" and reached 13,716 lines;
  docs/CONTEXT.md carried "Last reviewed: 2026-05-23" five months later. Both
  rules were written down and neither had anything that noticed when it lapsed.
  A stale rule breaks nothing, so nobody looks. These checks make the lapse
  visible in the Repo guards log, warn-only.

USAGE
  python3 scripts/docs/knowledge_freshness.py handoff-check   [--today YYYY-MM-DD]
  python3 scripts/docs/knowledge_freshness.py docs-check      [--today YYYY-MM-DD]
  python3 scripts/docs/knowledge_freshness.py archive-handoff [--keep-days 7] [--dry-run]
  python3 scripts/docs/knowledge_freshness.py self-test
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import re
import sys
import tempfile
from pathlib import Path
from zoneinfo import ZoneInfo

REPO_ROOT = Path(__file__).resolve().parents[2]

# HANDOFF section header: "## 2026-10-25 22:25 — ..." / "## 2026-10-21 ערב — ...".
# Only a header that STARTS with an ISO date is dated. "## Session 2026-06-25 — ..."
# and "## 🚨 Runbook ..." are undated on purpose: they are left in place by the
# archiver and reported separately, never guessed at.
DATED_HEADER = re.compile(r"^## (\d{4}-\d{2}-\d{2})\b")
SECTION_HEADER = re.compile(r"^## ")
LAST_REVIEWED = re.compile(r"\*\*Last reviewed:\*\*\s*(\d{4}-\d{2}-\d{2})")

HANDOFF_WARN_DAYS = 14       # a section older than this is overdue for the archive
HANDOFF_WARN_LINES = 1500    # a one-screen-per-session file has no business past this
MAX_LISTED = 5             # one log screen; the count line carries the rest
ARCHIVE_KEEP_DAYS = 7        # what `archive-handoff` keeps by default (CONTEXT §3 "rolling 7-day")
DOC_WARN_DAYS = 120
WATCHED_DOCS = ("docs/CONTEXT.md", "docs/BRAND.md", "docs/PROJECT_INSTRUCTIONS.md")


def today_from(arg: str | None) -> dt.date:
    value = arg or os.environ.get("KNOWLEDGE_TODAY")
    # Israel's calendar day, not the runner's UTC one (israel-clock-guard's concern).
    return dt.date.fromisoformat(value) if value else dt.datetime.now(ZoneInfo("Asia/Jerusalem")).date()


# ------------------------------------------------------------------ parsing
def split_sections(text: str) -> tuple[list[str], list[tuple[int, list[str]]]]:
    """Return (preamble lines, [(1-based start line, section lines), ...])."""
    lines = text.split("\n")
    preamble: list[str] = []
    sections: list[tuple[int, list[str]]] = []
    for i, line in enumerate(lines, start=1):
        if SECTION_HEADER.match(line):
            sections.append((i, [line]))
        elif sections:
            sections[-1][1].append(line)
        else:
            preamble.append(line)
    return preamble, sections


def section_date(header: str) -> dt.date | None:
    m = DATED_HEADER.match(header)
    if not m:
        return None
    try:
        return dt.date.fromisoformat(m.group(1))
    except ValueError:
        return None


# ------------------------------------------------------------------ checks
def handoff_findings(text: str, today: dt.date, path: str = "HANDOFF.md") -> list[str]:
    _, sections = split_sections(text)
    dated = [(ln, sec, section_date(sec[0])) for ln, sec in sections]
    parsed = [d for d in dated if d[2] is not None]
    out: list[str] = []
    if not parsed:
        # Null control: a file with zero dated headers is either empty or a
        # format this parser no longer recognises. "No stale sections" would be
        # the reassuring answer to both, so say which question went unanswered.
        out.append(f"{path}:1: WARNING parsed 0 dated '## YYYY-MM-DD' sections — "
                   "every 'nothing stale' below is void until this is fixed")
        return out
    stale = [(ln, d, (today - d).days) for ln, _, d in parsed if (today - d).days > HANDOFF_WARN_DAYS]
    for ln, d, age in stale[:MAX_LISTED]:
        out.append(f"{path}:{ln}: WARNING section dated {d} is {age} days old "
                   f"(> {HANDOFF_WARN_DAYS})")
    if len(stale) > MAX_LISTED:
        out.append(f"{path}:{stale[MAX_LISTED][0]}: WARNING ... and {len(stale) - MAX_LISTED} more "
                   f"stale section(s), {len(stale)} in total")
    n_lines = text.count("\n") + (0 if text.endswith("\n") else 1)
    if n_lines > HANDOFF_WARN_LINES:
        out.append(f"{path}:1: WARNING {n_lines} lines (> {HANDOFF_WARN_LINES}) — "
                   "HANDOFF is one screen per session, history belongs in the archive")
    return out


def doc_findings(text: str | None, today: dt.date, path: str) -> list[str]:
    if text is None:
        return [f"{path}:1: NOTICE file not found — not checked"]
    for i, line in enumerate(text.split("\n"), start=1):
        m = LAST_REVIEWED.search(line)
        if m:
            d = dt.date.fromisoformat(m.group(1))
            age = (today - d).days
            if age > DOC_WARN_DAYS:
                return [(f"{path}:{i}: WARNING Last reviewed {d} is {age} days old "
                         f"(> {DOC_WARN_DAYS}) — re-check it against the repo and bump the date")]
            return []
    return [(f"{path}:1: WARNING no '**Last reviewed:** YYYY-MM-DD' line — "
             "a watched doc must carry one")]


# ------------------------------------------------------------------ archiver
def archive_handoff(root: Path, today: dt.date, keep_days: int, dry_run: bool) -> list[str]:
    handoff = root / "HANDOFF.md"
    text = handoff.read_text(encoding="utf-8")
    preamble, sections = split_sections(text)
    keep: list[list[str]] = []
    by_month: dict[str, list[list[str]]] = {}
    for _, sec in sections:
        d = section_date(sec[0])
        if d is not None and (today - d).days > keep_days:
            by_month.setdefault(d.strftime("%Y-%m"), []).append(sec)
        else:
            keep.append(sec)  # fresh, or undated: never moved on a guess
    report = [(f"archive {sum(len(v) for v in by_month.values())} section(s) "
               f"into {sorted(by_month)}; keep {len(keep)}")]
    if dry_run or not by_month:
        return report
    archive_dir = root / "docs" / "archive" / "handoff"
    archive_dir.mkdir(parents=True, exist_ok=True)
    for month, secs in by_month.items():
        target = archive_dir / f"{month}.md"
        old = target.read_text(encoding="utf-8") if target.exists() else f"# HANDOFF archive — {month}\n\n"
        head, _, rest = old.partition("\n\n")
        body = "\n".join("\n".join(s).rstrip("\n") + "\n" for s in secs)
        # Newest first, the same order as HANDOFF.md: what moves now is newer
        # than anything already archived for that month.
        target.write_text(head + "\n\n" + body + ("\n" + rest if rest.strip() else ""), encoding="utf-8")
    new = "\n".join(preamble) + "\n" + "\n".join("\n".join(s) for s in keep)
    handoff.write_text(new.rstrip("\n") + "\n", encoding="utf-8")
    return report


# ------------------------------------------------------------------ self-test
def self_test() -> int:
    """Drives the REAL functions above. Three synthetic shapes plus cases read
    from this repo's own files, so a parser that only recognises invented
    fixtures cannot pass (testing.md, MEH-1909)."""
    today = dt.date(2026, 10, 26)
    ran: list[str] = []
    failures: list[str] = []

    def check(name: str, cond: bool, detail: str = "") -> None:
        ran.append(name)
        if not cond:
            failures.append(f"{name}: {detail}")

    fresh = "# H\n\n## 2026-10-25 22:25 — fresh\nbody\n"
    stale = fresh + "\n## 2026-10-01 — old\nbody\n"
    f = handoff_findings(stale, today)
    check("handoff/stale-section-flagged", len(f) == 1 and ":6:" in f[0] and "WARNING" in f[0], repr(f))
    many = fresh + "".join(f"\n## 2026-09-{d:02d} — old\nbody\n" for d in range(1, 9))
    fm = handoff_findings(many, today)
    check("handoff/long-list-capped-with-count", len(fm) == 6 and "8 in total" in fm[-1], repr(fm))
    check("handoff/fresh-only-clean", handoff_findings(fresh, today) == [], repr(handoff_findings(fresh, today)))
    nod = handoff_findings("# H\n\n## Session notes\nx\n", today)
    check("handoff/zero-dated-is-loud", len(nod) == 1 and "parsed 0" in nod[0], repr(nod))
    check("handoff/hebrew-time-word-header", section_date("## 2026-10-21 ערב — x") == dt.date(2026, 10, 21))
    check("handoff/prefixed-date-is-undated", section_date("## Session 2026-06-25 — x") is None)

    check("doc/stale", "WARNING" in "".join(doc_findings("**Last reviewed:** 2026-01-01 · x", today, "d")))
    check("doc/fresh", doc_findings("**Last reviewed:** 2026-10-01", today, "d") == [])
    check("doc/missing-marker", "no '**Last reviewed:**" in "".join(doc_findings("# t\n", today, "d")))

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "HANDOFF.md").write_text("# H\n> pre\n\n## 2026-10-25 — a\nA\n\n## Runbook\nR\n\n## 2026-09-07 — b\nB\n", encoding="utf-8")
        archive_handoff(root, today, 7, dry_run=False)
        kept = (root / "HANDOFF.md").read_text(encoding="utf-8")
        arch = (root / "docs/archive/handoff/2026-09.md").read_text(encoding="utf-8")
        check("archive/moves-stale", "## 2026-09-07" in arch and "## 2026-09-07" not in kept, kept + "|" + arch)
        check("archive/keeps-fresh-and-undated", "## 2026-10-25" in kept and "## Runbook" in kept and kept.startswith("# H\n> pre"), kept)
        archive_handoff(root, today, 7, dry_run=False)
        check("archive/idempotent", (root / "HANDOFF.md").read_text(encoding="utf-8") == kept
              and (root / "docs/archive/handoff/2026-09.md").read_text(encoding="utf-8") == arch)

    # Anchored to the repo's real files: the parser must recognise the shape the
    # repo actually uses, not only the shapes invented above.
    real = (REPO_ROOT / "HANDOFF.md").read_text(encoding="utf-8")
    n_dated = sum(1 for _, s in split_sections(real)[1] if section_date(s[0]))
    check("real/HANDOFF-has-dated-sections", n_dated > 0, f"parsed {n_dated}")
    ctx = (REPO_ROOT / "docs/CONTEXT.md").read_text(encoding="utf-8")
    check("real/CONTEXT-has-last-reviewed", LAST_REVIEWED.search(ctx) is not None)

    for line in failures:
        print(f"FAIL {line}")
    print(f"knowledge_freshness self-test: {len(ran) - len(failures)}/{len(ran)} passed")
    return 1 if failures else 0


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[2])
    ap.add_argument("command", choices=["handoff-check", "docs-check", "archive-handoff", "self-test"])
    ap.add_argument("--today")
    ap.add_argument("--keep-days", type=int, default=ARCHIVE_KEEP_DAYS)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    if a.command == "self-test":
        return self_test()
    today = today_from(a.today)
    if a.command == "archive-handoff":
        for line in archive_handoff(REPO_ROOT, today, a.keep_days, a.dry_run):
            print(line)
        return 0
    if a.command == "handoff-check":
        findings = handoff_findings((REPO_ROOT / "HANDOFF.md").read_text(encoding="utf-8"), today)
        fix = "fix: python3 scripts/docs/knowledge_freshness.py archive-handoff  (in a docs-only PR, rule 31)"
    else:
        findings = []
        for rel in WATCHED_DOCS:
            p = REPO_ROOT / rel
            findings += doc_findings(p.read_text(encoding="utf-8") if p.exists() else None, today, rel)
        fix = "fix: re-check the doc against the repo, then bump its '**Last reviewed:**' date"
    for line in findings:
        print(line)
    if any("WARNING" in f for f in findings):
        print(fix)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
