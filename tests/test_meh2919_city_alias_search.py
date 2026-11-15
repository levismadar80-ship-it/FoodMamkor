"""MEH-2919 (C5): an everyday city name finds the official locality.

Pilot finding A5 (2 of 6 runs): typing «גבעת עדה» in registration step 2
returned nothing. «בנימינה-גבעת עדה» was findable only by starting with
«בנימינה».

ROOT CAUSE, measured: `GET /cities` matches on a PREFIX only —
`routers/cities.py::_ilike_any` builds `column.ilike(f"{p}%")` — while
`canonical_city` (which owns `CITY_ALIASES`, data/cities.py:181-192) is applied
to the RESULTS (`cities.py` merge loop), never to the QUERY. So the alias table
already knew that «גבעת עדה» means «בנימינה-גבעת עדה» and the search could never
consult it: the alias is not a prefix of the official name.

DISCRIMINATION: against the pre-2919 tree the three alias cases are red
(`[]` instead of the official name). The two controls — the prefix that always
worked, and the one-entry-per-city guarantee of MEH-2456/MEH-2602 — pass on
BOTH trees, so a fix that broke either would still be caught.
"""

from app.models.models import City

from tests.conftest import make_producer

BENYAMINA = "בנימינה-גבעת עדה"
PARDES_HANNA = "פרדס חנה-כרכור"
# The data.gov export spaces its hyphens; our static list does not. Both
# spellings are real and they name the same place (MEH-2318 / MEH-2456).
TEL_AVIV_TABLE = "תל אביב - יפו"
TEL_AVIV_STATIC = "תל אביב-יפו"


def _seed_official(db, names):
    """The official locality table, as scripts/seed_cities.py writes it."""
    for n in names:
        db.add(City(name_he=n))
    db.commit()


# --- the finding -------------------------------------------------------------


def test_everyday_name_finds_the_official_locality(client, db):
    """«גבעת עדה» is the pilot's exact input."""
    _seed_official(db, [BENYAMINA])

    names = client.get("/cities", params={"q": "גבעת עדה"}).json()

    assert names == [BENYAMINA]


def test_a_second_alias_from_a_different_locality(client, db):
    """«כרכור» is the other half of a hyphenated name — also not a prefix."""
    _seed_official(db, [PARDES_HANNA])

    names = client.get("/cities", params={"q": "כרכור"}).json()

    assert names == [PARDES_HANNA]


def test_a_partial_alias_finds_it_too(client, db):
    """An autocomplete is typed one letter at a time. «גבעת ע» has to reach it,
    or the seller gives up before completing the word that would have worked."""
    _seed_official(db, [BENYAMINA])

    names = client.get("/cities", params={"q": "גבעת ע"}).json()

    assert BENYAMINA in names


def test_alias_reaches_the_spelling_the_table_actually_holds(client, db):
    """The official table is the data.gov export, which spaces its hyphens
    («תל אביב - יפו»), while CITY_ALIASES maps to our tight spelling
    («תל אביב-יפו») — data/cities.py:137-139, and TA_TABLE in
    test_meh2456_cities_one_spelling.py, measured off production 25/10.

    Matching an alias target literally therefore finds nothing on the rows that
    actually exist. Seeding the TABLE spelling, not ours, is the whole point of
    this case: a fixture that seeds our own constant would be wrong together
    with the code it is checking.
    """
    _seed_official(db, [TEL_AVIV_TABLE])

    names = client.get("/cities", params={"q": 'ת"א'}).json()

    assert names == [TEL_AVIV_STATIC]


def test_an_alias_hit_does_not_outrank_what_is_being_typed(client, db):
    """An alias target is a guess about what the person meant; a direct prefix
    match is what she is typing. «בנימינה-גבעת עדה» sorts before every «גבעת…»
    alphabetically, so without ranking it becomes suggestion #1 for four
    keystrokes on the way to «גבעתיים»."""
    _seed_official(db, ["גבעת זאב", "גבעתיים", BENYAMINA])

    names = client.get("/cities", params={"q": "גבעת"}).json()

    assert names[0] != BENYAMINA
    assert names.index("גבעת זאב") < names.index(BENYAMINA)
    assert names.index("גבעתיים") < names.index(BENYAMINA)
    assert BENYAMINA in names  # still reachable, just not first


# --- controls: green on BOTH trees ------------------------------------------


def test_control_the_prefix_that_always_worked_still_works(client, db):
    _seed_official(db, [BENYAMINA])

    names = client.get("/cities", params={"q": "בנימינה"}).json()

    assert names == [BENYAMINA]


def test_control_one_entry_per_city_survives(client, db):
    """MEH-2456 / MEH-2602: two rows for the same locality collapse into one.

    The dedupe needs TWO candidate raws with different `city_key`s to have
    anything to do — the official row and a live producer who typed the short
    name. Remove `canonical_city` from the merge and this returns two entries.
    A version of this test that seeded only the official row could not fail:
    with one row in and one row out, the assertion holds whatever the code does.
    """
    _seed_official(db, [BENYAMINA])
    make_producer(db, name="משק גבעת עדה", city="גבעת עדה", status="approved")

    names = client.get("/cities", params={"q": "גבעת עדה"}).json()

    assert names == [BENYAMINA]
