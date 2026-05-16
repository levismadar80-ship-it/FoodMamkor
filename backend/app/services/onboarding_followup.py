"""
Module:   onboarding_followup
Purpose:  Daily-scheduler entry point for the 4 onboarding follow-up emails
          (Day 2 / 5 / 10 / 30 after producer registration). Picks the
          licensed-vs-unlicensed variant for Email 5 based on the producer's
          self-supplied license number + admin-approved status.
Touches:  reads producers + users via SQLAlchemy Session; writes per-step
          `email_followup_{2,3,4,5}_sent_at` timestamps on the producer row;
          dispatches via app.services.email.send_email (Resend, fail-open).
Does NOT: hold the scheduler instance (that lives in app.startup); decide
          when "due" means (the scheduler trigger does — daily 10:00 UTC);
          touch the MEH-287 welcome path (_send_welcome_email /
          notify_producer_registered are anchors and stay frozen).
Related:  backend/app/services/email.py:22 (send_email fail-open contract),
          backend/app/services/auth_emails.py:134 (send_welcome_email anchor —
          do not modify), backend/alembic/versions/20260516_1036_b504e4be4225_
          meh_539_add_followup_email_tracking.py (the 4 timestamp columns +
          idx_producers_created_at this module relies on).
History:  MEH-539 (creation, 2026-05-16) — Phase 2C of MEH-615.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Tuple

from sqlalchemy.orm import Session

from app.config import settings
from app.models.models import Producer, User
from app.services.email import send_email

logger = logging.getLogger(__name__)


# MEH-539: step → (days_old threshold, Producer column attribute name).
# Column is by step number (the 2nd / 3rd / 4th / 5th email of the sequence),
# the days-old number is the wait window. See migration b504e4be4225.
_FOLLOWUP_STEPS: list[tuple[int, int, str]] = [
    (2, 2, "email_followup_2_sent_at"),
    (3, 5, "email_followup_3_sent_at"),
    (4, 10, "email_followup_4_sent_at"),
    (5, 30, "email_followup_5_sent_at"),
]


# ---------- email bodies (Hebrew, approved 16-May-2026 — Drive folder
# 19yWq0iuNgxr59JHRGUV5KPGTh0LpMzKE, Phase 1 of MEH-539) ----------

_EMAIL_2_SUBJECT = "הסיפור שלך — זה מה שמבדיל אותך"
_EMAIL_2_BODY = """\
{greeting}

יש משהו אחד שאני רוצה לדבר עליו לפני שאתם ממלאים את שאר הפרטים: הסיפור.

באתרי אוכל אחרים, השדה "תיאור העסק" הוא בדרך כלל מקום לרשימת מוצרים. במהמקור זה אחרת — זה המקום שבו לקוח/ה פוטנציאלי/ת מחליט/ה אם להמשיך לקרוא או לסגור את הטאב. הסיפור הוא הכותרת.

לכן הכנתי 3 שאלות לפני שכותבים:

1. למה התחלת?
לא "למה פתחתי עסק" — אלא מה גרם לבחור דווקא את זה. גבינה? אפייה? תבלינים? תני לקורא/ת להבין את הרגע הראשון.

2. מה מיוחד אצלך?
לא יחסית למתחרים. יחסית לעסק ה-בייסיק בקטגוריה. אם אופים לחם — מה הופך את הלחם שלכם לשונה מ-10 מאפיות הלחם הבאות באתר?

3. למי אתם מייצרים?
לא "לכולם". חישבו על לקוח/ה אחד/ת ספציפי/ת שקנה/תה מכם לאחרונה — אתם כותבים אליו/ה.

---

טיפ אחד שעוזר: קראו בקול. אם זה נשמע כמו פרסומת של רשת — תתחילו מחדש. אם זה נשמע כמו שאתם מספרים לחבר/ה — אתם על הדרך.

אורך מומלץ: 150–300 מילים. לא יותר. תמיד אפשר להוסיף עוד פרק ב-"אודות".

---

רוצים דוגמאות לפני ואחרי?
📖 מדריך מלא — איך לכתוב סיפור טוב על העסק שלך:
{frontend_url}/about/for-businesses/guides/business-story

החודש הראשון הוא הכי חשוב. אני פה אם משהו תקוע.

