"""MEH-1986 — the five public catalog readers agree on "how many businesses".

The defect these tests exist for, measured 09/08 against production:

    /producers        → 4   (x-total-count: 4)
    /producers/count  → 5
    /producers/cities → 5   (קצרין published with count: 1)

`services/producer_listing.py` default-hides `availability_state ==
"on_vacation"` (MEH-291 Phase 3), and four sibling endpoints filtered on
`status == "approved"` alone. Every assertion below compares a sibling
against the catalog rather than against a hardcoded number, so the tests
cannot pass by agreeing with a wrong constant — the catalog is the
reference, which is the whole point of the fix.

DISCRIMINATION (rules/testing.md → MEH-1619): every test in this file was
run against the pre-fix tree and observed failing. The failures are
per-endpoint and independent — the pre-fix run reddens `/count`, `/cities`,
`/random` and `/stats` separately, so no single test is carrying the others.
The exact pre-fix output is pasted in the PR body.
"""

from datetime import date, timedelta

from app.services.availability_validation import ON_VACATION
from tests.conftest import make_producer


def _vacation(db, producer):
    """Put a producer on vacation — the state the catalog hides by default.

    Uses the constant, not the literal. This PR's argument is one owner for
    the value, and spelling it a second time in the file that asserts that
    would contradict it.

    The two literals further down are deliberate and stay: the
    `?availability_state=on_vacation` query and the response-body assertion
    pin the **wire format**, which is the contract a client depends on. If
    someone changed the constant's value those two SHOULD go red — that is the
    test doing its job, not duplication to be cleaned up.
    """
    producer.availability_state = ON_VACATION
    producer.vacation_until = date.today() + timedelta(days=10)
    db.commit()
    db.refresh(producer)
    return producer


def _catalog_names(client, **params):
    """The catalog's own answer — the reference every sibling is checked against."""
    resp = client.get("/producers", params=params)
    assert resp.status_code == 200
    return {p["name"] for p in resp.json()}


# ---------- /producers/count vs the catalog ----------


def test_count_agrees_with_catalog_when_a_producer_is_on_vacation(client, db):
    """The "X מתוך Y" counter reads Y from /producers/count and the page size
    from the catalog. Before MEH-1986 those two came from different filters,
    so the counter over-reported by exactly the number of vacationing
    businesses. Fails pre-fix: count == 2, catalog == 1.
    """
    make_producer(db, name="חוות פתוחה")
    _vacation(db, make_producer(db, name="חוות בחופשה"))

    count = client.get("/producers/count").json()["count"]
    catalog = _catalog_names(client)

    assert count == len(catalog) == 1
    assert catalog == {"חוות פתוחה"}


def test_count_agrees_with_x_total_count_header(client, db):
    """Same number, two transports. The header is what paginates; /count is
    what refreshes it on tab focus (ProducersClient.jsx:378). They are the
    same claim and must not be able to disagree."""
    make_producer(db, name="פתוחה א")
    make_producer(db, name="פתוחה ב")
    _vacation(db, make_producer(db, name="בחופשה"))

    resp = client.get("/producers")
    header_total = int(resp.headers["X-Total-Count"])
    count = client.get("/producers/count").json()["count"]

    assert header_total == count == 2


def test_count_is_not_zero_when_nobody_is_on_vacation(client, db):
    """Control — the fix must hide vacationing producers, not everyone.

    Without this, a mutation replacing the condition with an always-false
    filter would pass every other assertion in this file (0 == 0). This is
    the "name another world in which the check is green" guard (ORDERS §3.7).
    """
    make_producer(db, name="פתוחה יחידה")

    assert client.get("/producers/count").json()["count"] == 1


# ---------- /producers/cities vs the catalog ----------


def _cities(client):
    resp = client.get("/producers/cities")
    assert resp.status_code == 200
    return {row["city"]: row["count"] for row in resp.json()}


def test_cities_omits_a_city_whose_only_producer_is_on_vacation(client, db):
    """The empty-region guard, extended to availability. A chip for קצרין
    leads to ?city=קצרין, which the catalog answers with zero rows — the
    exact "chip lands on an empty map" case the endpoint's docstring claims
    to prevent. Fails pre-fix: קצרין present with count 1.
    """
    make_producer(db, name="חוות פתוחה", city="תל אביב")
    _vacation(db, make_producer(db, name="גבינות הר הגולן", city="קצרין"))

    cities = _cities(client)

    assert "קצרין" not in cities
    assert cities.get("תל אביב") == 1
    # The claim the chip makes must survive being clicked.
    assert _catalog_names(client, city="קצרין") == set()


