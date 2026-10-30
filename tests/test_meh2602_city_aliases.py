"""MEH-2602: one city, one entry, one stored spelling.

Measured on staging 29/10: GET /cities?q=בנימינה answered «בנימינה» AND
«בנימינה-גבעת עדה» (a live business typed the short name), and the same for
«מודיעין» / «מודיעין-מכבים-רעות» and «תל אביב» / «תל אביב-יפו». A typed
«קריית ש» found nothing, because the official table spells «קרית» with one
yod. And the official names with a qualifier arrive with the parentheses
flipped: «יקנעם )מושבה(».

Behaviour through the endpoints and the ORM (ADR-032 §3.6).

DISCRIMINATION: against the pre-2602 tree the alias, «קריית», parentheses,
write-canonical and old-row-filter cases are red (two בנימינה rows; []; the
flipped name; the short name stored as typed; the old row missed by the
official-name filter). The two controls pass on both trees.
"""

from sqlalchemy import text

from tests.conftest import make_producer

BENYAMINA = "בנימינה-גבעת עדה"


def _seed_official(db, names):
    from app.models.models import City

    for n in names:
        db.add(City(name_he=n))
    db.commit()


def _store_raw_city(db, producer, city):
    """A row written before canonical_city existed — bypasses the ORM hook."""
    db.execute(
        text("UPDATE producers SET city = :c WHERE id = :i"),
        {"c": city, "i": producer.id},
    )
    db.commit()


def test_alias_and_official_name_are_one_entry(client, db):
    _seed_official(db, [BENYAMINA])
    old = make_producer(db, name="מאפייה ותיקה")
    _store_raw_city(db, old, "בנימינה")

    names = client.get("/cities", params={"q": "בנימינה"}).json()

    assert names == [BENYAMINA]


def test_kiryat_with_two_yods_finds_the_official_one_yod_name(client, db):
    _seed_official(db, ["קרית שמונה", "קרית גת"])

    names = client.get("/cities", params={"q": "קריית ש"}).json()

    assert names == ["קריית שמונה"]


def test_flipped_parentheses_are_repaired(client, db):
    _seed_official(db, ["יקנעם )מושבה(", "יקנעם עילית"])

    names = client.get("/cities", params={"q": "יקנעם"}).json()

    assert "יקנעם (מושבה)" in names
    assert not any(")" in n.split("(")[0] for n in names)


def test_a_new_write_is_stored_in_the_official_spelling(db):
    producer = make_producer(db, name="עסק חדש", city="בנימינה")
    db.refresh(producer)

    assert producer.city == BENYAMINA


def test_official_name_filter_finds_a_row_saved_with_the_short_name(client, db):
    old = make_producer(db, name="מאפייה ותיקה")
    _store_raw_city(db, old, "בנימינה")
    make_producer(db, name="עסק בחדרה", city="חדרה")

    resp = client.get("/producers", params={"city": BENYAMINA})

    assert [p["name"] for p in resp.json()] == ["מאפייה ותיקה"]


def test_control_unknown_city_is_stored_as_typed(db):
    producer = make_producer(db, name="עסק בכפר", city="כפר קטן")
    db.refresh(producer)

    assert producer.city == "כפר קטן"


def test_control_ambiguous_short_name_is_left_alone(db):
    """«יקנעם» could be the moshava or the town — never guessed."""
    producer = make_producer(db, name="עסק ביקנעם", city="יקנעם")
    db.refresh(producer)

    assert producer.city == "יקנעם"