ספיר שנפ
מייסדת | מהמקור
mehamakor.co.il
"""

_EMAIL_3_SUBJECT = "צילום מוצר — בלי מצלמה, בלי סטודיו"
_EMAIL_3_BODY = """\
{greeting}

עברו כמה ימים. בינתיים — תמונה אחת או שתיים יותר משכנעות מ-100 מילים. ובמהמקור, התמונה הראשונה היא הרגע שבו לקוח/ה מחליט/ה אם להישאר על העמוד.

הנה האמת על צילום מוצר: לא צריך מצלמה מקצועית. הטלפון מספיק. מה שכן צריך זה אור טבעי וקצת כוונה.

1. אור טבעי בלבד. בלי פלאש.
העמידו את המוצר ליד חלון, לא מתחתיו. הזמן הכי טוב — שעת בוקר (9:00–11:00) או אחה"צ מאוחר (15:00–17:00). נורת התקרה? כבו אותה. צהריים בשמש ישירה — חכו, היא יוצרת צללים קשים.

2. אנשים, לא רק מוצרים.
התמונה החזקה ביותר בפרופיל היא שלכם, עם המוצרים, בידיים. לא portrait מקצועי במשרד — אתם בעבודה. ידיים שמלחיצות בצק. אופה ליד התנור. חקלאי בשדה. אנשים קונים מאנשים.

3. תהליך, לא רק תוצאה.
ידיים שמלחיצות קמח. ענבים שנקטפים. גבינה שיוצקים לתבנית. תהליך = שקיפות = אמון.

4. סביבה — Sense of Place.
המקום שלכם הוא חלק מהסיפור. נוף מהשדה, חזית של המאפיה, חצר הרפת בבוקר, שולחן עץ ישן עם המוצרים. אם זה משק בגליל — תנו לגליל להיראות.

5. אל תפילטרו יותר מדי.
בהירות + ניגודיות עדינים — בסדר. פילטר וינטג', VSCO look, HDR — לא. שינו את הצבע של המוצר ולקוח/ה יתאכזב/ת כשיקבל/תקבל. אנחנו לא Instagram-aesthetic — אנחנו אמיתיים.

---

טיפ סודי: צלמו 20 תמונות לכל מוצר. תבחרו 3. תמיד תקבלו תמונה אחת ש"עובדת" בלי לדעת מראש למה.

רוצים לראות דוגמאות של תמונות שעובדות ושלא?
📖 מדריך מלא — איך לצלם את המוצרים שלכם נכון:
{frontend_url}/about/for-businesses/guides/product-photography

ספיר שנפ
מייסדת | מהמקור
mehamakor.co.il
"""

_EMAIL_4_SUBJECT = "ההודעה הראשונה — איך לא לפספס אותה"
_EMAIL_4_BODY = """\
{greeting}

אם הפרופיל שלכם פעיל — כנראה כבר התחילו להגיע הודעות. או יגיעו בקרוב.

הנה האמת על הודעה ראשונה מלקוח/ה חדש/ה: זמן התגובה משנה יותר מהתשובה עצמה.

אישה שכותבת לכם בערב, ולא קיבלה תשובה עד הצהריים הבא — כבר חיפשה במקום אחר. לא כי המוצר שלכם פחות טוב. כי היא לא יודעת שאתם עוד שם.

5 טיפים שעובדים:

1. ארבע שעות. זה הסף.
לא מיידי — אתם בעלי עסק, לא צ'אט-בוט. אבל בתוך 4 שעות בשעות העבודה, תענו משהו. אפילו "היי, ראיתי. אענה בפירוט הערב." זה מספיק כדי לא לאבד את הלקוח/ה.

2. אחרי שעות עבודה — תגדירו ציפיות.
אם הודעה הגיעה ב-22:00, אל תרגישו חובה לענות מיד. אבל שורה אחת בבוקר: "בוקר טוב! ראיתי את ההודעה שלך אתמול בלילה. עונה עכשיו בפירוט." משנה הכל.

3. אישי מנצח תבנית מוכנה. אבל לא לגמרי.
תשובה מעוצבת לחלוטין משאירה רושם של "פנו לשירות לקוחות". תשובה מאולתרת לגמרי לוקחת לכם 10 דקות לכל הודעה. המיקס: פתיחה אישית ("היי דנה, תודה שפנית!"), גוף ההודעה בתבנית, סגירה אישית ("מחכה להזמנה שלך — דברי כשרוצה").

