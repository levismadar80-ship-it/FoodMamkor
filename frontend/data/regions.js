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
