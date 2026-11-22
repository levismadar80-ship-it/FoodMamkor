#!/usr/bin/env python3
"""copy-length guard: copy in frontend/messages/he.json that is too long for its slot.

Purpose:  Three caps, by the kind of string the key names:
            button  — at most 3 words   (leaf cta/button/btn/submit, cta_*/btn_*/…, or *_cta/*_btn/…)
            seo title — at most 60 chars (meta_title/og_title/twitter_title/page_title, or
                      title/*_title under seo.* or a *meta block)
            seo description — at most 160 chars (same, with description)
          A ratchet: what is over the cap today is listed in
          copy-length-baseline.txt with its measured size. A NEW key over its cap,
          or a baselined key that got LONGER, is red. A baseline line whose key is
          gone or now fits is red too, so the baseline only shrinks.
Does NOT: judge wording, read en.json, or check rendered width (that is
          frontend/e2e/flows/43-site-sanity.spec.ts, at 375 and 320). The kind of a
          string is read from its key name only, so a button whose key says
          nothing (`save`, `next`) is not checked.
History:  MEH-3670 (creation, item 8 of MEH-3652).
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HE = ROOT / "frontend/messages/he.json"
BASELINE = Path(__file__).resolve().parent / "copy-length-baseline.txt"

BUTTON_LEAF = re.compile(
    r"^(cta|button|btn|submit)$|^(cta|button|btn|submit)_|_(cta|button|btn|submit)$"
)
NOT_BUTTON = re.compile(
    r"heading|pitch|title|body|hint|desc|label_long|subtitle|subtext|error|tooltip|aria"
    r"|toast|saving|loading|sending|copied|note|caption|sub$"
)
SEO_TITLE = re.compile(r"^(meta_?title|seo_title|og_title|twitter_title|page_title)$")
SEO_DESC = re.compile(
    r"^(meta_?description|seo_description|og_description|twitter_description)$"
)
# Inside an SEO block a plain `title` / `description` is the page's <title> / meta description.
SEO_BLOCK_TITLE = re.compile(r"^(title|\w+_title)$")
SEO_BLOCK_DESC = re.compile(r"^(description|\w+_description)$")


def in_seo_block(parts):
    return parts[0] == "seo" or any(
        p == "meta" or p.endswith("_meta") for p in parts[:-1]
    )


CAPS = {"button": 3, "seo-title": 60, "seo-description": 160}


def words(value):
    # «+ פרסום מתכון» is two words: a bare symbol is not one.
    return len([w for w in value.split() if re.search(r"[\w{]", w)])


def kind_of(key):
    parts = re.sub(r"\[\d+\]", "", key).split(".")
    leaf = parts[-1]
    seo = in_seo_block(parts)
    if SEO_TITLE.search(leaf) or (seo and SEO_BLOCK_TITLE.search(leaf)):
        return "seo-title"
    if SEO_DESC.search(leaf) or (seo and SEO_BLOCK_DESC.search(leaf)):
        return "seo-description"
    if BUTTON_LEAF.search(leaf) and not NOT_BUTTON.search(leaf):
        return "button"
    return None


def measure(kind, value):
    return words(value) if kind == "button" else len(value)


def flatten(obj, prefix=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from flatten(v, f"{prefix}.{k}" if prefix else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from flatten(v, f"{prefix}[{i}]")
    elif isinstance(obj, str):
        yield prefix, obj


def over_cap(messages):
    out = {}
    for key, value in flatten(messages):
        kind = kind_of(key)
        if kind and measure(kind, value) > CAPS[kind]:
            out[key] = (kind, measure(kind, value), value)
    return out


class BaselineError(Exception):
    pass


def read_baseline(path):
    if not path.exists():
        raise BaselineError(
            f"{path.relative_to(ROOT)} is missing — run --update-baseline"
        )
    base = {}
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.startswith("#"):
            continue
        cols = line.split("\t")
        if len(cols) != 3 or not cols[1].isdigit() or cols[2] not in CAPS:
            raise BaselineError(
                f"{path.relative_to(ROOT)}:{n}: expected key<TAB>size<TAB>kind, got «{line}»"
            )
        base[cols[0]] = (int(cols[1]), cols[2])
    return base


KEY_LINE = re.compile(r'\s*"((?:[^"\\]|\\.)*)"\s*:\s*(.*)')


def line_of(text_lines, key):
    # Walks the pretty-printed file keeping the path of open objects, so a leaf
    # name used in 40 places resolves to the one under the right parents.
    stack = []
    for i, line in enumerate(text_lines, 1):
        m = KEY_LINE.match(line)
        if m:
            k, rest = m.group(1), m.group(2).strip()
            path = ".".join(stack + [k])
            if path == key:
                return i
            if rest.startswith("{") and not rest.startswith("{}"):
                stack.append(k)
        elif line.strip().startswith("}") and stack:
            stack.pop()
    return 1


def check(messages, base, he_lines):
    errors = []
    found = over_cap(messages)
    for key, (kind, size, value) in sorted(found.items()):
        unit = "words" if kind == "button" else "chars"
        where = f"frontend/messages/he.json:{line_of(he_lines, key)}"
        if key not in base or base[key][1] != kind:
            errors.append(
                f"{where}: {key} is a {kind}, {size} {unit} (cap {CAPS[kind]}): «{value}»"
            )
        elif size > base[key][0]:
            errors.append(
                f"{where}: {key} grew from {base[key][0]} to {size} {unit} (cap {CAPS[kind]}): «{value}»"
            )
    for key in sorted(set(base) - set(found)):
        errors.append(
            f"scripts/checks/copy-length-baseline.txt: {key} now fits its cap or is gone — delete its line"
        )
    return found, errors


def write_baseline(found):
    lines = [
        "# copy-length guard baseline (MEH-3670). Only shrinks. key<TAB>size<TAB>kind"
    ]
    lines += [f"{k}\t{s}\t{kind}" for k, (kind, s, _) in sorted(found.items())]
    BASELINE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def self_test():
    real = json.loads(HE.read_text(encoding="utf-8"))
    anchor = "map.filter.day_bridge_cta"  # a real button label, 7 words: must be seen as over cap
    cases = [
        ("button at cap passes", {"a": {"cta": "שלוש מילים כאן"}}, {}, 0),
        ("button over cap fails", {"a": {"cta": "ארבע מילים בדיוק כאן"}}, {}, 1),
        ("a + is not a word", {"a": {"btn": "+ פרסום מתכון חדש"}}, {}, 0),
        (
            "placeholder counts as a word",
            {"a": {"submit": "אישור כל הטיוטות {count}"}},
            {},
            1,
        ),
        (
            "heading-ish key is not a button",
            {"a": {"cta_heading": "כותרת ארוכה מאוד של ארבע מילים"}},
            {},
            0,
        ),
        ("seo title 60 passes", {"a": {"meta_title": "א" * 60}}, {}, 0),
        ("seo title 61 fails", {"a": {"meta_title": "א" * 61}}, {}, 1),
        ("seo description 161 fails", {"a": {"og_description": "א" * 161}}, {}, 1),
        (
            "baselined, same size passes",
            {"a": {"cta": "ארבע מילים בדיוק כאן"}},
            {"a.cta": (4, "button")},
            0,
        ),
        (
            "baselined, grew fails",
            {"a": {"cta": "חמש מילים בדיוק כאן עכשיו"}},
            {"a.cta": (4, "button")},
            1,
        ),
        (
            "stale baseline line fails",
            {"a": {"cta": "קצר"}},
            {"a.cta": (4, "button")},
            1,
        ),
        ("real key is classified as a button", None, None, None),
        (
            "prefix key cta_map is a button",
            {"a": {"cta_map": "לכל העסקים על המפה"}},
            {},
            1,
        ),
        ("seo block title 61 fails", {"seo": {"x": {"title": "א" * 61}}}, {}, 1),
        (
            "meta block description 161 fails",
            {"p": {"meta": {"description": "א" * 161}}},
            {},
            1,
        ),
        ("title outside an seo block is not seo", {"p": {"title": "א" * 61}}, {}, 0),
        (
            "button inside a list is seen",
            {"a": {"items": [{"cta": "ארבע מילים בדיוק כאן"}]}},
            {},
            1,
        ),
        (
            "baselined key that changed kind fails",
            {"seo": {"x": {"title": "א" * 61}}},
            {"seo.x.title": (61, "button")},
            1,
        ),
        ("real seo.events.title is an seo title", "SEO", None, None),
        ("line_of resolves the right parent", "LINE", None, None),
        (
            "error message is not a button",
            {"a": {"error_submit": "לא הצלחנו לשלוח, נסו שוב בעוד רגע"}},
            {},
            0,
        ),
    ]
    ok = 0
    for name, msgs, base, want in cases:
        if msgs == "SEO":
            passed = kind_of(
                "seo.events.title"
            ) == "seo-title" and "seo.events.title" in dict(flatten(real))
        elif msgs == "LINE":
            lines = [
                "{",
                '  "a": {',
                '    "cta": "x"',
                "  },",
                '  "b": {',
                '    "cta": "y"',
                "  }",
                "}",
            ]
            passed = line_of(lines, "b.cta") == 6 and line_of(lines, "a.cta") == 3
        elif msgs is None:
            got_kind = kind_of(anchor)
            value = dict(flatten(real)).get(anchor)
            passed = (
                got_kind == "button"
                and value is not None
                and measure("button", value) > CAPS["button"]
            )
        else:
            _, errs = check(msgs, base, [])
            passed = len(errs) == want
        print(("PASS " if passed else "FAIL ") + name)
        ok += passed
    print(f"self-test: {ok}/{len(cases)}")
    return 0 if ok == len(cases) else 1


def main(argv):
    if "--self-test" in argv:
        return self_test()
    messages = json.loads(HE.read_text(encoding="utf-8"))
    if "--update-baseline" in argv:
        found = over_cap(messages)
        write_baseline(found)
        print(f"copy-length: baseline written, {len(found)} lines")
        return 0
    if self_test() != 0:
        print("copy-length: self-test failed — this run proves nothing")
        return 1
    try:
        base = read_baseline(BASELINE)
    except BaselineError as e:
        print(f"copy-length: {e}")
        return 1
    found, errors = check(messages, base, HE.read_text(encoding="utf-8").splitlines())
    for e in errors:
        print(e)
    print(
        f"copy-length: {len(found)} over cap · baseline {len(base)} lines · {len(errors)} errors"
    )
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