4. שאלו לפני שאתם מספרים.
לקוח/ה חדש/ה כותב/ת "יש לכם גבינות?" — לפני שאתם שולחים את כל הקטלוג, תשאלו: "כן! בשביל ארוחת ערב לזוג, או אירוח לקבוצה? יש לי המלצות שונות לכל אחד." זה מתחיל שיחה, לא מסתיים בה.

5. שיחה לא חייבת להסתיים במכירה.
לפעמים שואלים ולא קונים. זה בסדר. תשובה טובה היום = הזמנה בעוד 3 חודשים.

---

טיפ אחרון: שמרו 5–10 תבניות תגובה. "מחירון מלא", "זמני אספקה", "תשלום". זה חוסך שעות.

רוצים דוגמאות של הודעות טובות ופחות טובות?
📖 מדריך מלא — איך להגיב להודעות שמגיעות אליכם:
{frontend_url}/about/for-businesses/guides/customer-messages

ספיר שנפ
מייסדת | מהמקור
mehamakor.co.il
"""

_EMAIL_5A_SUBJECT = "חודש איתנו — סיכום קצר + מה הלאה"
_EMAIL_5A_BODY = """\
{greeting}

חודש. זה הזמן להגיד תודה — באמת.

הצטרפתם למהמקור כשעוד היינו פרויקט קטן. בעלי העסק כמוכם הם הסיבה שהפרויקט הזה קיים בכלל.

איך הצד שלכם נראה?
קיבלתם הודעות ראשונות? הסיפור עובד כמו שציפיתם? תכתבו לי בחזרה — אני אוהבת לשמוע מה עובד ומה לא. אני קוראת כל אימייל אישית.

---

שלושה דברים פשוטים שמחזקים נוכחות:

1. תמונה חדשה פעם בשבוע.
לא חייב photo shoot. תמונה מתהליך, מהיום, מהמוצר העונתי החדש. הפרופיל "חי" כשהוא מתעדכן. הפרופיל "שכוח" כשלא.

2. סיפור עונתי — להוסיף לתיאור.
מה חדש בעסק החודש? מנגו עונתי הגיע? מאפה חדש בקטלוג? אביב = שזיף, חורף = הדרים. עונתיות מספרת שאתם פעילים.

3. ביקורת אמיתית אחת.
אם יש לקוח/ה מרוצה — בקשו ממנו/ה משפט קצר עם שם פרטי. ביקורת אחת אמיתית עם סיפור > 50 ביקורות "5 כוכבים" אנונימיות. (במהמקור אין דירוגים אנונימיים. כל ביקורת — עם שם וסיפור.)

---

מה הלאה:
בחודשים הקרובים נשלח חומרים מעמיקים יותר — איך לתמחר נכון, איך לטפל בעונות שקטות, איך לבנות לקוחות חוזרים. נשמע משהו ספציפי שתרצו? תכתבו לי בחזרה.

תודה שבחרתם להיות בבית הראשון. זה אומר משהו.

ספיר שנפ
מייסדת | מהמקור
mehamakor.co.il
"""

_EMAIL_5B_SUBJECT = "הפרופיל ממתין — חסר רק דבר אחד"
_EMAIL_5B_BODY = """\
{greeting}

עבר חודש מאז ההרשמה. עברתי על הפרופיל שלכם, והכל נראה טוב — חוץ מדבר אחד שעוד חסר: רישיון.

מהמקור מציגה רק בעלי עסק עם רישיון מתאים לקטגוריה שלהם. זה לא בירוקרטיה — זה ערך מרכזי שלנו. בעלי העסק שכבר באתר עברו את אותו תהליך. אנחנו מחויבים גם ללקוחות (שיודעים שאוכל הוא בטוח) וגם אליכם (שיודעים שלא תהיו במצב לא חוקי).

מה אני צריכה:
✅ העתק של הרישיון התקף (PDF / תמונה ברורה)
✅ אפשר לשלוח בתגובה לאימייל הזה, או דרך הדשבורד

