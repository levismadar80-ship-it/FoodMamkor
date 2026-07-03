"""MEH-1003: the chat knowledge base must not promise a premium/upgrade tier.

The pricing model is undecided (MEH-617); chat.py:91 previously promised
"לשדרג לתוכנית פרמיום בהמשך". This guard fails CI if any future edit to
SYSTEM_PROMPT re-introduces a premium/upgrade promise. The no-fees framing
("אין עמלות") is a BRAND.md LOCK and is asserted present.
"""

from app.routers import chat


def test_system_prompt_has_no_premium_tier_promise():
    for token in ("פרמיום", "פרימיום", "לשדרג", "שדרוג"):
        assert token not in chat.SYSTEM_PROMPT, (
            f"premium-promise token {token!r} re-introduced into chat SYSTEM_PROMPT "
            "(MEH-1003 regression — pricing model undecided, see MEH-617)"
        )


def test_system_prompt_keeps_no_fees_lock():
    assert "אין עמלות על עסקאות" in chat.SYSTEM_PROMPT
