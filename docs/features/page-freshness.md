# עדכניות העמודים

**מה הוא עושה.** פעם בחודש, מה-1 לחודש (לא בשישי ושבת, אז ביום ראשון), יוצא לכל עסק חי בן חודש ומעלה המייל החודשי האחד: בראשו מה הגיע דרך האתר בחודש הקודם (הזמנות ושוויין, אחר כך צפיות וקליקים; שורה שערכה 0 לא מוצגת, וחודש שכולו אפסים נשאר בלי החלק הזה ועם הנושא «הכול עדיין נכון?»), ואחריו השאלה "הכול בעמוד העסק עדיין נכון?" (MEH-3194, ערך לפני חשבון). עסק שקיבל את מייל היום ה-30 בסדרת הקליטה («חודש איתנו») בשבוע האחרון מדלג על החודש הזה ונשאל ביום שליחה מאוחר יותר (MEH-3840). בעמוד שנפתח מהקישור היא לוחצת «כן, הכול נכון», והתאריך נשמר ב-`last_confirmed_at`. באדמין יש סינון «לא נבדק יותר מ-60 יום», שכולל גם עמודים בלי בעלים, שלא מקבלים את המייל, ובעמוד העריכה מוצגת השורה «נבדק לאחרונה». בכל יום ראשון האדמין מקבלת מייל עם העמודים שעברו את 60 הימים, כך שאין צורך לזכור לפתוח את הסינון. דיווח של גולשים על מידע שגוי הוא פיצ'ר נפרד, הכפתור «מצאתן טעות בפרטים?» (`backend/app/routers/report_info.py`).

**Routes**
* `frontend/app/[locale]/freshness/confirm/` — העמוד שנפתח מהקישור במייל. הוא לא שולח כלום כשהעמוד נטען, רק כשבעלת העסק לוחצת.
* `POST /page-freshness/confirm` — `backend/app/routers/page_freshness.py`
* `GET /admin/producers?freshness_stale=true` — `backend/app/routers/admin.py` (הסינון עצמו ב-`backend/app/services/admin_producer_reads.py`)

**קבצים מרכזיים**
* `backend/app/services/page_freshness.py` — מי מקבלת מייל, הטוקן, השליחה והאישור.
* `backend/app/services/freshness_month_numbers.py` — המספרים של החודש הקודם בראש המייל והנושא שלו (MEH-3194).
* `backend/app/services/page_freshness_digest.py` — הרשימה השבועית של עמודים שלא נבדקו (יום ראשון, לפי שעון ישראל): נשלחת ל-Sentry עם התגית `ops_alert` ובדיקת הבוקר של Claude קוראת אותה; מייל לאדמין רק כש-Sentry כבוי (MEH-3705).
* `backend/app/startup.py` — רץ במתזמן היומי, אחרי התזכורות.
* `frontend/app/[locale]/admin/producers/AdminProducersToolbar.jsx` — כפתור הסינון.

**Flags.** `PAGE_FRESHNESS_ENABLED`, כבוי כברירת מחדל. ספיר מוסיפה את השדה ל-`backend/app/config.py`, ועד אז השליחה לא רצה. האישור והסינון באדמין עובדים בלעדיו.

**טסטים**
* `tests/test_page_freshness.py` · `tests/test_meh3194_freshness_month_numbers.py`
* `frontend/__tests__/PageFreshnessConfirm.test.jsx` · `frontend/__tests__/AdminFreshnessStaleFilter.test.jsx` · `frontend/__tests__/AdminLastConfirmed.test.jsx`

**מזהי רישום שזה מכסה.** אין, זה כלי פנימי (Launch tier ג׳).
