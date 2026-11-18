# מפה

**מה היא עושה.** ‏`/map` מציגה את בתי העסק כסיכות על מפת Leaflet, עם סינון, חיפוש עיר, «קרוב אליי», ומעטפת נפרדת לנייד שבה גיליון תחתון וכרטיס של העסק הנבחר.

**Routes**
* `frontend/app/[locale]/map/` — המסך היחיד.

**קבצים מרכזיים**
* `frontend/app/[locale]/map/MapClient.jsx` — **רכיב מרכזי** (`.claude/central-components.json`). עריכה שלו מחייבת את הפרוטוקול ב-`docs/CENTRAL_COMPONENTS.md`.
* `frontend/app/[locale]/map/components/MapPane.jsx` — הלוח, הפקדים, המקרא.
* `frontend/app/[locale]/map/components/MobileSheetSelectedCard.jsx` — כרטיס העסק הנבחר בנייד, כולל סגירה ב-Escape.
* `frontend/components/MapBottomSheet.jsx` — הגיליון התחתון.
* `frontend/app/[locale]/map/state/useProducersFeed.js` — הזנת הנתונים, עם אימות Zod.
* `frontend/lib/producerPoints.js` — מאיפה מגיעה נקודה לכל בית עסק.

**Flags.** אין. ה-FAB של הצ'אט כבוי ב-`/map` לפי pathname — ראו `.claude/rules/rtl.md` «Floating-elements corner ownership».

**טסטים**
* `frontend/e2e/flows/05-map-navigation.spec.ts` · `frontend/e2e/flows/15-map-markers.spec.ts`
* `frontend/e2e/flows/manual/map.spec.ts` — כולל המקרה של MEH-2776 (פקד אחד, שתי מעטפות).
* `frontend/e2e/flows/manual/map-back-restore.spec.ts` · `frontend/e2e/flows/manual/map-banner-controls.spec.ts`
* `frontend/e2e/flows/07-gps-button.spec.ts` · `frontend/e2e/flows/43-minimap-buttons-over-tiles.spec.ts`

**מזהי רישום שזה מכסה.** `map_precision`, `multi_locations` (הצד הציבורי).
