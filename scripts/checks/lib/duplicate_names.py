"""
Module:   duplicate_names
Purpose:  Fail when a module-level function name is defined in more files
          than it was in the baseline, so a second copy of a helper cannot
          land without someone deciding it should (MEH-3715).
Touches:  nothing; reads source files, prints.
Does NOT: compare bodies. Two functions with different names and the same
          body pass (clone-ratchet looks at bodies). Names that a framework
          requires per file (generateMetadata, default, ...) are ignored.
Related:  scripts/checks/duplicate-name-guard.sh (entry),
          scripts/checks/duplicate-name-baseline.txt (today's set, shrinks).
History:  MEH-3715 (creation).
"""

import re
import subprocess
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

BASELINE = Path("scripts/checks/duplicate-name-baseline.txt")
JS_ROOTS = ("frontend/app/", "frontend/components/", "frontend/lib/")
PY_ROOTS = ("backend/app/",)
JS_EXT = (".js", ".jsx", ".mjs", ".ts", ".tsx")
SKIP = ("frontend/lib/generated/", "__tests__/", ".test.", ".spec.")
# Names Next.js / React / FastAPI expect in each file of their own.
FRAMEWORK = {
    "generateMetadata", "generateStaticParams", "generateViewport", "default",
    "Page", "Layout", "Loading", "NotFound", "Error", "GlobalError",
    "Template", "Head", "Default", "sitemap", "robots", "manifest",
    "GET", "POST", "PUT", "PATCH", "DELETE", "middleware", "upgrade",
    "downgrade", "main", "Icon", "Image", "OpengraphImage",
}
JS_DEF = re.compile(
    r"^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)"
    r"|^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?"
    r"(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)",
    re.M,
)
PY_DEF = re.compile(r"^(?:async\s+)?def\s+([A-Za-z_]\w*)", re.M)


def _tracked() -> list[str]:
    out = subprocess.run(["git", "ls-files"], capture_output=True, text=True, check=True)
    return out.stdout.split("\n")


def names_in(path: str, text: str) -> set[str]:
    if path.endswith(".py"):
        found = set(PY_DEF.findall(text))
    else:
        found = {a or b for a, b in JS_DEF.findall(text)}
    return {n for n in found if n not in FRAMEWORK and not n.startswith("test_")}


def scan(paths: list[str], read=lambda p: Path(p).read_text(encoding="utf-8")) -> dict[str, int]:
    where: dict[str, set[str]] = defaultdict(set)
    for p in paths:
        js = p.startswith(JS_ROOTS) and p.endswith(JS_EXT)
        py = p.startswith(PY_ROOTS) and p.endswith(".py")
        if not (js or py) or any(s in p for s in SKIP) or not Path(p).exists():
            continue
        lang = "py" if py else "js"
        for n in names_in(p, read(p)):
            where[f"{lang}:{n}"].add(p)
    return {k: len(v) for k, v in where.items() if len(v) > 1}


def load(path: Path) -> dict[str, int]:
    out: dict[str, int] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip() and not line.startswith("#"):
            name, count = line.split()
            out[name] = int(count)
    return out


def compare(now: dict[str, int], base: dict[str, int]) -> list[str]:
    return [
        f"{k} is now defined in {v} files (baseline {base.get(k, 1)})"
        for k, v in sorted(now.items())
        if v > base.get(k, 1)
    ]


def write(path: Path, now: dict[str, int]) -> None:
    head = (
        "# MEH-3715: module-level function names defined in 2+ files today.\n"
        "# Only shrinks: lower or delete a line when you fold a copy into one\n"
        "# helper. Regenerate: bash scripts/checks/duplicate-name-guard.sh --update-baseline\n"
    )
    path.write_text(head + "".join(f"{k} {v}\n" for k, v in sorted(now.items())), encoding="utf-8")


def self_test() -> int:
    ok = True
    # Anchored to a real file: lib/money.js must yield its helpers.
    real = names_in("frontend/lib/money.js", Path("frontend/lib/money.js").read_text(encoding="utf-8"))
    ok &= {"agorotToShekels", "formatAgorot", "shekelsToAgorot"} <= real
    ok &= "toMinutes" in names_in("a.js", "function toMinutes(t) {}\n")
    ok &= "hhmm" in names_in("a.js", "export const hhmm = (d) => d;\n")
    ok &= "x" in names_in("a.js", "const x = async v => v;\n")
    ok &= "Card" in names_in("a.js", "export default function Card() {}\n")
    ok &= "f" in names_in("a.js", "const f = ({ a, b }) => a;\n")
    ok &= "AGOROT" not in names_in("a.js", "const AGOROT = 100;\n")
    ok &= "generateMetadata" not in names_in("a.js", "export async function generateMetadata() {}\n")
    ok &= "shekels_text" in names_in("a.py", "def shekels_text(a):\n    pass\n")
    ok &= "inner" not in names_in("a.py", "def f():\n    def inner():\n        pass\n")
    ok &= compare({"js:a": 2}, {}) != []          # a new duplicate fails
    ok &= compare({"js:a": 3}, {"js:a": 2}) != []  # a third copy fails
    ok &= compare({"js:a": 2}, {"js:a": 2}) == []  # today's set passes
    ok &= compare({}, {"js:a": 2}) == []           # folding one passes
    with tempfile.TemporaryDirectory() as d:
        b = Path(d) / "b.txt"
        write(b, {"js:a": 2})
        ok &= load(b) == {"js:a": 2}
    print("duplicate_names self-test:", "ok" if ok else "FAILED")
    return 0 if ok else 1


def main(argv: list[str]) -> int:
    if "--self-test" in argv:
        return self_test()
    now = scan(_tracked())
    if "--update-baseline" in argv:
        base = load(BASELINE) if BASELINE.exists() else {}
        grow = compare(now, base) if base else []
        if grow and "--allow-growth" not in argv:
            print("refusing to raise the baseline:\n  " + "\n  ".join(grow))
            return 1
        write(BASELINE, now)
        print(f"wrote {BASELINE} ({len(now)} names)")
        return 0
    if not now:
        print("duplicate_names: scanned nothing — every result is void")
        return 1
    bad = compare(now, load(BASELINE))
    for line in bad:
        print(f"VIOLATION {line}. Import the existing helper, or rename if it means something else.")
    print(f"duplicate-name-guard: {len(now)} duplicated names, {len(bad)} new")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
