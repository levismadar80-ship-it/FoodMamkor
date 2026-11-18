# גילוי וחיפוש

**מה הוא עושה.** כל הדרכים למצוא בית עסק שאינן המפה: רשימת בתי העסק, דפי קטגוריה ואזור, דפי תזונה, החיפוש בעמוד הבית, ובדיקת משלוח לכתובת.

**Routes**
* `frontend/app/[locale]/producers/` — הרשימה.
* `frontend/app/[locale]/producers/[category]/[region]/` — קטגוריה באזור.
* `frontend/app/[locale]/producers/diet/[dietSlug]/` — דפי תזונה.
* `frontend/app/[locale]/` — עמוד הבית והחיפוש בגיבור.

**קבצים מרכזיים**
* `frontend/components/HeroSearch.jsx` — החיפוש בעמוד הבית.
* `frontend/components/FilterSheet.jsx` — גיליון הסינון בנייד.
* `frontend/lib/diet-pages.js` · `frontend/lib/category-registry.js` — הרישומים שמהם הדפים נגזרים.
* `frontend/components/DeliveryChecker.jsx` · `frontend/lib/delivery-coverage.js` — בדיקת משלוח.
* `backend/app/services/producer_listing.py` · `backend/app/services/producer_queries.py` — הרשימה, הסינון והמיון בשרת.
* `frontend/lib/use-home-page.js` — הזנת עמוד הבית.

**Flags.** אין.

**טסטים**
* `frontend/e2e/flows/02-search-producer.spec.ts` · `frontend/e2e/flows/16-producers-browse.spec.ts` · `frontend/e2e/flows/17-producers-search.spec.ts`
* `frontend/e2e/flows/manual/producers.spec.ts` · `frontend/e2e/flows/manual/home.spec.ts`
* `frontend/e2e/flows/26-delivery-checker.spec.ts` · `frontend/e2e/flows/27-delivery-day-discoverability.spec.ts`
* `tests/test_producers_sort.py` · `tests/test_producers_cities_filter.py` · `tests/test_producer_listing_stable_order.py`

**מזהי רישום שזה מכסה.** `discovery`, `delivery_areas`, `delivery_checker`, `waitlist`.