אין רישיון עדיין?
זה בסדר. תהליך הוצאת רישיון לוקח 2–4 חודשים בממוצע. אם אתם בתהליך — תכתבו לי, ואני אשמור על הפרופיל. כשהרישיון יגיע, נעלה אותו מיד.

לא בטוחים אם צריכים רישיון או איזה?
זה תלוי בקטגוריה ובהיקף. תכתבו לי בחזרה בכמה מילים על מה שאתם מוכרים — אעזור לכוון לאיפה לפנות.

---

הפרופיל שלכם שמור. אבל אם תחליטו לא להמשיך לכיוון רישיון — תגידו, ואנחנו נסיר את הפרטים. בלי שאלות.

ספיר שנפ
מייסדת | מהמקור
mehamakor.co.il
"""


# ---------- helpers ----------


def _greeting(first_name: str) -> str:
    """Build the opening "היי X," line. Falls back to "היי," when the user
    has no parseable first name (User.name None/empty/whitespace-only)."""
    return f"היי {first_name}," if first_name else "היי,"


def _is_licensed(producer: Producer) -> bool:
    """MEH-539 Email-5 variant predicate (Phase 2A.5 approach + user override
    in Phase 2C prompt): producer is treated as "licensed" only when
    admin-approved AND a non-blank license number was supplied. Whitespace-only
    license values count as "not supplied" — same normalisation as
    backend/app/services/license_validation.py:30."""
    if producer.status != "approved":
        return False
    pln = (producer.producer_license_number or "").strip()
    return bool(pln)


def _build_email(step: int, producer: Producer, first_name: str) -> Tuple[str, str]:
    """Pick (subject, body) for one step. Email 5 branches on _is_licensed."""
    fmt = {
        "greeting": _greeting(first_name),
        "frontend_url": settings.frontend_url,
    }
    if step == 2:
        return _EMAIL_2_SUBJECT, _EMAIL_2_BODY.format(**fmt)
    if step == 3:
        return _EMAIL_3_SUBJECT, _EMAIL_3_BODY.format(**fmt)
    if step == 4:
        return _EMAIL_4_SUBJECT, _EMAIL_4_BODY.format(**fmt)
    if step == 5:
        if _is_licensed(producer):
            return _EMAIL_5A_SUBJECT, _EMAIL_5A_BODY.format(**fmt)
        return _EMAIL_5B_SUBJECT, _EMAIL_5B_BODY.format(**fmt)
    raise ValueError(f"unknown follow-up step: {step}")


# ---------- public entry point ----------


def send_due_followups(db: Session) -> dict[int, int]:
    """Scheduler entry point. For each of the 4 follow-up steps, find every
    producer whose registration is older than the step's window AND whose
    `email_followup_N_sent_at` is still NULL, send the corresponding email,
    and stamp the column with `now()`. Returns {step: count_sent}.

    Per-producer fail-isolation: any exception inside one iteration is logged
    and the loop continues — the daily run never crashes on a bad row.
    Per-producer commit (not batch): if Resend silently drops a delivery the
    column still flips to non-null and we accept that risk (Phase 2A.5).
    """
    counts: dict[int, int] = {2: 0, 3: 0, 4: 0, 5: 0}
    now = datetime.now(timezone.utc)

    for step, days_old, column_attr in _FOLLOWUP_STEPS:
        cutoff = now - timedelta(days=days_old)
        column = getattr(Producer, column_attr)
        candidates = (
            db.query(Producer)
            .filter(Producer.created_at <= cutoff, column.is_(None))
            .all()
        )
        for p in candidates:
            try:
                user = db.query(User).filter(User.producer_id == p.id).first()
                if not user or not user.email:
                    continue
                parts = (user.name or "").strip().split()
                first_name = parts[0] if parts else ""
                subject, body = _build_email(step, p, first_name)
                send_email(user.email, subject, body)
                setattr(p, column_attr, datetime.now(timezone.utc))
                db.commit()
                counts[step] += 1
                logger.info("[FOLLOWUP] step=%d producer_id=%s sent", step, p.id)
            except Exception as e:  # noqa: BLE001 — fail-open per producer
                db.rollback()
                logger.warning(
                    "[FOLLOWUP] step=%d producer_id=%s failed: %s",
                    step,
                    p.id,
                    e,
                )
                continue

    return counts
