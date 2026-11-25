"""MEH-3867: POST /cities/match — a pasted list of cities in one request.

Building חוות הפרא (25/11) took ~80 picks in the delivery-cities field, and
three names that are not localities had to be found by eye. The endpoint
answers which pasted names are known (in the canonical spelling the chips and
filters use) and which are not, so the field can add the first and show the
second.

DISCRIMINATION: every case is red before the route exists (404), and each
asserts a different rule: canonical spelling, aliases, dedupe, order,
unmatched kept as typed, the unseeded fallback, and the list cap.
"""

from app.schemas.cities_match import MAX_PASTED_CITIES

TA_TABLE = "תל אביב - יפו"  # production table spelling (MEH-2318)
TA_STATIC = "תל אביב-יפו"  # the chips' spelling


def _seed_official(db, names):
    from app.models.models import City

    for n in names:
        db.add(City(name_he=n))
    db.commit()


def _match(client, names):
    r = client.post("/cities/match", json={"names": names})
    assert r.status_code == 200, r.text
    return r.json()


def test_known_names_come_back_in_the_chip_spelling(client, db):
    _seed_official(db, [TA_TABLE, "חדרה", "קריית שמונה"])

    out = _match(client, ["חדרה", "תל אביב - יפו", "קרית שמונה"])

    assert out == {"matched": ["חדרה", TA_STATIC, "קריית שמונה"], "unmatched": []}


def test_everyday_alias_reaches_the_official_name(client, db):
    _seed_official(db, ["בנימינה-גבעת עדה"])

    assert _match(client, ["גבעת עדה"])["matched"] == ["בנימינה-גבעת עדה"]


def test_unknown_names_are_returned_as_typed_not_dropped(client, db):
    _seed_official(db, ["חדרה"])

    out = _match(client, ["חדרה", " תל מונד ", "קרני שומרון"])

    assert out["matched"] == ["חדרה"]
    assert out["unmatched"] == ["תל מונד", "קרני שומרון"]


def test_duplicates_and_blanks_collapse_and_order_is_kept(client, db):
    _seed_official(db, ["חדרה", "עפולה"])

    out = _match(client, ["עפולה", "", "חדרה", "  ", "עפולה", "xyz", "xyz"])

    assert out == {"matched": ["עפולה", "חדרה"], "unmatched": ["xyz"]}


def test_unseeded_environment_falls_back_to_the_static_list(client, db):
    out = _match(client, ["חיפה", "לא-עיר"])

    assert out == {"matched": ["חיפה"], "unmatched": ["לא-עיר"]}


def test_list_over_the_cap_is_refused(client, db):
    r = client.post("/cities/match", json={"names": ["חיפה"] * (MAX_PASTED_CITIES + 1)})

    assert r.status_code == 422


def test_dash_and_double_space_still_reach_the_city(client, db):
    """Production 25/11: «תל-מונד» and «תל  מונד» returned [] from /cities."""
    _seed_official(db, ["תל מונד"])

    assert _match(client, ["תל-מונד", "תל  מונד"])["matched"] == ["תל מונד"]
    assert client.get("/cities", params={"q": "תל-מונד"}).json() == ["תל מונד"]
    assert client.get("/cities", params={"q": "תל  מו"}).json() == ["תל מונד"]


def test_current_name_reaches_a_row_stored_under_the_old_name(client, db):
    """Production keeps «נצרת עילית»; «נוף הגליל» found nothing (25/11)."""
    _seed_official(db, ["נצרת עילית", "נצרת"])

    assert _match(client, ["נוף הגליל"])["matched"] == ["נוף הגליל"]
    assert client.get("/cities", params={"q": "נוף הג"}).json() == ["נוף הגליל"]


def test_unseeded_search_folds_a_dash_too(client, db):
    assert "תל מונד" in client.get("/cities", params={"q": "תל-מונד"}).json()
