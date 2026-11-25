# שקיות הצלה

**מה הן עושות.** בית עסק מציע שקית עודפים במחיר מוזל לחלון איסוף. לקוחה מזמינה, מקבלת קוד, ואוספת. יש תקציר יומי, סימון «נאספה» ו«לא הגיעה», ותג חיסכון.

**היום ומחר (MEH-3702).** בית עסק מפרסם סל להיום או למחר, ולקוחה משריינת אותו מאותו רגע. החלון אחד, `reserve_days` ב-`backend/app/services/rescue_reads.py`, והפרסום, הרשימה, דף הסל, השריון והרשימות של בית העסק קוראים כולם ממנו. מי ששריינה ביום קודם מקבלת ביום האיסוף ב-08:00 מייל תזכורת עם הקוד, החלון והביטול (`backend/app/services/rescue_reminders.py`, דרך תור המיילים). מי ששריינה ביום האיסוף עצמו לא מקבלת תזכורת. התזכורת נשלחת פעם אחת ביום גם אם המשימה רצה פעמיים. סל שחלון האיסוף שלו נגמר עד 08:00 מקבל את התזכורת בערב שלפני, ב-20:00 (MEH-3805), ולא מקבל עוד אחת בבוקר. מי שמשריינת סל כזה בין 20:00 לחצות לא מקבלת תזכורת, ומייל האישור של השריון מחליף אותה. מסירה של סל של מחר נחסמת בשרת. דף שנשאר פתוח מעבר לחצות מתעדכן מ«מחר» ל«היום» בלי טעינה (`frontend/lib/use-israel-today.js`). השרת מסרב לסל של מחר עם שעות של היום, ולחלון איסוף שכבר נגמר.

**לוח קבוע (MEH-3703).** בית עסק קובע פעם אחת לכל נקודת איסוף: באילו ימים, באילו שעות (בחירת שעה ודקות בשעון של 24 שעות, `frontend/components/ui/TimeOfDaySelect.jsx`), כמה סלים, באיזה מחיר ומה שווי הסל. שווי שאינו גבוה מהמחיר לא נשמר, כמו בטופס הפרסום. הלוח נשמר ב-`producer_locations.rescue_schedule` (JSONB), ומשימה שרצה כל שעה (‏5 דקות אחרי השעה) מפרסמת סל רגיל ב-`rescue_offers` לכל יום בלוח שבחלון השריון (היום ומחר) ואין בו עדיין סל. יום שבית העסק ביטל בו סל ביד לא חוזר, כי כל סל באותו יום, גם מבוטל, חוסם פרסום. שמירה של הלוח מפרסמת מיד. ביום בלי עודפים מדלגים: שורה מתחת למונים בלשונית הסלים («לדלג על מחר»), ורשימת שבועיים בדף הלוח. דילוג על יום שהסל שלו כבר עלה מבטל אותו בשרת, באותה פעולה, דרך אותו «ביטול» של הכרטיס (והקונים מקבלים אותו מייל). אם יש שריונים, השרת עונה 409 והלוח שואל קודם. סל מהלוח לא שולח התראה לעוקבים. השעות הן שעון הקיר בישראל, ו-zoneinfo מחשב את ההיסט לכל תאריך, כך שמעבר לשעון קיץ לא מזיז את האיסוף.

**Flags — זה הפיצ'ר היחיד באתר שמאחורי flag.**
* חזית: `NEXT_PUBLIC_RESCUE_BAGS_ENABLED`, נקרא דרך `frontend/lib/rescue.js` ‏(`rescueBagsEnabled()`).
* שרת: `rescue_bags_enabled` ב-`backend/app/config.py`.
* ברירת המחדל ב-production היא **כבוי**. כשהוא כבוי, עמוד המחירון לא מזכיר שקיות — `RESCUE_COPY_KEYS` ב-`frontend/lib/pricing.js`.

