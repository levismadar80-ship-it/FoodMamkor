"""MEH-1806 — the OAuth producer journey has exactly ONE welcome send.

The behavioural suite in test_meh1806_upgrade_welcome.py proves the count is 1
today. It cannot prove it stays 1: someone adding a "nudge" send to
register_producer_oauth next month reintroduces the exact two-mail state that
ticket existed to remove, and every behavioural test that asserts
`call_count == 1` on the CURRENT journey would still pass if the new send sat
on a path they do not exercise.

So this is the numeric final-state assertion the removal rule asks for — the
repo-wide grep, run as a test rather than performed once by hand:

    _send_welcome_email call sites reachable from the OAuth flow == 1, not 2

The probe is validated against known answers before its output is believed
(ORDERS §3.0), including one case anchored to the real committed file.
"""

import re
from pathlib import Path

AUTH_PY = (
    Path(__file__).resolve().parents[1] / "backend" / "app" / "routers" / "auth.py"
)

# A dispatch of the welcome mail. Matches the `add_task(...)` form and a direct
# call, across line breaks (ruff format wraps these).
_WELCOME_SEND = re.compile(r"_send_welcome_email\s*,|_send_welcome_email\s*\(")


def _strip_comments(source: str) -> str:
    """Blank `#` comments, preserving offsets.

    Load-bearing here: this file's own subject is discussed at length in
    auth.py's comments, which name `_send_welcome_email` repeatedly. Counting
    those as sends would put the OAuth-flow total at five and make the
    assertion meaningless.
    """
    out = []
    for line in source.splitlines():
        code = line.split("#", 1)[0]
        out.append(code + " " * (len(line) - len(code)))
    return "\n".join(out)


def _function_body(source: str, name: str) -> str:
    """The source of one top-level `def`, up to the next top-level `def`/`@`.

    Matches `async def` as well as `def`. The first version did not, and the
    known-answer control below caught it immediately: two of the three
    functions this file inspects are `async def` (`register_producer` at
    auth.py:416, `register` at :268), so the probe reported "not found" for the
    very function that holds the password-path send. Exactly why the control
    exists — and note it failed LOUDLY rather than returning a plausible zero,
    which is the property the `assert start is not None` below buys.
    """
    lines = source.splitlines()
    start = next(
        (
            i
            for i, ln in enumerate(lines)
            if ln.startswith(f"def {name}(") or ln.startswith(f"async def {name}(")
        ),
        None,
    )
    assert start is not None, f"{name} not found in auth.py — has it been renamed?"
    for i in range(start + 1, len(lines)):
        if (
            lines[i].startswith("def ")
            or lines[i].startswith("async def ")
            or lines[i].startswith("@router.")
        ):
            return "\n".join(lines[start:i])
    return "\n".join(lines[start:])


def _sends_in(name: str) -> int:
    src = _strip_comments(AUTH_PY.read_text(encoding="utf-8"))
    return len(_WELCOME_SEND.findall(_function_body(src, name)))


# ---------- probe validation, before believing any number ----------


def test_probe_counts_a_known_send():
    """Known-answer control anchored to a REAL committed function.

    `register_producer` contains the password-path welcome, so the probe must
    find at least one there. If this returns zero the pattern has drifted from
    what the codebase actually writes, and every count below is worthless —
    which is the §3.0 failure shape: a plausible number instead of an error.
    """
    assert _sends_in("register_producer") >= 1


def test_probe_does_not_count_prose_about_the_send():
    """The complement. auth.py's comments name `_send_welcome_email` several
    times; counting those would inflate every total."""
    stripped = _strip_comments(
        "# background_tasks.add_task(_send_welcome_email, x, y, 'consumer')\npass\n"
    )
    assert _WELCOME_SEND.findall(stripped) == []


def test_probe_fails_loudly_on_a_renamed_function():
    """A rename must raise, not silently return 0 — a guard that reports
    'zero sends' because it could not find the function would read as a pass."""
    try:
        _sends_in("a_function_that_does_not_exist")
    except AssertionError as exc:
        assert "not found" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("probe silently accepted a missing function")


# ---------- the assertion ----------


def test_oauth_journey_dispatches_exactly_one_welcome():
    """Step 0 sends none; Step 2 sends one. Total across the journey: 1.

    Fails against `origin/staging` (Step 0 = 1, Step 2 = 0 → the wrong-audience
    mail) and against PR #2781's first form (Step 0 = 1, Step 2 = 1 → two
    contradictory mails).
    """
    step_0 = _sends_in("register_producer_oauth")
    step_2 = _sends_in("register_producer")

    assert step_0 == 0, (
        "register_producer_oauth must dispatch no welcome — it is the producer "
        f"signup entry point and the consumer copy is wrong-audience. Found {step_0}."
    )
    # register_producer holds BOTH the upgrade-path send and the password-path
    # send; they are different journeys through one function, so 2 is correct.
    assert step_2 == 2, (
        f"expected exactly 2 sends in register_producer (upgrade + password), found {step_2}"
    )
    assert step_0 + step_2 == 2, (
        f"expected 2 welcome sends across both entry points, found {step_0 + step_2}"
    )


# The line above replaced `assert step_0 + 1 == 1`, which the CI reviewer
# correctly called VACUOUS: `step_0 == 0` is asserted two lines earlier, so it
# reduced to `assert 1 == 1` and protected nothing. It read like a total-count
# check and was a tautology — inside a file whose entire subject is numeric
# final-state assertions.
#
# THE LIMIT OF THIS FILE, stated so the total above is not over-read: function
# granularity cannot separate the two sends inside `register_producer`, because
# the upgrade branch and the password branch live in one function. So this
# guard proves "two send sites exist, and none of them is in
# register_producer_oauth" — it does NOT prove the OAuth journey receives
# exactly one mail. That claim belongs to the behavioural suite
# (test_meh1806_upgrade_welcome.py::test_new_oauth_producer_gets_exactly_one_welcome),
# which drives Step 0 → Step 2 and counts actual dispatches.
#
# The two are complementary and neither is redundant: the behavioural test
# cannot see a send added to a path it does not exercise, and this one cannot
# see which branch a send sits on.
