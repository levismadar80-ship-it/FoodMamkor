"""
Module:   api_docs_routes
Purpose:  every API path in backend/openapi.json is named in docs/DATA.md, the
          endpoint reference — or is listed in api-docs-baseline.txt, which
          only shrinks (workflow rule 12 had no enforcement; MEH-3192).
Touches:  reads backend/openapi.json, docs/DATA.md, the baseline. Writes the
          baseline only with --update-baseline.
Does NOT: check methods, request/response shapes or prose quality — only that
          the path is named somewhere in the doc. openapi.json itself is kept
          fresh by openapi-codegen-drift-guard.sh.
History:  MEH-3192 (creation).
"""
import json
import os
import re
import sys

ROOT = os.environ.get("API_DOCS_ROOT", os.getcwd())
SPEC = os.environ.get("API_DOCS_SPEC", os.path.join(ROOT, "backend/openapi.json"))
DOC = os.environ.get("API_DOCS_DOC", os.path.join(ROOT, "docs/DATA.md"))
BASE = os.environ.get("API_DOCS_BASELINE", os.path.join(ROOT, "scripts/checks/api-docs-baseline.txt"))
METHODS = {"get", "post", "put", "patch", "delete"}


def norm(path):
    """/producers/{producer_id}/ → /producers/{}  (param names differ between doc and code)."""
    p = re.sub(r"\{[^}]*\}", "{}", path.strip())
    if p.startswith("/api/"):
        p = p[4:]
    return p.rstrip("/") or "/"


def spec_paths(text):
    spec = json.loads(text)
    return {norm(p) for p, ops in spec.get("paths", {}).items() if METHODS & set(ops)}


def doc_paths(text):
    return {norm(m) for m in re.findall(r"/[A-Za-z0-9_\-{}/.:]*", text)}


def baseline(text):
    return [l.strip() for l in text.splitlines() if l.strip() and not l.startswith("#")]


def check(spec_text, doc_text, base_text):
    """Return (missing, stale): missing = in spec, not in doc, not baselined;
    stale = baselined but now documented or gone from the spec."""
    want, have = spec_paths(spec_text), doc_paths(doc_text)
    base = set(baseline(base_text))
    undocumented = want - have
    return sorted(undocumented - base), sorted(base - undocumented)


def self_test():
    spec = json.dumps({"paths": {"/a": {"get": {}}, "/b/{id}": {"post": {}}, "/c": {"get": {}}, "/x": {"parameters": []}}})
    cases = [
        ("documented with another param name", "`GET /a` `POST /b/{producer_id}` /c", "", ([], [])),
        ("/api prefix in the doc counts", "/api/a /api/b/{x} /api/c", "", ([], [])),
        ("new path missing from doc", "/a /b/{id}", "", (["/c"], [])),
        ("baselined gap passes", "/a /b/{id}", "/c\n", ([], [])),
        ("baseline line now documented is stale", "/a /b/{id} /c", "/c\n", ([], ["/c"])),
        ("baseline line for a removed path is stale", "/a /b/{id} /c", "/gone\n", ([], ["/gone"])),
        ("a path with no operations is not required", "/a /b/{} /c", "", ([], [])),
        ("prefix of a path is not a match", "/a /b /c", "", (["/b/{}"], [])),
    ]
    bad = 0
    for name, doc, base, want in cases:
        got = check(spec, doc, base)
        ok = (list(got[0]), list(got[1])) == (want[0], want[1])
        bad += not ok
        print(f"  {'ok ' if ok else 'BAD'} {name}: {got}")
    # anchored to the real files: the spec parses and yields many paths
    real = spec_paths(open(SPEC, encoding="utf-8").read())
    ok = len(real) >= 100
    bad += not ok
    print(f"  {'ok ' if ok else 'BAD'} real backend/openapi.json yields {len(real)} paths (>= 100)")
    return bad


def main(argv):
    if "--self-test" in argv:
        bad = self_test()
        print("api-docs-route-guard self-test:", "FAIL" if bad else "PASS")
        return 1 if bad else 0
    spec_text = open(SPEC, encoding="utf-8").read()
    doc_text = open(DOC, encoding="utf-8").read()
    base_text = open(BASE, encoding="utf-8").read() if os.path.exists(BASE) else ""
    if len(spec_paths(spec_text)) == 0:
        print(f"{os.path.relpath(SPEC, ROOT)}:1: no paths parsed — the guard would check nothing")
        return 1
    if "--update-baseline" in argv:
        undocumented = sorted(spec_paths(spec_text) - doc_paths(doc_text))
        header = [l for l in base_text.splitlines() if l.startswith("#")]
        with open(BASE, "w", encoding="utf-8") as f:
            f.write("\n".join(header + undocumented) + "\n")
        print(f"baseline written: {len(undocumented)} paths")
        return 0
    missing, stale = check(spec_text, doc_text, base_text)
    for p in missing:
        print(f"docs/DATA.md:1: API path {p} is in backend/openapi.json but not in DATA.md — add it to the endpoint reference")
    for p in stale:
        print(f"scripts/checks/api-docs-baseline.txt:1: {p} is now documented (or removed) — delete this baseline line")
    return 1 if missing or stale else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
