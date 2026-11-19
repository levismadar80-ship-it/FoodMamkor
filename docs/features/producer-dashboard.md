# לוח הבקרה של בית העסק

**מה הוא עושה.** המסך שבו בית עסק מנהל הכול: עריכת הדף, תובנות, והכלים. ארבע לשוניות, וכל כלי יושב איפה שהתדירות שלו אומרת — יומי בבית, שבועי בלשונית, חד-פעמי ב«כלים».

**Routes**
* `frontend/app/[locale]/producer/dashboard/` — הבית.
* `frontend/app/[locale]/producer/dashboard/edit/` · `frontend/app/[locale]/producer/dashboard/insights/` · `frontend/app/[locale]/producer/dashboard/tools/` — הלשוניות.
* `frontend/app/[locale]/producer/dashboard/preview/` · `frontend/app/[locale]/producer/dashboard/whats-new/` · `frontend/app/[locale]/producer/dashboard/qr-card/`
* `frontend/app/[locale]/producer/dashboard/orders/` — «הזמנות» (הזמנה באתר, MEH-3316): לשונית שנייה עם מונה, רק כשבשרת `PRODUCT_ORDERS_ENABLED` דולק. הרכיבים ב-`frontend/components/dashboard/orders/`, הקריאות ב-`frontend/lib/product-orders.js`, הטסט `frontend/__tests__/ProductOrdersDashboard.test.jsx`. כשההזמנות דלוקות ויש לפחות חלון מסירה אחד, כרטיסי ההגדרות והשעות נפתחים מקופלים (`isSetUp`), כך שהלשונית נפתחת על ההזמנות. מתחת להזמנות כרטיס «מוצרים» עם שני מתגים לכל מוצר, «פתוח להזמנה באתר» ו«אזל כרגע» (`frontend/components/dashboard/orders/OrderProductsCard.jsx`, הקריאות ב-`frontend/lib/product-ordering.js`). בלשונית «היום» מופיעה «מה להכין», סיכום ההזמנות המאושרות לפי מוצר (`frontend/components/dashboard/orders/OrderPrepList.jsx`). בכל כרטיס הזמנה יש «וואטסאפ ללקוח». ההגדרה «עד כמה הזמנות בכל מועד (לא חובה)» חלה גם על אישור ידני. הטסט `frontend/__tests__/ProductOrderGaps.test.jsx`. בראש הלשונית «מה חסר כדי לקבל הזמנות» (`frontend/components/dashboard/orders/OrderSetupChecklist.jsx`), ובבית לוח הבקרה כרטיס «חדש» פעם אחת (`frontend/components/producer/OrdersIntroCard.jsx`), במשבצת הכרטיס היחיד: ברוכים הבאים, אחר כך רגע ראשון, אחר כך הכרטיס הזה, ואז «חדש במהמקור». הטסט `frontend/__tests__/OrderOnboarding.test.jsx`.

**קבצים מרכזיים**
* `frontend/lib/business-features.js` — הרישום שמכתיב מה קיים ואיפה זה יושב (`dashboard: { home, href }`).
* `frontend/app/[locale]/producer/dashboard/edit/LocationsEditor.jsx` — מיקומים ואזורי משלוח.
* `frontend/app/[locale]/producer/dashboard/insights/page.js` — תובנות.
* `backend/app/routers/producer_me.py` — כל המספרים שהלוח מציג.
* `frontend/lib/producer-completeness.js` · `frontend/components/ProfileCompletenessCard.jsx`
* `frontend/components/MenuImport.jsx` · `frontend/components/MenuReviewRow.jsx` · `frontend/lib/menu-image.js` — «העלו תפריט» בכרטיס המוצרים (MEH-3430): צילום או PDF של תפריט, השרת קורא אותו עם Claude (`backend/app/services/menu_reader.py`, ‏`backend/app/routers/menu_import.py`), בעלת העסק בודקת ומפרסמת. רצועה עם הסבר כשיש 0–2 מוצרים, כפתור כשיש 3 ומעלה, ושורה ב«מה מחכה לך» כשאין מוצרים בכלל. בלי `ANTHROPIC_API_KEY` הקריאה עונה 503 והמסך מציג את שורת הכישלון.

**Flags.** `PRODUCT_ORDERS_ENABLED` (צד שרת) — מדליק את לשונית «הזמנות» ואת השורה שלה בכרטיס «מה מחכה לך».

**טסטים**
* `frontend/__tests__/DashboardPlacementGuard.test.js` — **השומר**: כל עמוד בלוח חייב מקום ברישום, קישור נכנס, ולכל היותר שתי הקשות מהבית.
* `frontend/__tests__/BusinessFeaturesRegistry.test.js` — **השומר ההפוך** (MEH-3416): כל קובץ עורך תחת `frontend/app/[locale]/producer/dashboard/edit/` רשום ב-`codeRef` של כלי, או ב-`EDITOR_FILES_WITHOUT_TOOL` עם סיבה.
* `frontend/e2e/flows/manual/dashboard-shell.spec.ts` · `dashboard-edit.spec.ts` · `dashboard-edit-cards.spec.ts` · `dashboard-locations.spec.ts` · `dashboard-products.spec.ts` · `dashboard-trust-cards.spec.ts` · `dashboard-availability.spec.ts` · `dashboard-delivery.spec.ts` · `dashboard-vanity-share.spec.ts` (כולם תחת `frontend/e2e/flows/manual/`)
* `tests/test_producer_me_delivery_fields.py` · `tests/test_producers_me_schema.py` · `tests/test_meh2697_availability_confirmed.py`
* `tests/test_meh3430_menu_import.py` · `frontend/__tests__/MenuImport.test.jsx` — העלאת תפריט: בדיקת הבייטים, מגבלות קבצים, 503 בלי AI, כפולים, תקרת 100 המוצרים, ומטריצת המצבים במסך.

**מזהי רישום שזה מכסה.** כל קבוצת `insights`, ‏`vanity_link`, ‏`qr_code`, ‏`completeness`, ‏`multi_locations`.
