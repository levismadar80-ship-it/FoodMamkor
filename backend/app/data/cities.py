"""
Module:   cities
Purpose:  Static Israeli city + neighborhood fallback list (~100 entries)
          used by GET /cities ONLY while the cities table is unseeded
          (MEH-1349 baseline, demoted to fallback in MEH-1343 Chunk A).
Does NOT: Serve seeded environments — there the canonical source is the
          cities TABLE (models.City, ~1,270 official data.gov.il
          localities via scripts/seed_cities.py / POST /admin/seed-cities);
          see routers/cities.py.
Related:  frontend/data/cities.js (ISRAEL_CITIES — the sibling copy),
          backend/app/routers/cities.py, backend/scripts/seed_cities.py
History:  MEH-1349 (creation — GET /cities empty on fresh DB);
          MEH-1343 (demoted to unseeded-env fallback);
          MEH-2456 (city_key + STATIC_SPELLING_BY_KEY: the one comparison
          form for city names, and the spelling /cities prefers).

SYNC DUTY: this list is a byte-for-byte copy of ISRAEL_CITIES in
frontend/data/cities.js. Any city added/removed there must land here in
the same PR, and vice versa.
"""

import re

# MEH-1349: keep ordering identical to frontend/data/cities.js for easy diffing.
ISRAEL_CITIES = [
    # Major cities
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
    # Additional cities (FIXES_V2.md fix 1)
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
    # Major neighborhoods (תל אביב)
    "פלורנטין",
    "נווה צדק",
    "יפו",
    "הצפון הישן",
    "רמת אביב",
    # Major neighborhoods (ירושלים)
    "רחביה",
    "בקעה",
    "קטמון",
    "מושבת הגרמנים",
    "מרכז העיר",
    # Major neighborhoods (חיפה)
    "כרמל",
    "נווה שאנן",
    "הדר הכרמל",
    "רמת הנשיא",
]


# MEH-2456: the ONE comparison form for a city name. Moved here from
# routers/alerts.py (MEH-1360 `_normalize_city`, which now delegates) so
# /cities and the alert targeting cannot drift apart. It folds the notation
# drift the data carries: hyphen / maqaf / en / em dash
# («תל אביב-יפו» vs the data.gov «תל אביב - יפו»), geresh / gershayim,
# whitespace and letter case.
_CITY_SEPARATORS = re.compile(r"[-־–—]")  # hyphen, maqaf, en/em dash
_CITY_QUOTE_MAP = str.maketrans({"׳": "'", "״": '"'})  # geresh, gershayim


def city_key(value: str | None) -> str:
    """Collapse a city string to a comparison form; "" when unusable."""
    if not value:
        return ""
    text = _CITY_SEPARATORS.sub(" ", value.translate(_CITY_QUOTE_MAP))
    return re.sub(r"\s+", " ", text).strip().casefold()


# The site's own filters and chips spell a city the way this list does
# (LocationModal / CityPickerModal «תל אביב-יפו»), so /cities answers in this
# spelling whenever a table or live name has the same key.
STATIC_SPELLING_BY_KEY: dict[str, str] = {city_key(c): c for c in ISRAEL_CITIES}
