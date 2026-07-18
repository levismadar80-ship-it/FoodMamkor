/**
 * Israeli cities + major neighborhood list for search autocomplete.
 *
 * Used by the shared CitySearch component (see components/CitySearch.jsx).
 * Real consumer list (10 wirings, verified MEH-201, 14 May 2026; /neighbor + HomeProductForm removed MEH-133):
 *   - /map MapClient (desktop + mobile filters)
 *   - /map CityPickerModal
 *   - /group-buys filter
 *   - /experiences filter + /experiences/new form
 *   - /events filter + /producer/dashboard/events/new form
 *   - LocationModal
 *   - /settings (profile city — single field in ProfileTab)
 *
 * ALSO wired (MEH-1343 header fix — the old "intentionally NOT wired"
 * note was stale since MEH-853):
 *   - /register/producer step 2 ("עסק") — CitySearch feeds form.city.
 *
 * CANONICAL SOURCE (MEH-1343 Chunk A): the backend cities TABLE, seeded
 * with the ~1,270 official data.gov.il localities (one-time per env:
 * backend/scripts/seed_cities.py or POST /admin/seed-cities). GET /cities
 * serves table ∪ live business cities; this static list is only the
 * offline/unseeded baseline that CitySearch merges client-side so the
 * autocomplete works before the backend responds (or on an unseeded env).
 *
 * SYNC DUTY (MEH-1349): backend/app/data/cities.py holds a byte-for-byte
 * copy of ISRAEL_CITIES. Any change here must land there in the same PR.
 * TODO(MEH-1343): the full CBS localities dataset replaces both copies
 * with one canonical source.
 */
export const ISRAEL_CITIES = [
  // Major cities
  "ירושלים",
  "תל אביב-יפו",
  "חיפה",
  "ראשון לציון",
  "פתח תקווה",
  "אשדוד",
  "נתניה",
  "באר שבע",
  "בני ברק",
  "רמת גן",
  "אשקלון",
  "רחובות",
  "בת ים",
  "בית שמש",
  "כפר סבא",
  "הרצליה",
  "חולון",
  "לוד",
  "חדרה",
  "מודיעין-מכבים-רעות",
  "רמלה",
  "נצרת",
  "עפולה",
  "נהריה",
  "טבריה",
  "צפת",
  "דימונה",
  "אילת",
  "קריית גת",
  "אום אל-פחם",
  "אופקים",
  "יבנה",
  "קריית אתא",
  "קריית ביאליק",
  "קריית מוצקין",
  "קריית ים",
  "רהט",
  "הוד השרון",
  "כפר יונה",
  "נס ציונה",
  "קריית שמונה",
  "ערד",
  "מגדל העמק",
  "שדרות",
  "טירת כרמל",
  "יקנעם עילית",
  "זכרון יעקב",
  "עתלית",
  "נשר",
  "קריית טבעון",
  // Additional cities (FIXES_V2.md fix 1)
  "אבו גוש",
  "אבו סנאן",
  "אור יהודה",
  "אור עקיבא",
  "אלעד",
  "אפרת",
  "אריאל",
  "באר יעקב",
  "בית דגן",
  "בית שאן",
  "בני עי״ש",
  "בקה אל-גרבייה",
  "גבעת שמואל",
  "גבעתיים",
  "גדרה",
  "גן יבנה",
  "טייבה",
  "טירה",
  "טמרה",
  "יהוד-מונוסון",
  "כפר קאסם",
  "כרמיאל",
  "מעלה אדומים",
  "מעלות-תרשיחא",
  "נצרת עילית",
  "נתיבות",
  "סחנין",
  "עכו",
  "עראבה",
  "קלנסווה",
  "קריית אונו",
  "קריית מלאכי",
  "ראש העין",
  "רמת השרון",
  "תל מונד",
  "חצור הגלילית",
  // Major neighborhoods (תל אביב)
  "פלורנטין",
  "נווה צדק",
  "יפו",
  "הצפון הישן",
  "רמת אביב",
  // Major neighborhoods (ירושלים)
  "רחביה",
  "בקעה",
  "קטמון",
  "מושבת הגרמנים",
  "מרכז העיר",
  // Major neighborhoods (חיפה)
  "כרמל",
  "נווה שאנן",
  "הדר הכרמל",
  "רמת הנשיא",
];