**Routes**
* `frontend/app/[locale]/rescue/`
* `frontend/app/[locale]/rescue/[offerId]/` — דף משלו לכל סל: מחיר מול שווי, איסוף, מפה, מה בדרך כלל בסל, אלרגנים, איך זה עובד, ביטול, שריון. קורא `GET /rescue/offers/{id}`, שמחזיר גם סל שאזל / בוטל / נסגר עם `state` (MEH-3586). השורה ב-`/rescue` והכרטיס בבית פותחים אותו. «הוראות איסוף» של נקודת האיסוף (`producer_locations.pickup_note`, נערכות עם הכתובת במיקומים) מופיעות שם מתחת לכתובת, כשיש (MEH-3593).
* `frontend/app/[locale]/producer/dashboard/rescue/` ‏(+ `counter-card`)
* `frontend/app/[locale]/producer/dashboard/rescue/schedule/` — הלוח הקבוע (MEH-3703)

**קבצים מרכזיים**
* `backend/app/routers/rescue.py` · `backend/app/routers/rescue_pilot.py` — אילו נקודות איסוף של העסק ביישוב פיילוט, לפני הטופס (MEH-2921)
* `backend/app/services/rescue_reads.py` — מה שמסכי הסלים קוראים: רשימת הסלים של היום, השריונים של הקונה, ההזמנות והסלים של בית העסק היום, «בדרך כלל», ומספרי הפיילוט לאדמין. ה-handlers ב-`backend/app/routers/rescue.py` קוראים את השעון ואת ערי הפיילוט ומעבירים אותם (MEH-3541).
* `backend/app/services/rescue_writes.py` — מה שמסכי הסלים כותבים: פרסום סל, ביטול, שריון, מסירה, אי-הגעה, ביטול של קונה, ביקורת, סלים שנתרמו וניקוי חסימה. ה-router מעביר את נעילת השורה (`_offer_for_update`), את השעון ואת בדיקת עיר הפיילוט (MEH-3554).
* `backend/app/services/rescue_notify.py` — מה שנשלח אחרי שהכתיבה נשמרה: ההתראה לעוקבים על סל להיום, מייל השריון ומייל הביטול לקונה, ומייל לכל קונה כשבית העסק מבטל. ה-router מעביר את השעון, ומשאיר את ה-`try` שמונע ממייל שנכשל להפוך פעולה שנשמרה לשגיאה (MEH-3537).
* `backend/app/services/rescue_routine_writes.py` — הכללים של הלוח הקבוע מאחורי `/producers/me/rescue`: נקודת האיסוף של העסק, שמירה ועצירה של הלוח, דילוג על יום וביטול הדילוג, והשורה שהלוח קורא. ביטול הסל של יום שדילגו עליו נשאר ב-router, עם הנעילה שלו (MEH-3537).
* `frontend/components/rescue/RescueSection.jsx` — מתחת לכפתור «לשריין» שורה שמציינת מול איזה בית עסק עושים את העסקה ושמהמקור לא צד לה (`frontend/components/public/NotAPartyLine.jsx`, MEH-3570).
* `frontend/components/rescue/RescueList.jsx` — רשימת הסלים של היום בלשונית «הזדמנויות». בזמן טעינה: שלד של שלוש שורות; כשאין סלים: `EmptyState` עם אייקון סל, כותרת, שורת משנה והתראה, כמו בקבוצות הרכישה (MEH-3626). שומר: `frontend/__tests__/RescueBuyerFlow.test.jsx`.
* מיון הרשימה (MEH-3704): «לפי שעת האיסוף» (ברירת המחדל, הסדר של השרת), «הכי קרוב» (רק כשיש מיקום שמור, ואז הרשימה נשלחת עם lat/lng), «הכי זול», «הדירוג הכי גבוה». הבקרה מופיעה רק משני סלים. הסדר ב-`frontend/lib/rescue-sort.js`.
* `frontend/components/rescue/ShareCodeButton.jsx` — «לשלוח לחבר שיאסוף» באישור השריון, כל עוד הסל משוריין: קוד, בית העסק, החלון, הכתובת ומה אומרים בקופה. גיליון השיתוף של הטלפון, ובלעדיו ווטסאפ (MEH-3704). השריון לא עובר לאדם אחר: מי שאומר את הקוד אוסף. שומר: `frontend/__tests__/RescueShareSort.test.jsx`.
* `frontend/app/[locale]/rescue/[offerId]/RescueOfferAction.jsx` — הכרטיס בדף הסל. מתחת לכפתור «לשריין» אותה שורה: מול איזה בית עסק העסקה ושמהמקור לא צד לה (MEH-3570).
* `frontend/lib/use-rescue-reservation.js` — שריון, קריאה חוזרת אחרי טעינה, ביטול. אותו hook בדף העסק ובדף הסל (MEH-3586).
* `frontend/components/offer-detail/AllergenSection.jsx` + `frontend/components/offer-detail/PickupLine.jsx` — בלוק האלרגנים ושורת שעת האיסוף בדף הסל, אותם רכיבים כמו בדף קבוצת הרכישה (MEH-3610).
* `frontend/components/admin/AdminRescueMetrics.jsx` — מספרי הפיילוט ב-`/admin/analytics` (`GET /admin/rescue/metrics`, MEH-3524); כשהפיילוט כבוי לא מוצג כלום.
* `backend/app/services/rescue_emails.py` · `backend/app/services/rescue_no_show.py`
* `backend/app/services/rescue_reminders.py` — תזכורת הבוקר של יום האיסוף, 08:00 שעון ישראל, פעם ביום (MEH-3702), ותזכורת הערב שלפני, 20:00, לחלון שנגמר עד 08:00 (MEH-3805).
* `backend/app/services/rescue_schedule.py` · `backend/app/schemas/rescue_schedule.py` — הלוח הקבוע: שמירה, דילוג, והפרסום של כל שעה (MEH-3703).
* `frontend/components/dashboard/RescueScheduleStrip.jsx` · `frontend/components/dashboard/RescueScheduleForm.jsx` — השורה מתחת למונים ודף הלוח (MEH-3703).

