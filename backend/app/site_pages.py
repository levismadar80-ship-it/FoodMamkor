"""
Module:   site_pages
Purpose:  The one list of site pages the AI assistants may point a visitor
          to — a path and the page's Hebrew name. The chat system prompt is
          built from it, and the chat widget turns exactly these paths (and no
          other text) into links.
Touches:  nothing — pure data.
Does NOT: own the link labels the visitor sees (frontend/messages
          `chat.pages.<key>`), or decide routing (Next.js does).
Related:  frontend/lib/site-pages.js (the widget's copy of the paths) ·
          app/routers/chat.py (`pages_prompt_section`) ·
          tests/test_site_pages_registry.py (fails when the two lists differ,
          when a path has no page in frontend/app, or when the prompt names a
          page instead of writing its path).
History:  20/11 — Sapir saw the assistant mention «מחירון» with no link.

WHY A REGISTRY. A model asked to "add links" invents URLs. Big support bots
(Intercom Fin, Zendesk AI) answer only from known content and cite it as a
link to a real article; the same idea here: the model writes a path only from
this list, and the widget links only paths on this list, so a made-up path
stays plain text and never becomes a broken link.
"""

from __future__ import annotations

from typing import Final

# (key, path, Hebrew name the prompt uses). The key names the label under
# `chat.pages.<key>` in frontend/messages. Order = the order in the prompt.
SITE_PAGES: Final[tuple[tuple[str, str, str], ...]] = (
    ("map", "/map", "המפה של בתי העסק"),
    ("events", "/events", "אירועים: שווקים, ימים פתוחים וסדנאות"),
    ("experiences", "/experiences", "חוויות: סדנאות, סיורים וטעימות"),
    ("group_buys", "/group-buys", "קבוצות רכישה"),
    ("favorites", "/favorites", "המועדפים שלי"),
    ("register", "/register", "הרשמה ללקוחות"),
    ("login", "/login", "התחברות"),
    ("join", "/join", "הצטרפות לבתי עסק"),
    ("register_business", "/register/producer", "טופס ההרשמה לבתי עסק"),
    ("pricing", "/join/pricing", "מחירון לבתי עסק"),
    ("dashboard", "/producer/dashboard", "לוח הבקרה של בית העסק"),
    ("recommend", "/recommend", "המלצה על בית עסק"),
    ("about", "/about", "אודות"),
    ("contact", "/contact", "יצירת קשר"),
    ("terms", "/terms", "תנאי השימוש"),
    ("privacy", "/privacy", "מדיניות הפרטיות"),
    ("accessibility", "/accessibility", "הצהרת נגישות"),
)

# MEH-3004: /rescue answers 404 while the pilot is off, so it joins the
# prompt's list only when the rescue paragraph does (chat._base_system_prompt).
RESCUE_PAGE: Final = ("rescue", "/rescue", "סלי הפתעה")

PATHS: Final = frozenset(path for _, path, _ in (*SITE_PAGES, RESCUE_PAGE))


def pages_prompt_section(*, include_rescue: bool = False) -> str:
    pages = (*SITE_PAGES, RESCUE_PAGE) if include_rescue else SITE_PAGES
    lines = "\n".join(f"{path} — {name}" for _, path, name in pages)
    return (
        "**עמודים באתר**\n"
        "כשאת מפנה לעמוד באתר, כתבי את הכתובת שלו בדיוק כמו ברשימה, למשל "
        "/join/pricing, והיא תופיע לגולשים כקישור עם שם העמוד. אל תכתבי גם "
        "את שם העמוד ליד הכתובת. אל תכתבי כתובת שאינה ברשימה, ואל תמציאי "
        "כתובות או קישורים לאתרים אחרים.\n"
        f"{lines}"
    )
