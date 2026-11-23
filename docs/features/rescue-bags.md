# שקיות הצלה

**מה הן עושות.** בית עסק מציע שקית עודפים במחיר מוזל לחלון איסוף. לקוחה מזמינה, מקבלת קוד, ואוספת. יש תקציר יומי, סימון «נאספה» ו«לא הגיעה», ותג חיסכון.

**Flags — זה הפיצ'ר היחיד באתר שמאחורי flag.**
* חזית: `NEXT_PUBLIC_RESCUE_BAGS_ENABLED`, נקרא דרך `frontend/lib/rescue.js` ‏(`rescueBagsEnabled()`).
* שרת: `rescue_bags_enabled` ב-`backend/app/config.py`.
* ברירת המחדל ב-production היא **כבוי**. כשהוא כבוי, עמוד המחירון לא מזכיר שקיות — `RESCUE_COPY_KEYS` ב-`frontend/lib/pricing.js`.

**Routes**
* `frontend/app/[locale]/rescue/`
* `frontend/app/[locale]/rescue/[offerId]/` — דף משלו לכל סל: מחיר מול שווי, איסוף, מפה, מה בדרך כלל בסל, אלרגנים, איך זה עובד, ביטול, שריון. קורא `GET /rescue/offers/{id}`, שמחזיר גם סל שאזל / בוטל / נסגר עם `state` (MEH-3586). השורה ב-`/rescue` והכרטיס בבית פותחים אותו. «הוראות איסוף» של נקודת האיסוף (`producer_locations.pickup_note`, נערכות עם הכתובת במיקומים) מופיעות שם מתחת לכתובת, כשיש (MEH-3593).
* `frontend/app/[locale]/producer/dashboard/rescue/` ‏(+ `counter-card`)

**קבצים מרכזיים**
* `backend/app/routers/rescue.py` · `backend/app/routers/rescue_pilot.py` — אילו נקודות איסוף של העסק ביישוב פיילוט, לפני הטופס (MEH-2921)
* `backend/app/services/rescue_reads.py` — מה שמסכי הסלים קוראים: רשימת הסלים של היום, השריונים של הקונה, ההזמנות והסלים של בית העסק היום, «בדרך כלל», ומספרי הפיילוט לאדמין. ה-handlers ב-`backend/app/routers/rescue.py` קוראים את השעון ואת ערי הפיילוט ומעבירים אותם (MEH-3541).
* `backend/app/services/rescue_writes.py` — מה שמסכי הסלים כותבים: פרסום סל, ביטול, שריון, מסירה, אי-הגעה, ביטול של קונה, ביקורת, סלים שנתרמו וניקוי חסימה. ה-router מעביר את נעילת השורה (`_offer_for_update`), את השעון ואת בדיקת עיר הפיילוט, ושולח את המיילים בעצמו (MEH-3554).
* `frontend/components/rescue/RescueSection.jsx` — מתחת לכפתור «לשריין» שורה שמציינת מול איזה בית עסק עושים את העסקה ושמהמקור לא צד לה (`frontend/components/public/NotAPartyLine.jsx`, MEH-3570).
* `frontend/components/rescue/RescueList.jsx` — רשימת הסלים של היום בלשונית «הזדמנויות». בזמן טעינה: שלד של שלוש שורות; כשאין סלים: `EmptyState` עם אייקון סל, כותרת, שורת משנה והתראה, כמו בקבוצות הרכישה (MEH-3626). שומר: `frontend/__tests__/RescueBuyerFlow.test.jsx`.
* `frontend/app/[locale]/rescue/[offerId]/RescueOfferAction.jsx` — הכרטיס בדף הסל. מתחת לכפתור «לשריין» אותה שורה: מול איזה בית עסק העסקה ושמהמקור לא צד לה (MEH-3570).
* `frontend/lib/use-rescue-reservation.js` — שריון, קריאה חוזרת אחרי טעינה, ביטול. אותו hook בדף העסק ובדף הסל (MEH-3586).
* `frontend/components/offer-detail/AllergenSection.jsx` + `frontend/components/offer-detail/PickupLine.jsx` — בלוק האלרגנים ושורת שעת האיסוף בדף הסל, אותם רכיבים כמו בדף קבוצת הרכישה (MEH-3610).
* `frontend/components/admin/AdminRescueMetrics.jsx` — מספרי הפיילוט ב-`/admin/analytics` (`GET /admin/rescue/metrics`, MEH-3524); כשהפיילוט כבוי לא מוצג כלום.
* `backend/app/services/rescue_emails.py` · `backend/app/services/rescue_no_show.py`

**טסטים**
* `tests/test_rescue.py` · `tests/test_rescue_pilot.py` · `tests/test_rescue_migration.py`
* `tests/test_meh2943_rescue_idor.py` — בדיקת בעלות.
* `tests/test_meh3586_rescue_offer_detail.py` · `frontend/__tests__/RescueOfferPage.test.jsx` — דף הסל: ארבעת המצבים ומה מוסתר ב-404.
* `tests/test_meh3593_pickup_note.py` — «הוראות איסוף» על נקודת האיסוף: שמירה, ניקוי, PUT בלי השדה לא מוחק, עסק אחר לא כותב, הדף והמייל (MEH-3593).
* `tests/test_meh2679_rescue_utc_times.py` · `tests/test_meh2808_rescue_bag_window.py` — חלון האיסוף.
* `frontend/__tests__/AdminRescueMetrics.test.jsx` — מספרי הפיילוט באדמין.
* `tests/test_meh2703_rescue_donated.py` · `tests/test_meh2716_rescue_saving_badge.py` · `tests/test_meh2752_rescue_allergens.py`

**מזהי רישום שזה מכסה.** `rescue_bags`.
