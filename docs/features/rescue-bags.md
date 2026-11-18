# שקיות הצלה

**מה הן עושות.** בית עסק מציע שקית עודפים במחיר מוזל לחלון איסוף. לקוחה מזמינה, מקבלת קוד, ואוספת. יש תקציר יומי, סימון «נאספה» ו«לא הגיעה», ותג חיסכון.

**Flags — זה הפיצ'ר היחיד באתר שמאחורי flag.**
* חזית: `NEXT_PUBLIC_RESCUE_BAGS_ENABLED`, נקרא דרך `frontend/lib/rescue.js` ‏(`rescueBagsEnabled()`).
* שרת: `rescue_bags_enabled` ב-`backend/app/config.py`.
* ברירת המחדל ב-production היא **כבוי**. כשהוא כבוי, עמוד המחירון לא מזכיר שקיות — `RESCUE_COPY_KEYS` ב-`frontend/lib/pricing.js`.

**Routes**
* `frontend/app/[locale]/rescue/`
* `frontend/app/[locale]/producer/dashboard/rescue/` ‏(+ `counter-card`)

**קבצים מרכזיים**
* `backend/app/routers/rescue.py`
* `frontend/components/rescue/RescueSection.jsx`
* `backend/app/services/rescue_emails.py` · `backend/app/services/rescue_no_show.py`

**טסטים**
* `tests/test_rescue.py` · `tests/test_rescue_pilot.py` · `tests/test_rescue_migration.py`
* `tests/test_meh2943_rescue_idor.py` — בדיקת בעלות.
* `tests/test_meh2679_rescue_utc_times.py` · `tests/test_meh2808_rescue_bag_window.py` — חלון האיסוף.
* `tests/test_meh2703_rescue_donated.py` · `tests/test_meh2716_rescue_saving_badge.py` · `tests/test_meh2752_rescue_allergens.py`

**מזהי רישום שזה מכסה.** `rescue_bags`.
