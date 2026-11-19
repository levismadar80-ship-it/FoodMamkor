# דף בית העסק

**מה הוא עושה.** המסך הציבורי של בית עסק: גלריה וסיפור, מוצרים, שעות פתיחה, אזורי משלוח, ערוץ יצירת קשר, תגים, ביקורות, ומה שבית העסק מפעיל (קבוצת רכישה, אירוע, מתכון, שקית). זה המסך שכל שאר האתר מוביל אליו.

**Routes**
* `frontend/app/[locale]/producer/[id]/` — הדף לפי מזהה.
* `frontend/app/[locale]/[slug]/` — אותו דף לפי slug; זו הכתובת הקנונית כשיש slug.
* `frontend/app/[locale]/p/[slug]/` — קישור קצר.
* `frontend/app/[locale]/business-gone/` — בית עסק שהוסר.

**קבצים מרכזיים**
* `frontend/app/[locale]/producer/[id]/components/ProducerHeader.jsx` — כותרת, מצב חופשה.
* `frontend/app/[locale]/producer/[id]/components/ContactCard.jsx` — ערוץ הקשר הראשי, ‏WhatsApp מוכן מראש, קבוצת WhatsApp.
* `frontend/app/[locale]/producer/[id]/components/StickyContactBar.jsx` — הפס הדביק בנייד.
* `frontend/app/[locale]/producer/[id]/components/ProducerSections.jsx` — המוצר המוביל, שאלות ותשובות, עסקים דומים.
* `frontend/components/ProductsSection.jsx` · `frontend/components/public/ProductSheet.jsx` — המוצרים והגיליון.
* `frontend/lib/hours.js` — פענוח שעות ומצב «פתוח עכשיו».
* `frontend/lib/contact-method.js` — הבעלים היחיד של «מה הכפתור הראשי ולאן הוא מוביל».
* `backend/app/routers/producers.py` — הפרט; `backend/app/services/producer_listing.py` — הרשימה.

**Flags.** אין. שקית הצלה בתוך הדף תלויה ב-`NEXT_PUBLIC_RESCUE_BAGS_ENABLED` — ראו [שקיות הצלה](./rescue-bags.md).

**טסטים**
* `frontend/e2e/flows/03-view-producer-detail.spec.ts` · `frontend/e2e/flows/manual/producer-detail.spec.ts`
* `frontend/e2e/flows/04-whatsapp-click.spec.ts` — לחיצת WhatsApp, זרימה קריטית (כלל 5).
* `frontend/e2e/flows/47-products-show-all.spec.ts` — רשימת מוצרים ארוכה וקיפול.
* `tests/test_meh3385_producer_detail_product_order.py` — סדר המוצרים בדף העסק (לפי `position`, בלי מקום בסוף), טיוטות לא מופיעות, ואין מכפלה בין אוספים (MEH-3385).
* `tests/test_meh2602_producer_page_lists.py` · `tests/test_producer_contract_snapshot.py`
* `frontend/__tests__/MiddlewareProducerId404.test.js` — ‏`/producer/<id>` של עסק שלא קיים מחזיר 404 אמיתי מה-middleware (MEH-3024).

**מזהי רישום שזה מכסה.** `gallery_story`, `product_details`, `top_product`, `hours`, `vacation_mode`, `primary_cta`, `wa_prefill`, `product_wa`, `faq_answers`, `wa_group`, `nav_buttons`, `similar_businesses`.