**טסטים**
* `tests/test_rescue.py` · `tests/test_rescue_pilot.py` · `tests/test_rescue_migration.py`
* `tests/test_meh2943_rescue_idor.py` — בדיקת בעלות.
* `tests/test_meh3586_rescue_offer_detail.py` · `frontend/__tests__/RescueOfferPage.test.jsx` — דף הסל: ארבעת המצבים ומה מוסתר ב-404.
* `tests/test_meh3593_pickup_note.py` — «הוראות איסוף» על נקודת האיסוף: שמירה, ניקוי, PUT בלי השדה לא מוחק, עסק אחר לא כותב, הדף והמייל (MEH-3593).
* `tests/test_meh2679_rescue_utc_times.py` · `tests/test_meh2808_rescue_bag_window.py` — חלון האיסוף.
* `frontend/__tests__/AdminRescueMetrics.test.jsx` — מספרי הפיילוט באדמין.
* `tests/test_meh3698_rescue_history.py` — `GET /rescue/orders/history`: כל השריונים של הקונה מכל יום, עם שם בית העסק, לרשימה האחת «ההזמנות שלי» (MEH-3698). בלי קוד האיסוף.
* `tests/test_meh3702_rescue_tomorrow.py` — סל של מחר: פרסום, שריון, רשימות, המייל «מחר», ותזכורת הבוקר (MEH-3702).
* `tests/test_meh3703_rescue_schedule.py` · `frontend/__tests__/RescueSchedule.test.jsx` — הלוח הקבוע: ימים, דילוג, ביטול ביד שלא חוזר, מעבר שעון, בעלות, והשורה והדף (MEH-3703).
* `frontend/__tests__/RescueSimplerScreens.test.jsx` — המסכים הפשוטים לבית עסק חדש: אלרגנים מקופלים, «שווי הסל», כרטיס הפרסום קודם כשאין סל בחוץ, שעון 24 שעות (`frontend/components/ui/TimeOfDaySelect.jsx`), שורת ביטול שמציינת את הסל, ושורת «לשאול באיסוף» קבועה לקונים (MEH-3823).
* `tests/test_meh2703_rescue_donated.py` · `tests/test_meh2716_rescue_saving_badge.py` · `tests/test_meh2752_rescue_allergens.py`
* `frontend/__tests__/HubFaq.test.jsx` — «שאלות נפוצות» בתחתית רשימת הסלים (`frontend/components/HubFaq.jsx`): שורה סגורה לכל שאלה, ואותן שאלות ב-JSON-LD של FAQPage (MEH-3737).

**מזהי רישום שזה מכסה.** `rescue_bags`.
