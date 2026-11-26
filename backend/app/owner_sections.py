# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (owner assistant PR)
"""
Module:   owner_sections
Purpose:  The one list of owner-dashboard screens the owner assistant knows:
          each screen's path, name and what is on it, and the edit-page cards
          it may send the owner to (`/producer/dashboard/edit#<anchor>`).
Touches:  nothing — pure data.
Does NOT: hold the link labels the owner sees (frontend/messages
          `owner_assistant.pages.<key>` / `.anchors.<anchor>`), or decide
          which screen a sub-page belongs to (frontend/lib/business-features.js
          DASHBOARD_SUBPAGES; the widget sends the parent's path).
Related:  frontend/lib/owner-pages.js (the widget's copy of the paths) ·
          frontend/lib/dashboard-edit-anchors.js (the real card anchors) ·
          app/services/owner_assistant.py (builds the prompt from this) ·
          tests/test_owner_assistant.py (fails when a dashboard page is in
          neither list, or the two lists differ).
History:  owner assistant (26/11, Sapir: «AI שעוזר להירשם בכל השלבים»).

WHY A REGISTRY. «The assistant knows every dashboard screen» is held by a test:
a new page under /producer/dashboard lands here or in NOT_A_SECTION with the
reason, so nobody has to remember to tell the assistant about it.
"""

from __future__ import annotations

from typing import Final

_D = "/producer/dashboard"

# (key, path, Hebrew name, what the owner does there). Order = prompt order.
SECTIONS: Final[tuple[tuple[str, str, str, str], ...]] = (
    (
        "overview",
        _D,
        "סקירה",
        "המסך הראשי. רשימת הצעדים שנשארו עד ששולחים את העסק לבדיקה, אימות "
        "מספר הוואטסאפ בקוד ואימות המייל, הכפתור «שליחה לבדיקה», מצב הזמינות "
        "היום, ואחרי האישור גם מספרי הצפיות והפניות.",
    ),
    (
        "edit",
        f"{_D}/edit",
        "עריכת העמוד",
        "כל מה שמופיע בעמוד של העסק: תמונות ולוגו, תיאור העסק, קטגוריות, "
        "מיקומים ונקודות איסוף, מוצרים עם מחירים, שעות פתיחה ושעות להזמנות, "
        "משלוחים, דרכי יצירת קשר, תגים (טבעוני, ללא גלוטן, מילואימניקים), "
        "רישיון עסק, כשרות, «מאחורי העסק» ושאלות נפוצות. כשהעמוד עוד ריק יש "
        "בראשו «ספרו לנו על העסק» שממלא שדות מטקסט, וקריאת תפריט מתמונה "
        "שמוסיפה מוצרים.",
    ),
    (
        "insights",
        f"{_D}/insights",
        "תובנות",
        "כמה אנשים ראו את העמוד, לחצו על יצירת קשר, ועוקבים אחרי העסק.",
    ),
    (
        "tools",
        f"{_D}/tools",
        "כלים",
        "כל הכלים במקום אחד: אירועים, חוויות, קבוצות רכישה, מתכונים, ביקורות, "
        "הטבה, שיתוף העמוד וקוד QR.",
    ),
    (
        "orders",
        f"{_D}/orders",
        "הזמנות",
        "הזמנות שלקוחות שלחו דרך האתר, והגדרות ההזמנה: אילו מוצרים, מועדים "
        "ואיסוף או משלוח.",
    ),
    ("events", f"{_D}/events", "אירועים", "יום פתוח, דוכן בשוק או אירוע חד-פעמי."),
    (
        "experiences",
        f"{_D}/experiences",
        "חוויות",
        "סדנאות, סיורים וטעימות עם תאריך, מחיר ומספר מקומות.",
    ),
    (
        "group_buys",
        f"{_D}/group-buys",
        "קבוצות רכישה",
        "הזמנה משותפת במחיר קבוצתי. אפשר לפתוח רק אחרי שהעסק אושר.",
    ),
    ("recipes", f"{_D}/recipes", "מתכונים", "מתכונים עם המוצרים של העסק."),
    (
        "rescue",
        f"{_D}/rescue",
        "סלי הפתעה",
        "סל של מה שנשאר היום במחיר מוזל, עם שעות איסוף.",
    ),
    ("reviews", f"{_D}/reviews", "ביקורות", "ביקורות של לקוחות ותגובה עליהן."),
    (
        "google_profile",
        f"{_D}/google-profile",
        "פרופיל בגוגל",
        "חיבור לפרופיל העסק בגוגל ומשיכת הדירוג משם.",
    ),
    ("share", f"{_D}/share", "שיתוף העמוד", "קישור לשיתוף, קוד QR ושלט להדפסה."),
    (
        "offer",
        f"{_D}/offer",
        "הטבה",
        "הטבה ללקוחות, למשל בהזמנה הראשונה, עם תאריך סיום.",
    ),
    ("followers", f"{_D}/followers", "עוקבים", "מי עוקב אחרי העסק ומקבל עדכונים."),
    ("whats_new", f"{_D}/whats-new", "מה חדש", "כלים חדשים שנוספו ללוח הבקרה."),
)

# The screen that exists only while the rescue pilot is on (MEH-3004): the
# prompt lists it only then, like the site chat.
RESCUE_KEY: Final = "rescue"

# Sub-pages that are a step inside a screen above (the widget sends the
# parent, frontend/lib/business-features.js DASHBOARD_SUBPAGES).
NOT_A_SECTION: Final[dict[str, str]] = {
    f"{_D}/events/new": "a form inside «אירועים»",
    f"{_D}/experiences/new": "a form inside «חוויות»",
    f"{_D}/orders/preview": "a preview inside «הזמנות»",
    f"{_D}/preview": "the owner's own page preview, reached from the tabs",
    f"{_D}/qr-card": "a print view inside «שיתוף העמוד»",
    f"{_D}/rescue/counter-card": "a print view inside «סלי הפתעה»",
    f"{_D}/rescue/schedule": "a form inside «סלי הפתעה»",
}

# Edit-page cards the assistant may link to: (anchor, Hebrew name). Every
# anchor must be a key of ANCHOR_TO_KEY in frontend/lib/dashboard-edit-anchors.js.
EDIT_ANCHORS: Final[tuple[tuple[str, str], ...]] = (
    ("images", "תמונות"),
    ("bio", "תיאור העסק"),
    ("categories", "קטגוריות"),
    ("locations", "מיקומים"),
    ("products", "מוצרים"),
    ("hours", "שעות"),
    ("delivery", "משלוחים"),
    ("contact-channels", "יצירת קשר"),
    ("tags", "תגים"),
    ("license", "רישיון עסק"),
    ("kashrut", "כשרות"),
    ("owner-story", "מאחורי העסק"),
    ("questions", "שאלות נפוצות"),
)

PATHS: Final = frozenset(path for _, path, _, _ in SECTIONS)
KEY_BY_PATH: Final = {path: key for key, path, _, _ in SECTIONS}
EDIT_PATH: Final = f"{_D}/edit"
