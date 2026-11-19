# הזמנה באתר («בקשת הזמנה»)

**מה זה עושה.** לקוחה בוחרת מוצרים ומועד בדף בית העסק ושולחת בקשה. בית העסק מאשר, מציע שינוי או דוחה, מלוח הבקרה. התשלום ישירות לבית העסק, לא באתר (ADR-042 §5). הודעות בוואטסאפ ובמייל לשני הצדדים. בית עסק לא מקבל הזמנות עד שמילא «מספר עוסק או ח״פ» בהגדרות, כי החוק מחייב להציג אותו ללקוחה בטופס ההזמנה. ההחלטות, הניסוחים המאושרים והמיקום: MEH-3216.

**Flags.** שרת בלבד: `product_orders_enabled`, נקרא דרך `getattr(settings, "product_orders_enabled", False)` ב-`backend/app/routers/product_orders.py`. כשהוא כבוי כל route עונה 404, ולכן גם הלשונית בלוח הבקרה ודף ההזמנה של הלקוחה נעלמים. אין flag בחזית. כבוי ב-production.

**Routes**
* `frontend/app/[locale]/producer/dashboard/orders/` — לשונית «הזמנות» של בית העסק (פירוט ב-[לוח הבקרה](./producer-dashboard.md)).
* `frontend/app/[locale]/order/[id]/` — דף ההזמנה של הלקוחה. הקישור שבכל הודעה, הטוקן אחרי `#t=`; לא נסרק, בלי Referer.

**קבצים מרכזיים**
* שרת: `backend/app/routers/product_order_buyer.py` (הלקוחה), `backend/app/routers/product_order_business.py` (בית העסק), `backend/app/routers/product_order_offer.py` (חלונות, מוצרים, תפריט), `backend/app/services/product_order_state.py` (הכותב היחיד של סטטוס), `backend/app/services/product_order_menu.py` (המועדים ותקרת ההזמנות לכל מועד), `backend/app/services/product_order_views.py` (מה כל צד רואה), `backend/app/services/product_order_quote.py` (המחיר ודמי המשלוח לפני השליחה, בלי לכתוב כלום).
* חזית: `frontend/lib/product-orders.js`, `frontend/lib/order-status.js`, `frontend/components/dashboard/orders/`.
* היכרות של בית העסק עם הכלי: `frontend/components/producer/OrdersIntroCard.jsx` (כרטיס «חדש» פעם אחת בבית לוח הבקרה, עד שסוגרים, נכנסים או מדליקים) ו-`frontend/components/dashboard/orders/OrderSetupChecklist.jsx` («מה חסר כדי לקבל הזמנות» בראש הלשונית). שורת העמלה בהגדרות מפנה ל-`/terms#pricing`.
* דף בית העסק (שלב 5): `frontend/lib/order-cart.js` ו-`frontend/lib/use-order-cart.js` (הבחירות, נטען רק כש-`takes_site_orders` בדף), `frontend/components/public/OrderStepper.jsx` («הוספה» בשורת מוצר), `frontend/components/public/OrderBar.jsx` (סרגל ההזמנה), `frontend/components/public/OrderSheet.jsx` ו-`frontend/components/public/OrderSheetPhone.jsx` (טופס הבקשה), `frontend/lib/order-sheet.js` (הקריאות לשרת).

**טסטים**
* `tests/test_meh3263_order_route.py`, `tests/test_meh3262_order_windows.py`, `tests/test_meh3296_order_notifications.py`, `tests/test_meh3218_product_orders.py`, `tests/test_meh3216_business_id.py`
* `frontend/__tests__/OrderOnboarding.test.jsx` (הכרטיס, רשימת הצעדים ושורת העמלה)
* `frontend/__tests__/ProductOrdersDashboard.test.jsx`, `frontend/__tests__/OrderStatusPage.test.jsx`, `frontend/__tests__/OrderCart.test.js`, `frontend/__tests__/OrderCartRows.test.jsx`, `frontend/__tests__/OrderSheet.test.jsx`
* `tests/test_meh3216_order_cart.py`, `tests/test_meh3216_order_quote.py`
