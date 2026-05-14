/**
 * Israeli cities + major neighborhood list for search autocomplete.
 *
 * Used by the shared CitySearch component (see components/CitySearch.jsx).
 * Real consumer list (12 wirings, verified MEH-201, 14 May 2026):
 *   - /map MapClient (desktop + mobile filters)
 *   - /map CityPickerModal
 *   - /neighbor filter
 *   - /group-buys filter
 *   - /experiences filter + /experiences/new form
 *   - /events filter + /producer/dashboard/events/new form
 *   - HomeProductForm (city + neighborhood)
 *   - LocationModal
 *   - /settings (profile city — single field in ProfileTab)
 *
 * Intentionally NOT wired:
 *   - /register/producer step 2 — by design a 3-field minimal form
 *     (producer_name, phone, category_ids); city is filled later from
 *     the dashboard or admin approval, not at signup.
 *
 * The backend also contributes its own cities at runtime via GET /cities
 * (union of producer.city + delivery_areas.city), which CitySearch merges
 * with this static list and de-duplicates. This file is the "known good"
 * baseline so the autocomplete works even before any data exists in the DB.
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