def test_cities_count_excludes_vacationers_without_dropping_the_city(client, db):
    """A mixed city keeps its chip and loses one from its count.

    This is the assertion that separates the fix from a plausible wrong one:
    an implementation that dropped any city containing a vacationing producer
    would pass the previous test and fail this one.
    """
    make_producer(db, name="פתוחה בקצרין", city="קצרין")
    _vacation(db, make_producer(db, name="בחופשה בקצרין", city="קצרין"))

    cities = _cities(client)

    assert cities.get("קצרין") == 1
    assert len(_catalog_names(client, city="קצרין")) == 1


def test_cities_counts_sum_to_the_catalog_total(client, db):
    """Whole-set consistency rather than a per-row spot check: the city
    histogram and the catalog total are two views of one set."""
    make_producer(db, name="א", city="חיפה")
    make_producer(db, name="ב", city="חיפה")
    make_producer(db, name="ג", city="ירושלים")
    _vacation(db, make_producer(db, name="ד", city="ירושלים"))
    _vacation(db, make_producer(db, name="ה", city="אילת"))

    cities = _cities(client)

    assert sum(cities.values()) == client.get("/producers/count").json()["count"] == 3
    assert cities == {"חיפה": 2, "ירושלים": 1}


# ---------- /producers/random vs the catalog ----------


def test_random_never_returns_a_producer_the_catalog_hides(client, db):
    """ "הפתיעו אותי" must land somewhere the visitor could have browsed to.

    Drawn 25 times: with one open and one vacationing producer, a pre-fix
    implementation returns the vacationing one with probability ~1 - 2^-25,
    so this is deterministic in practice rather than flaky. Asserted on the
    id, not the count, so a 404 cannot silently satisfy it.
    """
    open_p = make_producer(db, name="חוות פתוחה")
    _vacation(db, make_producer(db, name="חוות בחופשה"))

    drawn = set()
    for _ in range(25):
        resp = client.get("/producers/random")
        assert resp.status_code == 200
        drawn.add(resp.json()["id"])

    assert drawn == {str(open_p.id)}


def test_random_404s_when_every_producer_is_on_vacation(client, db):
    """An all-vacation catalog is an empty catalog for this button. Pre-fix
    it returned 200 and pointed at a hidden business."""
    _vacation(db, make_producer(db, name="היחידה, בחופשה"))

    assert _catalog_names(client) == set()
    assert client.get("/producers/random").status_code == 404


# ---------- /stats vs the catalog ----------


def test_stats_producers_count_agrees_with_the_catalog(client, db):
    """The fourth reader, not named on the card. /stats feeds the home page's
    public business count (use-home-page.js:258). Converting /producers/count
    while leaving this raw would have replaced the old disagreement with a new
    one between the two counters. Fails pre-fix: 2 vs 1.
    """
    make_producer(db, name="חוות פתוחה")
    _vacation(db, make_producer(db, name="חוות בחופשה"))

    stats = client.get("/stats").json()["producers_count"]
    count = client.get("/producers/count").json()["count"]

    assert stats == count == len(_catalog_names(client)) == 1


# ---------- the opt-outs MEH-291 preserved on purpose ----------


def test_explicit_availability_filter_still_opts_back_in(client, db):
    """The default-hide is a default, not a removal. Guards against the fix
    over-reaching into the explicit filter."""
    _vacation(db, make_producer(db, name="חוות בחופשה מפורשת"))

    resp = client.get("/producers?availability_state=on_vacation")
    assert resp.status_code == 200
    assert "חוות בחופשה מפורשת" in {p["name"] for p in resp.json()}


def test_vacationing_producer_is_still_reachable_by_slug(client, db):
    """Hidden from browse surfaces, still on the site — direct slug, favorites
    and search are deliberately untouched (MEH-291). A fix that broke this
    would be hiding businesses, not de-duplicating a count."""
    p = make_producer(db, name="חוות בחופשה", city="קצרין")
    # make_producer does not mint a slug, and the by-slug route 404s on a NULL
    # one — that is a fixture gap, not the behaviour under test, so set it.
    p.slug = "havat-bechufsha"
    _vacation(db, p)

    resp = client.get(f"/producers/by-slug/{p.slug}")
    assert resp.status_code == 200
    assert resp.json()["availability_state"] == "on_vacation"
