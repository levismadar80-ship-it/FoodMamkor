# קבוצות רכישה

**מה הן עושות.** בית עסק פותח קבוצת רכישה עם מחיר רגיל ומחיר קבוצתי, מינימום משתתפים ומועד אחרון. לקוחות מתחייבות לכמות; כשהמינימום מושג הקבוצה ממומנת וממשיכה לקבל מצטרפות עד התקרה או המועד.

> המונח הנעול הוא **«קבוצת רכישה»**. ‏«קנייה קבוצתית», «רכישה קבוצתית» ו«קבוצת רכש» אסורים ונתפסים על ידי `scripts/checks/brand-lexicon-guard.sh` (‏`docs/BRAND.md` §7).

**תשלום מראש (MEH-3895).** בית עסק שבחר ב«איך משלמים לעסק?» את «מראש» או «מקדמה» והדביק קישור תשלום משלו: מי שהצטרפה רואה בדף הקבוצה כפתור «לתשלום» רק אחרי שהקבוצה הגיעה למינימום (ממומנת), כמו ב-Kickstarter וב-Groupon, ולכן «לא משלמים עכשיו» בטופס ההצטרפות נשאר נכון (`groupBuyAwaitsPayment` ב-`frontend/lib/payment-info.js`, הכפתור `frontend/components/ui/PrepayButton.jsx`). בכרטיס של מי שהצטרפה הכפתור תופס את מקום השורה «לא משלמים עכשיו», מתחת לקוד האיסוף, ומבקש לכתוב את הקוד בהערה לתשלום (`frontend/components/group-buy/GroupBuyMemberPanel.jsx`). הקישור נקרא מ-`payment_info` של בית העסק. מייל «להחזיר» לבעלים (MEH-3897, `backend/app/services/prepay_refunds.py`): כשמישהי עוזבת קבוצה שהייתה ממומנת, וכשקבוצה כזו מבוטלת (בית העסק, האדמין, או הסגירה היומית של קבוצה שהייתה ממומנת וירדה מתחת למינימום). קבוצה שלא הגיעה אף פעם למינימום לא שולחת כלום, כי הכפתור לא הוצג בה. שומר: `tests/test_meh3897_prepay_emails.py`.

**Routes**
* `frontend/app/[locale]/group-buys/` — הרשימה הציבורית.
* `frontend/app/[locale]/group-buys/[id]/` — קבוצה אחת. אורחת שלוחצת «כניסה להצטרפות» מקבלת את חלונית הכניסה המשותפת (`frontend/components/LoginPromptModal.jsx`); כניסה עם Google שם מצרפת אותה לבד, באותה כמות, בלי לעזוב את הדף, ו«היכנסו» עדיין לוקח ל-/login וחזרה (MEH-3679).
* `frontend/app/[locale]/my-group-buys/` — היה «הקבוצות שלי» (MEH-3609). מאז MEH-3698 הקבוצות מופיעות ברשימה האחת «ההזמנות שלי» (`frontend/app/[locale]/my-orders/`), שקוראת `GET /users/me/group-buys` (`backend/app/routers/group_buy_mine.py`), והכתובת הזאת מפנה לשם. אין לה שורה משלה בתפריט.
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
* `backend/app/services/group_buy_no_show.py` + `backend/app/routers/group_buy_pickup.py` + `frontend/components/group-buy/GroupBuyPickupList.jsx` — «לא הגיע» כמו בסלים: כל מצטרפת מקבלת קוד איסוף של 4 ספרות (בדף הקבוצה), בית העסק רואה בלוח הבקרה רק קודים וכמויות (לא שמות, MEH-1651) ומסמן אחרי סוף האיסוף «נמסר» או «לא הגיע». אי-הגעה שולחת מייל; שתיים בתוך 30 יום חוסמות הצטרפות לקבוצות (403) עד ששחרור ב-`frontend/app/[locale]/admin/users/`. ספירה נפרדת מהסלים (MEH-3735).
* `frontend/components/GroupBuyProductPicker.jsx` — «מילוי ממוצר קיים» בטופס היצירה: בחירה ממלאת את שם המוצר ואת המחיר הרגיל. כשאין לעסק מוצרים, הרשימה לא מוצגת (MEH-3438). הטסט `frontend/__tests__/GroupBuyFulfillmentRequired.test.jsx`.

**Flags.** אין.

