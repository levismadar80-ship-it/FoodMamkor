# מפה

**מה היא עושה.** ‏`/map` מציגה את בתי העסק כסיכות על מפת Leaflet, עם סינון, חיפוש עיר, «קרוב אליי», ומעטפת נפרדת לנייד שבה גיליון תחתון וכרטיס של העסק הנבחר.

**Routes**
* `frontend/app/[locale]/map/` — המסך היחיד.
* הדף נבנה מראש לכל שפה ומתחדש פעם בשעה (`frontend/static-routes.expected.json`, ‏MEH-3628), ולכן ‏`setRequestLocale` ו-`getTranslations({ locale })` ב-`frontend/app/[locale]/map/page.js`. בשרת הוא קורא רק את רשימת בתי העסק לאינדקס הנסתר (`frontend/lib/map-ssr-producers.js`); אם הקריאה נכשלת בזמן ריצה, הדף הקודם נשאר. בלי זה הדף חוזר להיות דינמי, וכל מעבר אליו מציג את מסך הטעינה המלא. מעבר מהתפריט התחתון מתחיל לטעון את הדף כבר בנגיעה (`frontend/lib/use-intent-prefetch.js`).

**קבצים מרכזיים**
* `frontend/app/[locale]/map/MapClient.jsx` — **רכיב מרכזי** (`.claude/central-components.json`). עריכה שלו מחייבת את הפרוטוקול ב-`docs/CENTRAL_COMPONENTS.md`.
* `frontend/app/[locale]/map/components/MapPane.jsx` — הלוח, הפקדים, המקרא.
* `frontend/lib/category-registry.js` · `frontend/lib/category-taxonomy.js` — צבע הסיכה לפי אחת מ-6 הקבוצות והאייקון לפי הקטגוריה עצמה; המקרא מציג את 6 הקבוצות בשפת הקוראת ומסנן קבוצה שלמה (MEH-3076).
* `frontend/app/[locale]/map/components/MobileSheetSelectedCard.jsx` — כרטיס העסק הנבחר בנייד, כולל סגירה ב-Escape.
* `frontend/app/[locale]/map/components/MapPickupPointPanel.jsx` — מתחת לכרטיס הנבחר בנייד, כשהסיכה היא נקודת איסוף או דוכן (MEH-3756): ימי איסוף, הוראות איסוף, Waze ו-Google לנקודה מדויקת, וכפתור «לדף בית העסק». טסט: `frontend/__tests__/MapPickupPointPanel.test.jsx`.
* `frontend/components/MapBottomSheet.jsx` — הגיליון התחתון.
* `frontend/app/[locale]/map/state/useProducersFeed.js` — הזנת הנתונים, עם אימות Zod.
* `frontend/lib/producerPoints.js` — מאיפה מגיעה נקודה לכל בית עסק.
* `frontend/components/MiniMap.jsx` — המפה הקטנה בעמוד בית העסק (ובאירוע / חוויה / הרשמה), והמסך המלא שלה.
* `frontend/lib/use-visual-viewport-box.js` — מצמיד את המסך המלא של המפה הקטנה לחלון הנראה, כדי שכפתור הסגירה לא ייצא מהמסך בדף מוגדל באייפון (MEH-3509).

**Flags.** אין. ה-FAB של הצ'אט כבוי ב-`/map` לפי pathname — ראו `.claude/rules/rtl.md` «Floating-elements corner ownership».

**טסטים**
* `frontend/e2e/flows/05-map-navigation.spec.ts` · `frontend/e2e/flows/15-map-markers.spec.ts`
* `frontend/e2e/flows/manual/map-01.spec.ts` · `frontend/e2e/flows/manual/map-02.spec.ts` (fixtures and `tapMarker`: `frontend/e2e/flows/manual/_map-shared.ts`) — כולל המקרה של MEH-2776, ב-`frontend/e2e/flows/manual/map-02.spec.ts` (פקד אחד, שתי מעטפות).
* `frontend/e2e/flows/manual/map-back-restore.spec.ts` · `frontend/e2e/flows/manual/map-banner-controls.spec.ts`
* `frontend/e2e/flows/07-gps-button.spec.ts` · `frontend/e2e/flows/43-minimap-buttons-over-tiles.spec.ts`
* `frontend/__tests__/MiniMap.test.jsx` — כולל MEH-3509 (המסך המלא מכסה את החלון הנראה).
* `frontend/__tests__/CategoryPinGroupColours.test.jsx` · `frontend/__tests__/useMapFilters.legendGroups.test.js` — צבע לקבוצה, אייקון לקטגוריה, מקרא של 6 קבוצות (MEH-3076).
* `frontend/__tests__/CookedFoodCategoryReady.test.js` · `tests/test_meh3738_cooked_food_slug.py` — הקטגוריה «בישול לפי הזמנה» (נוצרת מהאדמין): אייקון משלה, קבוצת המזווה במפה, שם ושורת דוגמה בשתי השפות, והשם המתועתק `byshvl-lpy-hzmnh` שהחזית מסתמכת עליו (MEH-3738).

**מזהי רישום שזה מכסה.** `map_precision`, `multi_locations` (הצד הציבורי).
