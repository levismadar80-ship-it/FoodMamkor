"""MEH-2456: GET /cities returns one entry per city, not one per spelling.

Measured on production (MEH-2318, 25/10): the seeded data.gov table spells
Tel Aviv "תל אביב - יפו", while the static list, the site's chips and existing businesses spell it "תל אביב-יפו".
The router de-duplicated on the exact string, so both came back.

DISCRIMINATION: the first two cases are red on origin/staging's
routers/cities.py (two Tel Aviv rows; the table spelling, not the static
one). The third is a control: a table-only city keeps its own spelling.
The fourth pins the shared helper that alerts.py now delegates to.
"""

from tests.conftest import make_producer

TA_TABLE = "תל אביב - יפו"  # production /cities response, 25/10 (MEH-2318)
TA_STATIC = "תל אביב-יפו"  # app/data/cities.py, LocationModal chip


def _seed_official(db, names):
    from app.models.models import City

    for n in names:
        db.add(City(name_he=n))
    db.commit()


def test_table_and_live_spellings_collapse_to_one(client, db):
    _seed_official(db, [TA_TABLE, "תל מונד"])
    make_producer(db, name="מאפיית יפו", city=TA_STATIC, status="approved")

    names = client.get("/cities", params={"q": "תל"}).json()

    tel_aviv = [n for n in names if n in (TA_TABLE, TA_STATIC)]
    assert tel_aviv == [TA_STATIC]
    assert "תל מונד" in names


def test_table_only_spelling_is_answered_in_the_static_spelling(client, db):
    """No business uses Tel Aviv yet: the answer is still the spelling the
    site's own Tel Aviv chip filters on, so a business that picks it from
    "אזורי משלוח" is found by that chip."""
    _seed_official(db, [TA_TABLE])

    assert client.get("/cities", params={"q": "תל אביב"}).json() == [TA_STATIC]


def test_control_city_without_a_static_twin_keeps_the_table_spelling(client, db):
    _seed_official(db, ["ג'סר א-זרקא"])

    assert client.get("/cities", params={"q": "ג'סר"}).json() == ["ג'סר א-זרקא"]


def test_alerts_normalizer_is_the_shared_city_key():
    from app.data.cities import city_key
    from app.routers.alerts import _normalize_city

    for raw in (TA_TABLE, TA_STATIC, "תל אביב – יפו", "  קריית   שמונה ", "", None):
        assert _normalize_city(raw) == city_key(raw)
    assert city_key(TA_TABLE) == city_key(TA_STATIC)
