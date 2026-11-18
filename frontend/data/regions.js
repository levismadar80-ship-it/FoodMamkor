/**
 * MEH-1256: region → cities mapping for the delivery-cities quick-add chips.
 *
 * Every city name here MUST be an exact member of ISRAEL_CITIES
 * (data/cities.js) — the chips feed CitiesAutocomplete's onChange, and a
 * name outside the canonical list would bypass the free-text-forbidden rule
 * (MEH-213). Neighborhoods are intentionally excluded.
 *
 * UI sugar only: regions are NOT persisted as entities — clicking a chip
 * unions the region's cities into the regular delivery_areas list
 * (Shopify/Intuitive Shipping hierarchical-selection pattern). Groupings are
 * colloquial (delivery-zone intuition), not administrative districts; a city
 * missing here (e.g. אריאל) just has no quick-add and is still typeable.
 *
 * Region display names are Hebrew data (like the city names themselves),
 * locked in MEH-1256's acceptance criteria — not UI copy behind i18n.
 *
 * Related: frontend/components/CitiesAutocomplete.jsx (showRegionChips),
 * MEH-974 (consumer region chips on /map — candidate to share this file),
 * MEH-1204 (programmatic SEO category×region — same mapping).
 */
/**
 * MEH-1487: the region whose cities include `city` (exact, trimmed), or
 * null. Powers the home empty-result region fallback — reuses REGIONS, no
 * duplicated mapping. City names in REGIONS are canonical ISRAEL_CITIES
 * members and the delivery_city value comes from the canonical CitySearch,
 * so an exact match is correct.
 *
 * MEH-3334: a city MAY now appear in two regions, and this returns the FIRST
 * in file order. «עתלית» is the only one — it belongs to מועצה אזורית חוף
 * הכרמל and was already listed under `haifa`, so it is in both; `haifa`
 * precedes `carmel_coast` below, which keeps the pre-existing answer
 * (`haifa`) for it. Moving a region above another therefore changes what this
 * returns for a shared city, not just the chip order. The quick-add chips are
 * unaffected: CitiesAutocomplete unions and removes by membership in the
 * clicked region's own list (MEH-1346), not by a city's single owner.
 */
export function findRegionForCity(city) {
  if (!city) return null;
  const needle = String(city).trim();
  if (!needle) return null;
  return REGIONS.find((r) => r.cities.includes(needle)) || null;
}

export const REGIONS = [
  {
    key: "north",
    name: "הצפון",
    cities: [
      "קריית שמונה",
      "צפת",
      "חצור הגלילית",
      "כרמיאל",
      "מעלות-תרשיחא",
      "נהריה",
      "עכו",
      "טבריה",
      "בית שאן",
      "עפולה",
      "נצרת",
      "נצרת עילית",
      "מגדל העמק",
      "סחנין",
      "עראבה",
      "טמרה",
      "יקנעם עילית",
      "קריית טבעון",
    ],
  },
  {
    key: "haifa",
    name: "חיפה והקריות",
    cities: [
      "חיפה",
      "קריית אתא",
      "קריית ביאליק",
      "קריית מוצקין",
      "קריית ים",
      "נשר",
      "טירת כרמל",
      "עתלית",
      "זכרון יעקב",
      "אור עקיבא",
    ],
  },
  {
    key: "carmel_coast",
    name: "חוף הכרמל",
    cities: [
      "עתלית",
      "החותרים",
      "כפר גלים",
      "ניר עציון",
      "עין הוד",
      "עין כרמל",
      "כרם מהר\"ל",
      "גבע כרמל",
      "עופר",
      "עין איילה",
      "צרופה",
      "מגדים",
      "דור",
      "נחשולים",
      "הבונים",
      "נווה ים",
      "שדות ים",
    ],
  },
  {
    key: "sharon",
    name: "השרון",
    cities: [
      "חדרה",
      "אום אל-פחם",
      "בקה אל-גרבייה",
      "נתניה",
      "כפר יונה",
      "תל מונד",
      "כפר סבא",
      "הוד השרון",
      "הרצליה",
      "רמת השרון",
      "ראש העין",
      "טייבה",
      "טירה",
      "קלנסווה",
    ],
  },
  {
    key: "hefer_valley",
    name: "עמק חפר",
    cities: [
      "בית יצחק-שער חפר",
      "כפר ידידיה",
      "כפר ויתקין",
      "כפר חיים",
      "כפר הס",
      "העוגן",
      "מעברות",
      "משמר השרון",
      "נורדיה",
      "צור משה",
      "הדר עם",
      "בית חירות",
      "חופית",
    ],
  },
  {
    key: "gush_dan",
    name: "גוש דן",
    cities: [
      "תל אביב-יפו",
      "רמת גן",
      "גבעתיים",
      "בני ברק",
      "גבעת שמואל",
      "פתח תקווה",
      "אלעד",
      "קריית אונו",
      "יהוד-מונוסון",
      "אור יהודה",
      "חולון",
      "בת ים",
      "כפר קאסם",
    ],
  },
  {
    key: "shfela",
    name: "השפלה",
    cities: [
      "ראשון לציון",
      "נס ציונה",
      "רחובות",
      "באר יעקב",
      "בית דגן",
      "לוד",
      "רמלה",
      "מודיעין-מכבים-רעות",
      "יבנה",
      "גדרה",
      "גן יבנה",
      "בני עי״ש",
    ],
  },
  {
    key: "jerusalem",
    name: "ירושלים והסביבה",
    cities: [
      "ירושלים",
      "בית שמש",
      "מעלה אדומים",
      "אבו גוש",
      "אפרת",
    ],
  },
  {
    key: "south",
    name: "הדרום",
    cities: [
      "אשדוד",
      "אשקלון",
      "קריית מלאכי",
      "קריית גת",
      "באר שבע",
      "רהט",
      "אופקים",
      "נתיבות",
      "שדרות",
      "דימונה",
      "ערד",
      "אילת",
    ],
  },
];
