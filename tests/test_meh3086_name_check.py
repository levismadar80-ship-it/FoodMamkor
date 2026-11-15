"""MEH-3086 — GET /producer-name-check: "is this business already on the site?"

The registration form asks while the owner types the business name. The route
is anonymous, so what it may reveal is the whole design: LIVE businesses only,
exact name only, and nothing written to the search log.
"""

from app.models.models import SearchQuery
from conftest import make_producer

URL = "/producer-name-check"


def _names(resp):
    assert resp.status_code == 200, resp.text
    return [m["name"] for m in resp.json()["matches"]]


def test_zero_matches_is_an_empty_list(client, db):
    make_producer(db, name="המאפייה של דנה")
    assert _names(client.get(URL, params={"name": "הגבינות של יעל"})) == []


def test_one_live_business_with_the_same_name_is_returned(client, db):
    p = make_producer(db, name="המאפייה של דנה", city="זכרון יעקב")
    resp = client.get(URL, params={"name": "המאפייה של דנה"})
    assert resp.json()["matches"] == [
        {"id": str(p.id), "slug": p.slug, "name": "המאפייה של דנה", "city": "זכרון יעקב"}
    ]


def test_many_matches_are_capped_at_three(client, db):
    for city in ("חדרה", "בנימינה", "פרדס חנה", "זכרון יעקב"):
        make_producer(db, name="לחם הבית", city=city)
    assert _names(client.get(URL, params={"name": "לחם הבית"})) == ["לחם הבית"] * 3


def test_spacing_case_and_quote_marks_do_not_hide_a_match(client, db):
    make_producer(db, name="ג׳חנון  של Savta")
    assert _names(client.get(URL, params={"name": " ג'חנון של savta "})) == [
        "ג׳חנון  של Savta"
    ]


def test_a_page_that_is_not_live_is_never_revealed(client, db):
    for status in ("draft", "pending", "rejected"):
        make_producer(db, name="דבש הגליל", status=status)
    assert _names(client.get(URL, params={"name": "דבש הגליל"})) == []


def test_an_organizer_and_a_test_business_are_never_revealed(client, db):
    """`is_business()` is three clauses; status is only one of them."""
    organizer = make_producer(db, name="שוק האיכרים")
    organizer.kind = "organizer"
    seeded = make_producer(db, name="שוק האיכרים")
    seeded.is_test = True
    db.commit()
    assert _names(client.get(URL, params={"name": "שוק האיכרים"})) == []
    # Control: the same name on a plain live business IS found.
    make_producer(db, name="שוק האיכרים")
    assert _names(client.get(URL, params={"name": "שוק האיכרים"})) == ["שוק האיכרים"]


def test_a_stored_name_with_pasted_invisible_characters_still_matches(client, db):
    stored = "לחם\u00a0הבית\u200f"  # NBSP + right-to-left mark, as pasted
    make_producer(db, name=stored)
    assert _names(client.get(URL, params={"name": "לחם הבית"})) == [stored]
    assert _names(client.get(URL, params={"name": "\u200eלחם\u2009הבית"})) == [stored]


def test_a_nul_byte_is_an_empty_answer_not_a_500(client):
    assert _names(client.get(URL, params={"name": "abc\x00def"})) == []


def test_the_route_is_rate_limited(client):
    codes = [client.get(URL, params={"name": "שם כלשהו"}).status_code for _ in range(31)]
    assert codes[:30] == [200] * 30
    assert codes[30] == 429


def test_only_the_exact_name_matches_not_a_prefix_or_a_part(client, db):
    make_producer(db, name="המאפייה של דנה")
    for typed in ("המאפייה", "המאפייה של", "של דנה", "המאפייה של דנה ובניה"):
        assert _names(client.get(URL, params={"name": typed})) == [], typed


def test_a_name_shorter_than_three_letters_is_not_looked_up(client, db):
    make_producer(db, name="טל")
    assert _names(client.get(URL, params={"name": "טל"})) == []


def test_the_lookup_writes_nothing_to_the_search_log(client, db):
    make_producer(db, name="המאפייה של דנה")
    before = db.query(SearchQuery).count()
    client.get(URL, params={"name": "המאפייה של דנה"})
    client.get(URL, params={"name": "שם שלא קיים"})
    assert db.query(SearchQuery).count() == before
    # Control: the real search DOES log, so a zero delta above means something.
    client.get("/producers", params={"q": "שם שלא קיים"})
    assert db.query(SearchQuery).count() == before + 1


def test_name_over_200_chars_is_refused(client):
    assert client.get(URL, params={"name": "א" * 201}).status_code == 422
