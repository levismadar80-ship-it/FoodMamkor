# קבוצות רכישה

**מה הן עושות.** בית עסק פותח קבוצת רכישה עם מחיר רגיל ומחיר קבוצתי, מינימום משתתפים ומועד אחרון. לקוחות מתחייבות לכמות; כשהמינימום מושג הקבוצה ממומנת וממשיכה לקבל מצטרפות עד התקרה או המועד.

> המונח הנעול הוא **«קבוצת רכישה»**. ‏«קנייה קבוצתית», «רכישה קבוצתית» ו«קבוצת רכש» אסורים ונתפסים על ידי `scripts/checks/brand-lexicon-guard.sh` (‏`docs/BRAND.md` §7).

**Routes**
* `frontend/app/[locale]/group-buys/` — הרשימה הציבורית.
* `frontend/app/[locale]/group-buys/[id]/` — קבוצה אחת.
* `frontend/app/[locale]/my-group-buys/` — «הקבוצות שלי»: הקבוצות שהמשתמשת המחוברת הצטרפה אליהן, הפעילות קודם, דרך `GET /users/me/group-buys` (`backend/app/routers/group_buy_mine.py`). קישור בתפריט החשבון (MEH-3609).
* `frontend/app/[locale]/producer/dashboard/group-buys/` — הניהול של בית העסק.
* `frontend/app/[locale]/admin/group-buys/` — המסך של הניהול.

**קבצים מרכזיים**
* `backend/app/routers/group_buys.py` — כל המסלולים. שימו לב להערה על `selectinload`: היא שייכת למסלולי הרשימה ולא ל-`_status_tab_query`, כי מסלול ה-`/counts` חולק את אותה שאילתה ורק סופר.
* `frontend/app/[locale]/group-buys/GroupBuysClient.jsx`
* `frontend/app/[locale]/group-buys/page.js` — הרשימה הראשונה (סטטוס «פתוחה», בלי עיר) והמונים שלה נקראים בשרת דרך `frontend/lib/server-first-json.js` (ISR של 60 שניות), כך שה-HTML הראשון כבר מכיל את הכרטיסים. הלקוח משתמש בהם פעם אחת, וכל רשימה אחריהם נטענת כמו קודם. כשל בשרת = הלקוח טוען בעצמו (MEH-2233).
* `backend/app/services/group_buy_capacity.py` + `backend/app/routers/group_buy_capacity.py` — תקרה ביחידות (`max_units`), עצירת הצטרפות על ידי בית העסק, עריכת כמות, כלל 24 השעות האחרונות (ביטול שמוריד קבוצה שהגיעה ליעד מתחת ליעד — נחסם), רשימת המתנה לקבוצה מלאה ומייל לבית העסק על הצטרפות מאוחרת (MEH-3592).
* `frontend/lib/group-buy-pickup.js` + `frontend/components/group-buy/GroupBuyPickupWindowFields.jsx` — מועד איסוף מובנה (`pickup_starts_at` / `pickup_ends_at`): שדה בטופס וב«הגדרות הצטרפות», שורה בכרטיס ובדף, במייל «הגיעה ליעד», מייל למצטרפים כשהמועד נקבע, משתנה או מוסר (`backend/app/services/group_buy_pickup_text.py`), וכפתור «הוספה ליומן» למצטרפים (`frontend/components/group-buy/GroupBuyCalendarButton.jsx`) (MEH-3597).
* `frontend/components/offer-detail/WhereSection.jsx` + `frontend/components/offer-detail/HowSteps.jsx` — «איסוף ומשלוח» עם מפה ו«איך זה עובד», אותם בלוקים כמו דף הסל (MEH-3597).
* `frontend/components/group-buy/GroupBuySafetyFields.jsx` + `frontend/components/AllergenPicker.jsx` + `frontend/components/offer-detail/AllergenSection.jsx` + `frontend/components/offer-detail/PickupLine.jsx` — מה שיש לסלים: אלרגנים (אותו בורר ואותו בלוק כמו בסל), סניף לאיסוף מתוך הסניפים של בית העסק (`backend/app/services/group_buy_pickup_place.py`, עם מפה בדף), שורת מועד האיסוף מתחת לכותרת, «אפשר לבטל עד…», כל הפרטים בכרטיס לבן אחד, ותזכורת במייל לפני האיסוף (`backend/app/services/group_buy_pickup_reminder.py`, כל יום ב-17:00) (MEH-3610).
* `frontend/components/GroupBuyProductPicker.jsx` — «מילוי ממוצר קיים» בטופס היצירה: בחירה ממלאת את שם המוצר ואת המחיר הרגיל. כשאין לעסק מוצרים, הרשימה לא מוצגת (MEH-3438). הטסט `frontend/__tests__/GroupBuyFulfillmentRequired.test.jsx`.

**Flags.** אין.

**טסטים**
* `tests/test_group_buys_api.py` — ה-API.
* `tests/test_meh0000_group_buys_query_count.py` — ספירת שאילתות: קבוצה אחת וארבע חייבות לעלות אותו מספר SELECT.
* `tests/test_meh3609_my_group_buys.py` · `frontend/__tests__/MyGroupBuysPage.test.jsx` — «הקבוצות שלי» (MEH-3609).
* `tests/test_meh3610_group_buy_bag_parity.py` · `frontend/__tests__/GroupBuyBagParity.test.jsx` — אלרגנים, סניף לאיסוף (רק של בית העסק עצמו), תזכורת האיסוף, סדר הכרטיס (MEH-3610).
* `tests/test_meh3592_group_buy_capacity.py` — תקרות, עצירה, עריכת כמות, 24 השעות, רשימת המתנה, מייל לבית העסק.
* `tests/test_meh2943_group_buy_commit_scoping.py` · `tests/test_meh3128_group_buy_counts.py` · `tests/test_group_buys_cancel_on_delist.py`
* `tests/test_meh3591_missing_emails.py` — מייל אישור ההצטרפות (רק כשההצטרפות לא הביאה ליעד), ומייל «הסיסמה שונתה».
* `frontend/e2e/flows/manual/dashboard-offer-groupbuy.spec.ts`
* `frontend/__tests__/GroupBuysServerFirstList.test.jsx` — ה-HTML מהשרת מכיל את הכרטיסים, הגעה בלי סינון לא שולחת בקשה, ועיר שמוקלדת אחר כך כן (MEH-2233).
* `frontend/__tests__/GroupBuyAfterGoal.test.jsx` — מה רואים כשהקבוצה מגיעה ליעד: «הקבוצה הגיעה ליעד» ומספר המצטרפות לבד (לא «2 מתוך 2», שנקרא כמו «מלאה»), «נשארו N מקומות» כשיש תקרה, באנר «עוד אפשר להצטרף» למי שלא הצטרפה, ו«איך זה עובד» שנשאר כל עוד אפשר להצטרף (MEH-3588).
* `frontend/__tests__/GroupBuyNotAParty.test.jsx` — כרטיס ההצטרפות נושא את ההבהרה «לא צד לעסקה» (`frontend/components/DirectoryDisclaimer.jsx`), כי שם מתחייבים להזמנה.

**מזהי רישום שזה מכסה.** `group_buys`.
