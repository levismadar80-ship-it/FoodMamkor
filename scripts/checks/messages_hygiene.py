"""
Module:   messages_hygiene
Purpose:  Keep frontend/messages/he.json from growing dead keys and copied
          strings. A ratchet: what is in the baseline today is tolerated, a
          NEW unused key or a NEW duplicated value is red, and a baseline line
          that matches nothing is red too (the file only shrinks).
Touches:  nothing on a normal run. Writes the baseline only under
          --update-baseline.
Does NOT: judge wording (brand-lexicon-guard.sh), punctuation variants
          (frontend/__tests__/CopyVariantsGuard.test.js) or he/en parity
          (frontend/__tests__/en-parity-guard.test.js). One owner per fact.
Related:  docs/COPY_STYLE.md §0 (rule map), scripts/checks/brand-lexicon-guard.sh
          (the ratchet shape this copies: parsed-0 control, stale-line red).
History:  MEH-3657 (creation, under MEH-3652).

HOW "UNUSED" IS DECIDED, AND WHY IT LEANS TOWARD "USED"
  next-intl keys are read as `t("a.b")` after `useTranslations("ns")`, so a
  call site holds only a SUFFIX of the full key, and some keys are built at
  run time (a template literal such as t(`status.${s}`)). A key counts as used when any suffix of it
  of two or more segments appears as a string literal in the source, or its
  last segment does AND some earlier segment of the key appears as a literal
  too (the namespace), or it matches a template literal used as a key
  (`body.${b.key}.i${i}`), compiled to a pattern. Every one of these can only call a dead key alive, never
  a live key dead: a false red would teach people to baseline, so this guard
  accepts missing a few dead keys instead.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / "scripts/checks/messages-hygiene-baseline.txt"
SRC_DIRS = ("frontend/app", "frontend/components", "frontend/lib", "frontend/hooks")
SRC_EXT = (".js", ".jsx", ".ts", ".tsx", ".mjs")
HEBREW = re.compile(r"[א-ת]")
MIN_DUP_LEN = 4

LIT = re.compile(r"""["'`]([A-Za-z0-9_.\-]+)["'`]""")
TEMPLATE = re.compile(r"`([^`]*\$\{[^`]*)`")
PLACEHOLDER = re.compile(r"\$\{[^}]*\}")
KEY_CHARS = re.compile(r"[A-Za-z0-9_.\-]*")


def template_pattern(body: str) -> re.Pattern | None:
    """`body.${b.key}.i${i}` → a regex for the key suffixes it can produce.

    Only a template whose static text looks like a key path is kept: it has a
    `.`, or it ends on `_` / `-` with 3+ characters (`tab_${x}`). `on${e}`
    is an event name, and a first draft that kept it made «only_here» look
    alive. A template with no letter of its own (`${ns}.${key}`) is dropped
    too: it would match every key in the file."""
    statics = PLACEHOLDER.split(body)
    if not all(KEY_CHARS.fullmatch(x) for x in statics):
        return None
    joined = "".join(statics)
    if "." not in joined and not (len(joined) >= 3 and joined[-1] in "_-"):
        return None
    # `${ns}.${key}` has no letter of its own and would match every key.
    if not re.search(r"[A-Za-z0-9]", joined):
        return None
    rx = "[A-Za-z0-9_.\\-]+".join(re.escape(x) for x in statics)
    return re.compile(r"(?:^|\.)" + rx + "$")


def flatten(node: dict, prefix: str = ""):
    for k, v in node.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            yield from flatten(v, key)
        else:
            yield key, v


def source_files(repo: Path) -> list[Path]:
    out = []
    for d in SRC_DIRS:
        base = repo / d
        if not base.is_dir():
            continue
        for p in base.rglob("*"):
            if p.suffix in SRC_EXT and "__tests__" not in p.parts and "node_modules" not in p.parts \
                    and ".test." not in p.name and ".spec." not in p.name:
                out.append(p)
    return out


def collect(repo: Path) -> tuple[set[str], list[re.Pattern]]:
    lits: set[str] = set()
    pats: dict[str, re.Pattern] = {}
    for p in source_files(repo):
        text = p.read_text(encoding="utf-8", errors="replace")
        lits.update(LIT.findall(text))
        for body in TEMPLATE.findall(text):
            if body not in pats and (pat := template_pattern(body)):
                pats[body] = pat
    return lits, list(pats.values())


def is_used(key: str, lits: set[str], pats: list[re.Pattern]) -> bool:
    parts = key.split(".")
    for i in range(len(parts) - 1):
        if ".".join(parts[i:]) in lits:
            return True
    # Leaf call under a namespace: t("hint") after useTranslations("a.b").
    # The namespace may be any contiguous run of the earlier segments.
    if parts[-1] in lits and any(".".join(parts[i:j]) in lits
                                 for i in range(len(parts) - 1) for j in range(i + 1, len(parts))):
        return True
    if any(p.search(key) for p in pats):
        return True
    return False


def scan(repo: Path) -> tuple[int, list[str]]:
    """Return (number of source files read, sorted finding lines)."""
    msgs = repo / "frontend/messages/he.json"
    if not msgs.is_file():
        return 0, []
    pairs = list(flatten(json.loads(msgs.read_text(encoding="utf-8"))))
    files = source_files(repo)
    lits, pats = collect(repo)
    findings = [f"unused\t{k}" for k, _ in pairs if not is_used(k, lits, pats)]
    counts = Counter(v.strip() for _, v in pairs
                     if isinstance(v, str) and len(v.strip()) >= MIN_DUP_LEN and HEBREW.search(v))
    findings += [f"duplicate\t{n}\t{v}" for v, n in counts.items() if n > 1]
    return len(files), sorted(findings)


def read_baseline(path: Path) -> list[str]:
    if not path.is_file():
        return []
    return sorted(line.rstrip("\n") for line in path.read_text(encoding="utf-8").splitlines()
                  if line.strip() and not line.startswith("#"))


def keys_for(repo: Path, value: str) -> list[str]:
    msgs = json.loads((repo / "frontend/messages/he.json").read_text(encoding="utf-8"))
    return [k for k, v in flatten(msgs) if isinstance(v, str) and v.strip() == value]


def explain(repo: Path, line: str) -> str:
    kind, *rest = line.split("\t")
    if kind == "unused":
        return f"  - unused key {rest[0]}: no call site reads it. Delete it from he.json AND en.json."
    n, value = rest
    keys = keys_for(repo, value)
    return (f"  - «{value}» is now in {n} keys: {', '.join(keys[:6])}{' …' if len(keys) > 6 else ''}\n"
            f"    Reuse one of the existing keys instead of adding a copy.")


def run(repo: Path, baseline: Path, label: str = "messages-hygiene") -> int:
    nfiles, current = scan(repo)
    if nfiles == 0:
        print(f"::error::{label}: parsed 0 source files or no he.json — every result is void, NOT passing.",
              file=sys.stderr)
        return 1
    frozen = read_baseline(baseline)
    cur_c, fro_c = Counter(current), Counter(frozen)
    new = sorted((cur_c - fro_c).elements())
    stale = sorted((fro_c - cur_c).elements())
    # A duplicate whose count went DOWN shows as one stale line plus one new
    # line. That is progress: let the new line through when it is the same
    # value with a smaller count, and report the stale one as "shrink me".
    def dup_value(line: str) -> tuple[str, int] | None:
        p = line.split("\t")
        return (p[2], int(p[1])) if p[0] == "duplicate" else None
    stale_vals = {dv[0]: dv[1] for s in stale if (dv := dup_value(s))}
    new = [n for n in new if not ((dv := dup_value(n)) and dv[0] in stale_vals and dv[1] < stale_vals[dv[0]])]
    # And a count that went UP is reported once, as new, not also as stale.
    new_vals = {dv[0] for n in new if (dv := dup_value(n))}
    stale = [x for x in stale if not ((dv := dup_value(x)) and dv[0] in new_vals)]
    print(f"{label}: {nfiles} source files · {sum(1 for c in current if c.startswith('unused'))} unused keys · "
          f"{sum(1 for c in current if c.startswith('duplicate'))} duplicated values · baseline {len(frozen)} lines")
    rc = 0
    if new:
        rc = 1
        print(f"::error::{label}: new dead key or copied string in frontend/messages/he.json:", file=sys.stderr)
        for line in new:
            print(explain(repo, line), file=sys.stderr)
        print("  If it is deliberate, run --update-baseline and say why in the PR body.", file=sys.stderr)
    if stale:
        rc = 1
        print(f"::error::{label}: baseline lines that match nothing any more — the baseline must shrink:",
              file=sys.stderr)
        for line in stale:
            print(f"  - {line}", file=sys.stderr)
        print("  Run: bash scripts/checks/messages-hygiene-guard.sh --update-baseline", file=sys.stderr)
    return rc


def write_baseline(repo: Path, path: Path) -> None:
    _, current = scan(repo)
    head = (
        "# GENERATED by scripts/checks/messages-hygiene-guard.sh --update-baseline (MEH-3657)\n"
        "# unused<TAB>key            — a he.json key no call site reads (as of 21/11/2026: dead\n"
        "#                             keys left behind by removed screens; deleting them is the\n"
        "#                             follow-up card under MEH-3652).\n"
        "# duplicate<TAB>n<TAB>value — a Hebrew value held by n keys. Common words («ביטול»,\n"
        "#                             «בשמירה…») are here because 300+ files read them from\n"
        "#                             their own namespace; moving them to one `common` key is a\n"
        "#                             cross-cutting refactor, not done before launch.\n"
        "# Never edit by hand. Shrinking is the point; growing needs a reason in the PR body.\n"
    )
    path.write_text(head + "".join(f"{c}\n" for c in current), encoding="utf-8")


def self_test() -> int:
    import tempfile
    ok = 0
    total = 11
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp)
        (repo / "frontend/messages").mkdir(parents=True)
        (repo / "frontend/components/__tests__").mkdir(parents=True)
        (repo / "frontend/messages/he.json").write_text(json.dumps({
            "group_buys": {"card": {"cta_join": "אני רוצה להצטרף!", "title": "קבוצת רכישה"}},
            "status": {"open": "פתוח", "closed": "סגור"},
            "a": {"cancel": "ביטול"}, "b": {"cancel": "ביטול"},
            "dead": {"never_read": "טקסט שאף אחד לא קורא"},
            "zz": {"only_here": "מחרוזת שלא בשימוש"},
            "sweep_tail": {"event_new": {"hint": "רמז"}},
            "holidays": {"pesach": {"dashboard_hint": "פסח"}},
            "whats_new": {"releases": {"v1_5_8": {"i1": "שורה"}}},
        }, ensure_ascii=False), encoding="utf-8")
        # Anchored to the real pattern in frontend/components/ListingHubTabs.jsx
        # (useTranslations + t(labelKey)) and to a run-time key.
        (repo / "frontend/components/Card.jsx").write_text(
            'const t = useTranslations("group_buys");\n'
            'export const C = ({ s }) => <><b>{t("card.title")}</b><i>{t(`status.${s}`)}</i>'
            '<u>{tc("cancel")}{ta("a")}{tb("b")}</u></>;\n'
            'const handler = (e) => props[`on${e}`];\n'
            'const tn = useTranslations("sweep_tail.event_new"); tn("hint");\n'
            'tHoliday(`${h.key}.dashboard_hint`);\n'
            'tw(`${releaseKey}.i${i}`);\n'
            'tg(`${ns}.${key}`);\n', encoding="utf-8")
        (repo / "frontend/components/__tests__/Card.test.jsx").write_text(
            'expect(t("dead.never_read")).toBe("x");\n', encoding="utf-8")
        n, got = scan(repo)
        checks = [
            ("unused\tdead.never_read" in got, "a key read only by a test is unused"),
            ("unused\tgroup_buys.card.cta_join" in got, "a sibling of a used key is not saved by it"),
            ("unused\tgroup_buys.card.title" not in got, "a namespaced suffix call counts as used"),
            ("unused\tstatus.open" not in got and "unused\tstatus.closed" not in got,
             "a template-literal head keeps run-time keys alive"),
            ("duplicate\t2\tביטול" in got, "a value in two keys is a duplicate"),
            ("unused\tzz.only_here" in got, "a template head that is not a key boundary (`on${e}`) saves nothing"),
            ("unused\tsweep_tail.event_new.hint" not in got,
             "a leaf call under a dotted namespace counts (events/new/page.js:78)"),
            ("unused\tholidays.pesach.dashboard_hint" not in got,
             "a template TAIL keeps a key family alive (producer/dashboard/page.js:712)"),
            ("unused\twhats_new.releases.v1_5_8.i1" not in got,
             "a placeholder in the middle of a template counts (WhatsNewCard.jsx:27)"),
            ("unused\tdead.never_read" in got and "unused\tzz.only_here" in got,
             "a letter-free template (`${ns}.${key}`) saves nothing"),
        ]
        for i, (cond, name) in enumerate(checks, 1):
            print(f"  {'ok' if cond else 'FAIL'} {i}  {name}")
            ok += bool(cond)
        empty = Path(tmp) / "nothing"
        empty.mkdir()
        import contextlib
        import io
        with contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(io.StringIO()):
            rc = run(empty, Path("/dev/null"), "control")
        print(f"  {'ok' if rc else 'FAIL'} 11  parsed-0 control fails loudly")
        ok += bool(rc)
    print(f"self-test: {ok}/{total}")
    return 0 if ok == total else 1


def main(argv: list[str]) -> int:
    arg = argv[1] if len(argv) > 1 else ""
    if arg == "--self-test":
        return self_test()
    if arg == "--update-baseline":
        write_baseline(ROOT, BASELINE)
        print(f"baseline written: {BASELINE}")
        return 0
    if arg:
        print(f"unknown argument: {arg}", file=sys.stderr)
        return 2
    if self_test() != 0:
        print("::error::messages-hygiene: --self-test FAILED, so this run proves nothing.", file=sys.stderr)
        return 1
    return run(ROOT, BASELINE)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
