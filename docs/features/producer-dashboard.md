# לוח הבקרה של בית העסק

**מה הוא עושה.** המסך שבו בית עסק מנהל הכול: עריכת הדף, תובנות, והכלים. ארבע לשוניות, וכל כלי יושב איפה שהתדירות שלו אומרת — יומי בבית, שבועי בלשונית, חד-פעמי ב«כלים».

**Routes**
* `frontend/app/[locale]/producer/dashboard/` — הבית.
* `frontend/app/[locale]/producer/dashboard/edit/` · `frontend/app/[locale]/producer/dashboard/insights/` · `frontend/app/[locale]/producer/dashboard/tools/` — הלשוניות.
* `frontend/app/[locale]/producer/dashboard/preview/` · `frontend/app/[locale]/producer/dashboard/whats-new/` · `frontend/app/[locale]/producer/dashboard/qr-card/`
* `frontend/app/[locale]/producer/dashboard/orders/` — «הזמנות» (הזמנה באתר, MEH-3316): לשונית שנייה עם מונה, רק כשבשרת `PRODUCT_ORDERS_ENABLED` דולק. הרכיבים ב-`frontend/components/dashboard/orders/`, הקריאות ב-`frontend/lib/product-orders.js`, הטסט `frontend/__tests__/ProductOrdersDashboard.test.jsx`.

**קבצים מרכזיים**
* `frontend/lib/business-features.js` — הרישום שמכתיב מה קיים ואיפה זה יושב (`dashboard: { home, href }`).
* `frontend/app/[locale]/producer/dashboard/edit/LocationsEditor.jsx` — מיקומים ואזורי משלוח.
* `frontend/app/[locale]/producer/dashboard/insights/page.js` — תובנות.
* `backend/app/routers/producer_me.py` — כל המספרים שהלוח מציג.
* `frontend/lib/producer-completeness.js` · `frontend/components/ProfileCompletenessCard.jsx`

**Flags.** `PRODUCT_ORDERS_ENABLED` (צד שרת) — מדליק את לשונית «הזמנות» ואת השורה שלה בכרטיס «מה מחכה לך».

**טסטים**
* `frontend/__tests__/DashboardPlacementGuard.test.js` — **השומר**: כל עמוד בלוח חייב מקום ברישום, קישור נכנס, ולכל היותר שתי הקשות מהבית.
* `frontend/__tests__/BusinessFeaturesRegistry.test.js` — **השומר ההפוך** (MEH-3416): כל קובץ עורך תחת `frontend/app/[locale]/producer/dashboard/edit/` רשום ב-`codeRef` של כלי, או ב-`EDITOR_FILES_WITHOUT_TOOL` עם סיבה.
* `frontend/e2e/flows/manual/dashboard-shell.spec.ts` · `dashboard-edit.spec.ts` · `dashboard-edit-cards.spec.ts` · `dashboard-locations.spec.ts` · `dashboard-products.spec.ts` · `dashboard-trust-cards.spec.ts` · `dashboard-availability.spec.ts` · `dashboard-delivery.spec.ts` · `dashboard-vanity-share.spec.ts` (כולם תחת `frontend/e2e/flows/manual/`)
* `tests/test_producer_me_delivery_fields.py` · `tests/test_producers_me_schema.py` · `tests/test_meh2697_availability_confirmed.py`

**מזהי רישום שזה מכסה.** כל קבוצת `insights`, ‏`vanity_link`, ‏`qr_code`, ‏`completeness`, ‏`multi_locations`.
