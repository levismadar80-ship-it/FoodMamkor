# עדכניות העמודים

**מה הוא עושה.** פעם בחודש נשלח מייל לבעלת עסק חי: "הכול בעמוד שלך עדיין נכון?". בעמוד שנפתח מהקישור היא לוחצת «כן, הכול נכון», והתאריך נשמר ב-`last_confirmed_at`. באדמין יש סינון «לא נבדק יותר מ-60 יום», שכולל גם עמודים בלי בעלים, שלא מקבלים את המייל, ובעמוד העריכה מוצגת השורה «נבדק לאחרונה». בכל יום ראשון האדמין מקבלת מייל עם העמודים שעברו את 60 הימים, כך שאין צורך לזכור לפתוח את הסינון. דיווח של גולשים על מידע שגוי הוא פיצ'ר נפרד, הכפתור «מצאתן טעות בפרטים?» (`backend/app/routers/report_info.py`).

**Routes**
* `frontend/app/[locale]/freshness/confirm/` — העמוד שנפתח מהקישור במייל. הוא לא שולח כלום כשהעמוד נטען, רק כשבעלת העסק לוחצת.
* `POST /page-freshness/confirm` — `backend/app/routers/page_freshness.py`
* `GET /admin/producers?freshness_stale=true` — `backend/app/routers/admin.py`

**קבצים מרכזיים**
* `backend/app/services/page_freshness.py` — מי מקבלת מייל, הטוקן, השליחה והאישור.
* `backend/app/services/page_freshness_digest.py` — המייל השבועי לאדמין (יום ראשון, לפי שעון ישראל).
* `backend/app/startup.py` — רץ במתזמן היומי, אחרי התזכורות.
* `frontend/app/[locale]/admin/producers/AdminProducersToolbar.jsx` — כפתור הסינון.

**Flags.** `PAGE_FRESHNESS_ENABLED`, כבוי כברירת מחדל. ספיר מוסיפה את השדה ל-`backend/app/config.py`, ועד אז השליחה לא רצה. האישור והסינון באדמין עובדים בלעדיו.

**טסטים**
* `tests/test_page_freshness.py`
* `frontend/__tests__/PageFreshnessConfirm.test.jsx` · `frontend/__tests__/AdminFreshnessStaleFilter.test.jsx` · `frontend/__tests__/AdminLastConfirmed.test.jsx`

**מזהי רישום שזה מכסה.** אין, זה כלי פנימי (Launch tier ג׳).
