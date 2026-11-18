"""
Module:   whatsapp_template_lint
Purpose:  Check a WhatsApp template body against Meta's automatic rejection
          rules BEFORE it is submitted, so a rejection costs a test run and
          not a round trip through Business Manager.
Touches:  nothing (pure text).
Does NOT: know the approved bodies (whatsapp_template_bodies.META_BODIES) or
          send anything (services/whatsapp.py).
Related:  tests/test_whatsapp_template_lint.py (rules anchored on Meta's real
          verdicts of 18/11/2026).
History:  MEH-3296 — Meta blocked product_order_new_v1 and
          product_order_confirmed_v1 before submit on 18/11 («too many
          variables for its length», error 2388293).

Rules (Meta publishes no thresholds; these are the industry's, and the two
ratio rules reproduce Meta's 18/11 verdicts exactly — 2 blocked, 4 passed):
  1. Variables are {{1}}..{{n}}, each once, in order (Twilio, Maqsam).
  2. No variable at the very start or end; punctuation does not count as
     separation (Meta error 2388299).
  3. No two variables with only spaces or punctuation between them.
  4. Ratio (Meta error 2388293): total words >= 3n + 1 (Syniverse, Spur,
     Chakra) AND words with no variable >= 2n + 1 (Twilio).

Usage before submitting a new template:
  python -m app.services.whatsapp_template_lint < body.txt
"""

from __future__ import annotations

import re
import sys

VAR = re.compile(r"\{\{(\d+)\}\}")
# Anything that is not a letter or digit: spaces, punctuation, ₪, dashes.
_NO_WORD = re.compile(r"^[\W_]*$")


def _ratio_problems(body: str, n: int) -> list[str]:
    tokens = body.split()
    static = [t for t in tokens if not VAR.search(t) and not _NO_WORD.match(t)]
    problems = []
    if len(tokens) < 3 * n + 1:
        problems.append(
            f"too many variables for its length: {len(tokens)} words, "
            f"{n} variables need at least {3 * n + 1}"
        )
    if len(static) < 2 * n + 1:
        problems.append(
            f"too few words without a variable: {len(static)}, "
            f"{n} variables need at least {2 * n + 1}"
        )
    return problems


def lint(body: str) -> list[str]:
    """Every rule the body breaks, in words; [] when it should pass."""
    numbers = [int(m) for m in VAR.findall(body)]
    n = len(numbers)
    if n == 0:
        return []
    problems = []
    if numbers != list(range(1, n + 1)):
        problems.append(f"variables must be {{{{1}}}}..{{{{{n}}}}} once each, in order")
    parts = VAR.split(body)
    texts = parts[0::2]  # the text before, between and after the variables
    if _NO_WORD.match(texts[0]):
        problems.append("starts with a variable")
    if _NO_WORD.match(texts[-1]):
        problems.append("ends with a variable")
    if any(_NO_WORD.match(t) for t in texts[1:-1]):
        problems.append("two variables with no word between them")
    return problems + _ratio_problems(body, n)


def main() -> int:
    problems = lint(sys.stdin.read())
    for p in problems:
        print(f"FAIL: {p}")
    if not problems:
        print("OK")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