**טסטים**
* `tests/test_group_buys_api.py` — ה-API.
* `tests/test_meh0000_group_buys_query_count.py` — ספירת שאילתות: קבוצה אחת וארבע חייבות לעלות אותו מספר SELECT.
* `tests/test_meh3609_my_group_buys.py` — `GET /users/me/group-buys` (MEH-3609). איך הקבוצות מוצגות ב«ההזמנות שלי»: `frontend/__tests__/MyOrdersPage.test.jsx` (MEH-3698).
* `tests/test_meh3610_group_buy_bag_parity.py` · `frontend/__tests__/GroupBuyBagParity.test.jsx` — אלרגנים, סניף לאיסוף (רק של בית העסק עצמו), תזכורת האיסוף, סדר הכרטיס (MEH-3610).
* `tests/test_meh3592_group_buy_capacity.py` — תקרות, עצירה, עריכת כמות, 24 השעות, רשימת המתנה, מייל לבית העסק.
* `tests/test_meh2943_group_buy_commit_scoping.py` · `tests/test_meh3128_group_buy_counts.py` · `tests/test_group_buys_cancel_on_delist.py`
* `tests/test_meh3591_missing_emails.py` — מייל אישור ההצטרפות (רק כשההצטרפות לא הביאה ליעד), ומייל «הסיסמה שונתה».
* `frontend/e2e/flows/manual/dashboard-offer-groupbuy.spec.ts`
* `frontend/__tests__/GroupBuysServerFirstList.test.jsx` — ה-HTML מהשרת מכיל את הכרטיסים, הגעה בלי סינון לא שולחת בקשה, ועיר שמוקלדת אחר כך כן (MEH-2233).
* `frontend/__tests__/GroupBuysSavedCity.test.jsx` — העיר השמורה (`frontend/lib/use-user-city.js`) מוצעת כאפשרות היחידה כשנוגעים בשדה העיר הריק, ולא ממולאת אחרי הטעינה (MEH-3857, במקום המילוי של MEH-3736). הקלדה מסננת ולא משנה את העיר השמורה. `frontend/e2e/flows/49-saved-city-no-flip.spec.ts` טוען את הדף עם עיר שמורה ובודק שהשדה והצ'יפים לא משתנים אחרי הטעינה.
* `frontend/__tests__/GroupBuyAfterGoal.test.jsx` — מה רואים כשהקבוצה מגיעה ליעד: «הקבוצה הגיעה ליעד» ומספר המצטרפות לבד (לא «2 מתוך 2», שנקרא כמו «מלאה»), «נשארו N מקומות» כשיש תקרה, באנר «עוד אפשר להצטרף» למי שלא הצטרפה, ו«איך זה עובד» שנשאר כל עוד אפשר להצטרף (MEH-3588).
* `tests/test_meh3691_no_self_buying.py` · `frontend/__tests__/GroupBuyOwnerNoJoin.test.jsx` — החשבון של בית העסק לא מצטרף לקבוצה של עצמו ולא נרשם לרשימת ההמתנה שלה: שני המסלולים עונים 403, והדף לא מציג לו טופס הצטרפות או רשימת המתנה. בית עסק אחר מצטרף כמו כל לקוח (MEH-3691).
* `frontend/__tests__/GroupBuyJoinSignInInPlace.test.jsx` · `frontend/__tests__/GroupBuyGuestLogin.test.jsx` — הצטרפות אחרי Google בחלונית, פעם אחת ובכמות שנבחרה; סגירת החלונית לא שולחת כלום; «היכנסו» נושא את הדרך חזרה (MEH-3679, MEH-2982).
* `frontend/__tests__/GroupBuyCommitSummary.test.jsx` — אחרי הצטרפות: שורת «מה הלאה» (פתוחה / הגיעה ליעד עם מועד איסוף / בלי), שורת התשלום, ביטול ככפתור וקישור ל«הקבוצות שלי» (`frontend/components/group-buy/GroupBuyMemberPanel.jsx`, MEH-3734).
* `frontend/__tests__/GroupBuyNotAParty.test.jsx` — כרטיס ההצטרפות נושא את ההבהרה «לא צד לעסקה» (`frontend/components/DirectoryDisclaimer.jsx`), כי שם מתחייבים להזמנה.
* `tests/test_meh3735_group_buy_no_show.py` — קוד האיסוף, רשימת הקודים בלי שמות, IDOR, סימון רק אחרי האיסוף ופעם אחת, מיילים, חסימה אחרי שתיים, שחרור באדמין (MEH-3735).
* `frontend/__tests__/HubFaq.test.jsx` — «שאלות נפוצות» בתחתית הרשימה (`frontend/components/HubFaq.jsx`): שורה סגורה לכל שאלה, ואותן שאלות ב-JSON-LD של FAQPage (MEH-3737).

**מזהי רישום שזה מכסה.** `group_buys`.
