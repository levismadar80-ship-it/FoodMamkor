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


def test_system_prompt_does_not_name_raw_milk():
    # MEH-2373: the site lists licensed businesses only; raw milk is not a
    # product a licensed Israeli business may sell, so the chat must not
    # offer it as an example. Approved wording (Sapir, 26/10): «גבינות».
    assert "חלב גולמי" not in chat.SYSTEM_PROMPT
    assert "בשר במרעה, לחם מחמצת, גבינות, ירקות אורגניים ועוד" in chat.SYSTEM_PROMPT


def test_system_prompt_instruction_is_feminine():
    # MEH-2373: the prompt addresses the assistant in the feminine throughout.
    assert "ענה בעברית" not in chat.SYSTEM_PROMPT
    assert "עני בעברית יומיומית" in chat.SYSTEM_PROMPT
