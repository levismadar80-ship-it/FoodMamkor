# גילוי וחיפוש

**מה הוא עושה.** כל הדרכים למצוא בית עסק שאינן המפה: רשימת בתי העסק, דפי קטגוריה ואזור, דפי תזונה, החיפוש בעמוד הבית, ובדיקת משלוח לכתובת.

**Routes**
* `frontend/app/[locale]/producers/` — הרשימה.
* `frontend/app/[locale]/producers/[category]/[region]/` — קטגוריה באזור.
* `frontend/app/[locale]/producers/diet/[dietSlug]/` — דפי תזונה.
* `frontend/app/[locale]/` — עמוד הבית והחיפוש בגיבור.

**קבצים מרכזיים**
* `frontend/components/HeroSearch.jsx` — החיפוש בעמוד הבית.
* `frontend/components/SearchCorrectionNote.jsx` — שורת «מציגים תוצאות עבור…» כשהחיפוש תיקן מקלדת הפוכה, ו«לחפש בכל זאת» (MEH-3415).
* `frontend/components/FilterSheet.jsx` — גיליון הסינון בנייד.
* `frontend/lib/diet-pages.js` · `frontend/lib/category-registry.js` — הרישומים שמהם הדפים נגזרים.
* `frontend/lib/category-label.js` — השם המוצג של קטגוריה לפי השפה: `category_names.<slug>` ב-`frontend/messages/`, ושם ה-DB כשאין ערך. ב-/en שמות באנגלית, ב-/he כמו קודם (MEH-3076).
* `frontend/components/DeliveryChecker.jsx` · `frontend/lib/delivery-coverage.js` — בדיקת משלוח.
* `frontend/lib/next-delivery.js` · `frontend/components/NextDeliveryLine.jsx` — «המשלוח הבא: יום שלישי 24.11» מתחת לכל כותרת יום ובתשובת «מגיעים אלייך?» (MEH-3485). תאריך לפי ימי המשלוח של העיר ושעת סגירת ההזמנות כשיש אחת ברורה; בלי תאריך בחופשה או בלי יום.
* `backend/app/services/producer_listing.py` · `backend/app/services/producer_queries.py` — הרשימה, הסינון והמיון בשרת.
* `frontend/lib/use-home-page.js` — הזנת עמוד הבית. כשסינון עיר מחזיר אפס תוצאות, ההצעות מהאזור נטענות לפני שהרשת מתעדכנת, ושתיהן מוצגות יחד (MEH-3821).
* `frontend/app/[locale]/home/HomeProducersGrid.jsx` — רשת בתי העסק בעמוד הבית. השלד מוצג רק בטעינה הראשונה. בשינוי סינון התוצאות הקודמות נשארות מעומעמות עד שהחדשות מגיעות (MEH-3821).
* `backend/app/routers/search.py` · `backend/app/utils/hebrew_search.py` — ההצעות בחיפוש, וכללי ההתאמה בעברית לשני מסלולי החיפוש: תחיליות, סמיכות, ניקוד, ומקלדת בשפה הלא נכונה (`sca` → «דבש», השדה `corrected_query`; MEH-3415).

**Flags.** אין.

**טסטים**
* `frontend/e2e/flows/02-search-producer.spec.ts` · `frontend/e2e/flows/16-producers-browse.spec.ts` · `frontend/e2e/flows/17-producers-search.spec.ts`
* `frontend/e2e/flows/manual/producers.spec.ts` · `frontend/e2e/flows/manual/home-01.spec.ts` · `frontend/e2e/flows/manual/home-02.spec.ts` · `frontend/e2e/flows/manual/home-03.spec.ts` (fixtures: `frontend/e2e/flows/manual/_home-shared.ts`)
* `frontend/e2e/flows/26-delivery-checker.spec.ts` · `frontend/e2e/flows/27-delivery-day-discoverability.spec.ts`
* `frontend/__tests__/HomeGridRefetchKeepsResults.test.jsx` · `frontend/__tests__/HomeRegionFallbackOneCommit.test.jsx` — שינוי סינון בעמוד הבית לא מכווץ את הרשת (MEH-3821).
* `frontend/__tests__/nextDelivery.test.js` (כולל בדיקה מול אורקל סביב החלפת שעון) · `frontend/__tests__/NextDeliveryLine.test.jsx`
* `tests/test_producers_sort.py` · `tests/test_producers_cities_filter.py` · `tests/test_producer_listing_stable_order.py`
* `tests/test_search.py` · `tests/test_hebrew_search.py` · `tests/test_meh3415_search_layout.py` · `frontend/__tests__/HeroSearchLayoutCorrection.test.jsx` — התאמת החיפוש, כולל מקלדת הפוכה.

**מזהי רישום שזה מכסה.** `discovery`, `delivery_areas`, `delivery_checker`, `waitlist`.
