#!/usr/bin/env python3
"""
check-icu-parity.py — ICU plural parity validator for next-intl messages.

R-2 mitigation per docs/i18n-migration-plan.md §7: catches HE/EN plural
form drift before merge. Hebrew has 4 plural categories
(zero/one/two/other in product copy); LLM translation batches frequently
drop the `two` branch silently.

Usage (from repo root):
  python .claude/scripts/check-icu-parity.py                    # real check
  python .claude/scripts/check-icu-parity.py --self-test        # fixture run
  python .claude/scripts/check-icu-parity.py --he <path> --en <path>

Rules:
  HE plural keys must contain: one, two, other  (zero/=0/few/many optional)
  EN plural keys must contain: one, other       (zero/=0/few/many optional)
  Parity: for each shared key, both sides plural OR both sides flat.
          Mismatch (HE plural / EN flat or vice versa) → fail.

Exit codes:
  0  — all checks pass
  1  — any parity/missing-branch failure; or --self-test ran clean (it shouldn't)
  2  — file IO / JSON parse error

History: MEH-473 Wave 3 (creation).
"""

import argparse
import json
import os
import re
import sys

HE_REQUIRED = {"one", "two", "other"}
EN_REQUIRED = {"one", "other"}

# Selector token: =0/=1/etc OR identifier (zero/one/two/few/many/other).
_SELECTOR_RE = re.compile(r"(=\d+|[A-Za-z_][A-Za-z0-9_]*)")
# Plural-pattern preamble: `{<var>, plural[, offset:N],`.
_PLURAL_PREAMBLE_RE = re.compile(
    r"\{\s*\w+\s*,\s*plural\s*(?:,\s*offset:\d+)?\s*,"
)

_FIXTURE_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "test", "i18n-icu-fixtures"
)
_REPO_HE = os.path.join("frontend", "messages", "he.json")
_REPO_EN = os.path.join("frontend", "messages", "en.json")


def parse_plural_selectors(value: str) -> list[str] | None:
    """Extract selector tokens from an ICU plural string.

    Returns list of selectors if a plural pattern is detected at the top
    level of `value`; None otherwise. Handles nested braces and ICU
    single-quote escape pairs ('...'). Skips malformed tail rather than
    raising — malformed strings won't pass the plural-detection guard at
    the next-intl runtime layer anyway.
    """
    m = _PLURAL_PREAMBLE_RE.search(value)
    if not m:
        return None

    pos = m.end()
    selectors: list[str] = []

    while pos < len(value):
        # Skip whitespace between branches.
        while pos < len(value) and value[pos].isspace():
            pos += 1
        if pos >= len(value) or value[pos] == "}":
            break  # End of plural block.

        # Read selector token.
        sm = _SELECTOR_RE.match(value, pos)
        if not sm:
            break
        selectors.append(sm.group(0))
        pos = sm.end()

        # Expect optional whitespace, then '{'.
        while pos < len(value) and value[pos].isspace():
            pos += 1
        if pos >= len(value) or value[pos] != "{":
            break  # Malformed; stop quietly.

        # Balanced-brace skip over the branch body.
        depth = 1
        pos += 1
        while pos < len(value) and depth > 0:
            ch = value[pos]
            if ch == "'":
                # ICU quote: skip until matching closing quote.
                pos += 1
                while pos < len(value) and value[pos] != "'":
                    pos += 1
                if pos < len(value):
                    pos += 1  # Consume closing quote.
            elif ch == "{":
                depth += 1
                pos += 1
            elif ch == "}":
                depth -= 1
                pos += 1
            else:
                pos += 1

    return selectors if selectors else None


def flatten(obj: dict, prefix: str = "") -> list[tuple[str, str]]:
    """Flatten a nested messages dict to (dotted-path, leaf-string) pairs."""
    out: list[tuple[str, str]] = []
    for key, val in obj.items():
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(val, dict):
            out.extend(flatten(val, path))
        elif isinstance(val, str):
            out.append((path, val))
    return out


def validate_pair(he_path: str, en_path: str) -> list[str]:
    """Validate HE/EN messages files. Return list of failure strings."""
    try:
        with open(he_path, encoding="utf-8") as fh:
            he_data = json.load(fh)
        with open(en_path, encoding="utf-8") as fh:
            en_data = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(2)

    he_flat = dict(flatten(he_data))
    en_flat = dict(flatten(en_data))
    failures: list[str] = []

    for key in sorted(set(he_flat) | set(en_flat)):
        he_val = he_flat.get(key)
        en_val = en_flat.get(key)
        if he_val is None or en_val is None:
            # Missing-key case is caught by next-intl plugin; skip here.
            continue

        he_sel = parse_plural_selectors(he_val)
        en_sel = parse_plural_selectors(en_val)

        # Parity check.
        if (he_sel is None) != (en_sel is None):
            side = "HE" if he_sel else "EN"
            other = "EN" if he_sel else "HE"
            failures.append(
                f"[PARITY] {key}: {side} has plural pattern but {other} is flat"
            )
            continue

        if he_sel is None:
            continue  # Both flat — fine.

        he_set = set(he_sel)
        en_set = set(en_sel)
        missing_he = HE_REQUIRED - he_set
        if missing_he:
            failures.append(
                f"[HE-MISSING] {key}: missing required branches "
                f"{sorted(missing_he)}"
            )
        missing_en = EN_REQUIRED - en_set
        if missing_en:
            failures.append(
                f"[EN-MISSING] {key}: missing required branches "
                f"{sorted(missing_en)}"
            )

    return failures


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate ICU plural parity between HE/EN message files."
    )
    parser.add_argument(
        "--he", default=_REPO_HE, metavar="PATH",
        help=f"Path to HE messages JSON (default: {_REPO_HE}).",
    )
    parser.add_argument(
        "--en", default=_REPO_EN, metavar="PATH",
        help=f"Path to EN messages JSON (default: {_REPO_EN}).",
    )
    parser.add_argument(
        "--self-test", action="store_true",
        help="Run against fixture pair under .claude/scripts/test/"
             "i18n-icu-fixtures/; bad-plural fixtures intentionally fail "
             "(exit 1).",
    )
    args = parser.parse_args()

    if args.self_test:
        he = os.path.join(_FIXTURE_DIR, "bad-plural-he.json")
        en = os.path.join(_FIXTURE_DIR, "bad-plural-en.json")
        print(f"Self-test: scanning {he} + {en}")
    else:
        he = args.he
        en = args.en

    failures = validate_pair(he, en)
    if failures:
        for f in failures:
            print(f)
        print(f"\n{len(failures)} failure(s).")
        return 1

    print("OK: HE/EN plural parity clean.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
