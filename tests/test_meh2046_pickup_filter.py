"""
MEH-2046 — ?pickup_points=true, and the fulfillment booleans the card reads.

Two changes are under test, and they are separate claims:

1. Pickup is a PEER of the delivery axes, not another rung on their precedence
   ladder. Before this ticket the ladder ended `elif has_delivery:`, so the
   delivery flag was silently discarded whenever a city or day was also sent.
   A new axis appended the same way would inherit that bug on day one. So the
   delivery result and the pickup result are now OR-ed as a service group.

2. `delivers` / `offers_pickup` are serialized, each equal to the listing
   predicate of the same name. The card used to derive delivery from
   `has_delivery || delivery_count > 0`, which is false for a NATIONWIDE
   business — so it passed the delivery filter and rendered no delivery badge
   (MEH-1836's divergence).

These assert BEHAVIOUR through the public endpoint — which businesses come
back, and what the payload says about them — never that a particular predicate
was written (ADR-032 §3.6). An inert "fix" cannot pass them.

DISCRIMINATION (per .claude/rules/testing.md — every new guard shown failing):
run against the pre-2046 service module, these fail and for the right reason:
  - test_pickup_alone_matches / _excludes_delivery_only  → ?pickup_points= was
    not a param at all; the filter is inert and the delivery-only business
    leaks into the result.
  - test_pickup_survives_an_active_city / _with_delivery_days → the pre-2046
    ladder returns on the city/day branch, so the pickup arm never runs and the
    pickup-only business is missing from the union.
  - test_nationwide_passes_filter_and_reports_delivers → `delivers` is absent
    from the payload; the assertion KeyErrors.
  - test_fulfillment_flags_match_filter_membership → the flags do not exist.
Measured: against the stashed pre-2046 service module this file reports
**15 failed, 4 passed**. The 4 survivors are the three `_control_` tests —
the regression control for "one filter sent → pre-2046 behaviour" — plus
test_business_with_both_yields_one_row, which cannot fail there because the
OR it guards did not yet exist. None of the 4 is offered as evidence for the
change.

Every test seeds at least one business that MUST be excluded. Without that, an
inert filter returns the whole feed and a single-row assertion passes for the
wrong reason — the first draft of this file had four such tests, and they
passed against the unmodified code.

REUSES: tests/test_has_delivery_filter.py (_nationwide helper shape, PARAMS
style); tests/test_meh1509_pickup_serialization.py (ProducerLocation row
factory).
"""

from app.models import ProducerLocation

from tests.conftest import make_producer

PICKUP = {"pickup_points": "true"}
DELIVERY = {"has_delivery": "true"}
BOTH = {"pickup_points": "true", "has_delivery": "true"}


def _names(resp):
    return sorted(p["name"] for p in resp.json())


def _by_name(resp, name):
    return next(p for p in resp.json() if p["name"] == name)


def _with_pickup(db, name, *, city="חיפה", kind="pickup"):
    """A business whose only fulfillment is a self-pickup point."""
    producer = make_producer(db, name=name)
    db.add(
        ProducerLocation(
            producer_id=producer.id,
            kind=kind,
            city=city,
            label="נקודת איסוף",
            lat=32.79,
            lng=34.98,
        )
    )
    db.commit()
    db.refresh(producer)
    return producer


def _nationwide(db, name, delivery_cities=None):
    """Delivers nationwide. Holds delivery_areas rows only when asked."""
    producer = make_producer(db, name=name, delivery_cities=delivery_cities)
    producer.offers_delivery = True
    producer.delivery_nationwide = True
    db.commit()
    db.refresh(producer)
    return producer


# ── the pickup axis on its own ────────────────────────────────────────────────


def test_pickup_alone_matches(client, db):
    # The two non-matching businesses are load-bearing, not scenery: with only
    # a matching row seeded, an INERT filter returns the same single name and
    # the assertion passes for the wrong reason. Every test in this file seeds
    # at least one business that must be excluded, for that reason.
    _with_pickup(db, "איסוף בלבד")
    make_producer(db, name="משלוחים בלבד", delivery_cities=["חיפה"])
    make_producer(db, name="בתיאום אישי")

    resp = client.get("/producers", params=PICKUP)
    assert resp.status_code == 200, resp.text
    assert _names(resp) == ["איסוף בלבד"]


def test_pickup_alone_excludes_delivery_only(client, db):
    """A delivering business with no pickup row must not match the pickup chip."""
    make_producer(db, name="משלוחים בלבד", delivery_cities=["חיפה"])

    resp = client.get("/producers", params=PICKUP)
    assert resp.status_code == 200, resp.text
    assert _names(resp) == []


def test_market_stand_counts_as_pickup(client, db):
    """The ticket scopes the axis to pickup + market_stand deliberately."""
    _with_pickup(db, "דוכן בשוק", kind="market_stand")
    make_producer(db, name="בתיאום אישי")

    resp = client.get("/producers", params=PICKUP)
    assert resp.status_code == 200, resp.text
    assert _names(resp) == ["דוכן בשוק"]


def test_pickup_ignores_the_legacy_column(client, db):
    """`pickup_points` the COLUMN is not the predicate (MEH-1856: no owner can
    write it). A business carrying the column with no matching row must NOT
    match — Sapir measured zero such rows on staging, so this costs nothing
    today and pins the decision against a future re-add."""
    producer = make_producer(db, name="עמודה בלי שורה")
    producer.pickup_points = True
    db.commit()

    resp = client.get("/producers", params=PICKUP)
    assert resp.status_code == 200, resp.text
    assert _names(resp) == []


def test_branch_row_is_not_pickup(client, db):
    """A plain branch is where the business IS, not a self-pickup offer."""
    _with_pickup(db, "סניף רגיל", kind="branch")

    resp = client.get("/producers", params=PICKUP)
    assert resp.status_code == 200, resp.text
    assert _names(resp) == []


# ── the OR union ──────────────────────────────────────────────────────────────


def test_both_flags_return_the_union(client, db):
    """OR within the service group: neither arm may shrink the other."""
    _with_pickup(db, "איסוף בלבד")
    make_producer(db, name="משלוחים בלבד", delivery_cities=["חיפה"])
    make_producer(db, name="בתיאום אישי")

    resp = client.get("/producers", params=BOTH)
    assert resp.status_code == 200, resp.text
    assert _names(resp) == ["איסוף בלבד", "משלוחים בלבד"]


def test_business_with_both_yields_one_row(client, db):
    """Two OR-ed EXISTS predicates, never a JOIN — no fan-out into duplicates.

    This one CANNOT fail against pre-2046 code, and that is a property of what
    it guards rather than a weak assertion: the OR whose fan-out it checks did
    not exist before this ticket, so there was nothing to duplicate. Listed
    with the controls in the module docstring's discrimination note, not among
    the tests offered as evidence for the change.
    """
    producer = make_producer(db, name="גם וגם", delivery_cities=["חיפה"])
    db.add(
        ProducerLocation(
            producer_id=producer.id, kind="pickup", city="חיפה", lat=32.79, lng=34.98
        )
    )
    make_producer(db, name="בתיאום אישי")
    db.commit()

    resp = client.get("/producers", params=BOTH)
    assert resp.status_code == 200, resp.text
    assert _names(resp) == ["גם וגם"]
    assert resp.headers.get("x-total-count") in (None, "1")


def test_zero_service_business_is_excluded_by_either_flag(client, db):
    """"בתיאום אישי" — no delivery, no pickup — is hidden by any service
    filter. That is the exact set the map's explanation line accounts for."""
    make_producer(db, name="בתיאום אישי")

    for params in (PICKUP, DELIVERY, BOTH):
        resp = client.get("/producers", params=params)
        assert resp.status_code == 200, resp.text
        assert _names(resp) == [], params


# ── composition with the city and day axes ────────────────────────────────────


def test_pickup_survives_an_active_city(client, db):
    """The regression this ticket exists to prevent: with a city active, the
    pre-2046 ladder returned before the last rung, so a service flag was
    silently dropped. The pickup arm must still contribute."""
    _with_pickup(db, "איסוף בחיפה", city="חיפה")
    make_producer(db, name="משלוח לחיפה", delivery_cities=["חיפה"])

    resp = client.get("/producers", params={**BOTH, "delivery_city": "חיפה"})
    assert resp.status_code == 200, resp.text
    assert _names(resp) == ["איסוף בחיפה", "משלוח לחיפה"]


def test_pickup_arm_is_city_scoped(client, db):
    """Decision 4: with a city active the pickup arm matches the city on the
    SAME row, so a pickup point elsewhere does not answer a query for חיפה."""
    _with_pickup(db, "איסוף בחיפה", city="חיפה")
    _with_pickup(db, "איסוף בעכו", city="עכו")

    resp = client.get("/producers", params={**PICKUP, "delivery_city": "חיפה"})
    assert resp.status_code == 200, resp.text
    assert _names(resp) == ["איסוף בחיפה"]


def test_pickup_city_scope_is_case_insensitive(client, db):
    """Mirrors _delivery_city_condition's lower()/lower() comparison."""
    _with_pickup(db, "איסוף בhaifa", city="HAIFA")
    _with_pickup(db, "איסוף בעכו", city="עכו")

    resp = client.get("/producers", params={**PICKUP, "delivery_city": "haifa"})
    assert resp.status_code == 200, resp.text
    assert _names(resp) == ["איסוף בhaifa"]


def test_pickup_row_without_a_city_is_not_placed(client, db):
    """ProducerLocation.city is nullable. A pickup point with no city cannot be
    placed, so it must NOT answer a city-scoped query — `lower(NULL) IN (...)`
    is NULL, not true, and the row drops out. The same business still matches
    the unscoped chip, which is the half that keeps this from being a hole."""
    _with_pickup(db, "איסוף בלי עיר", city=None)

    scoped = client.get("/producers", params={**PICKUP, "delivery_city": "חיפה"})
    assert scoped.status_code == 200, scoped.text
    assert _names(scoped) == []

    unscoped = client.get("/producers", params=PICKUP)
    assert unscoped.status_code == 200, unscoped.text
    assert _names(unscoped) == ["איסוף בלי עיר"]


def test_pickup_survives_delivery_days(client, db):
    """Days constrain the delivery arm only — a pickup point has no delivery
    day, so day-filtering must not delete the pickup arm from the union."""
    _with_pickup(db, "איסוף בלבד")
    make_producer(db, name="משלוח בראשון", delivery_cities=["חיפה"])

    resp = client.get("/producers", params={**BOTH, "delivery_days": "ראשון"})
    assert resp.status_code == 200, resp.text
    assert _names(resp) == ["איסוף בלבד", "משלוח בראשון"]


def test_pickup_unscoped_without_a_city(client, db):
    """No city → "has pickup anywhere"; both cities come back."""
    _with_pickup(db, "איסוף בחיפה", city="חיפה")
    _with_pickup(db, "איסוף בעכו", city="עכו")
    make_producer(db, name="בתיאום אישי")

    resp = client.get("/producers", params=PICKUP)
    assert resp.status_code == 200, resp.text
    assert _names(resp) == ["איסוף בחיפה", "איסוף בעכו"]


# ── the serialized fulfillment booleans ───────────────────────────────────────


def test_nationwide_passes_filter_and_reports_delivers(client, db):
    """MEH-1836's divergence, closed. A nationwide business holds ZERO
    delivery_areas rows, so the old card heuristic
    (`has_delivery || delivery_count > 0`) was false while the filter matched
    it — the user filtered for delivery and got a card claiming none."""
    _nationwide(db, "ארצי בלי שורות")

    resp = client.get("/producers", params=DELIVERY)
    assert resp.status_code == 200, resp.text
    assert _names(resp) == ["ארצי בלי שורות"]

    row = _by_name(resp, "ארצי בלי שורות")
    assert row["delivery_count"] == 0, "the operand the old heuristic used"
    assert row["has_delivery"] is False, "the legacy column no predicate reads"
    assert row["delivers"] is True, "…and yet the business does deliver"


def test_fulfillment_flags_match_filter_membership(client, db):
    """The anti-drift guard. `delivers` / `offers_pickup` are computed in
    producer_queries.attach_badge_fields (Python) while the filters are SQL in
    producer_listing — two forms of one rule, because the enrichment module
    cannot import the listing module. This asserts they agree on every shape:
    for each business, the serialized flag must equal actual membership in the
    correspondingly-filtered result set. Change one side only and this reds."""
    _with_pickup(db, "איסוף בלבד")
    make_producer(db, name="משלוחים בלבד", delivery_cities=["חיפה"])
    _nationwide(db, "ארצי")
    make_producer(db, name="בתיאום אישי")
    both = make_producer(db, name="גם וגם", delivery_cities=["עכו"])
    db.add(
        ProducerLocation(
            producer_id=both.id, kind="market_stand", city="עכו", lat=32.9, lng=35.1
        )
    )
    db.commit()

    everything = client.get("/producers")
    assert everything.status_code == 200, everything.text
    assert len(everything.json()) == 5, "all five shapes are in the unfiltered feed"

    delivering = set(_names(client.get("/producers", params=DELIVERY)))
    picking_up = set(_names(client.get("/producers", params=PICKUP)))

    for row in everything.json():
        assert row["delivers"] is (row["name"] in delivering), (
            f"{row['name']}: delivers={row['delivers']} but "
            f"{'in' if row['name'] in delivering else 'not in'} the delivery filter"
        )
        assert row["offers_pickup"] is (row["name"] in picking_up), (
            f"{row['name']}: offers_pickup={row['offers_pickup']} but "
            f"{'in' if row['name'] in picking_up else 'not in'} the pickup filter"
        )

    # The matrix is actually populated — without this, the loop above would
    # pass vacuously on an empty or single-shape feed.
    assert delivering == {"משלוחים בלבד", "ארצי", "גם וגם"}
    assert picking_up == {"איסוף בלבד", "גם וגם"}


def test_flags_are_unscoped_by_an_active_city(client, db):
    """The flags describe the BUSINESS (Label Scope Contract scope=business),
    not the query. A city filter narrows WHICH cards come back; it must not
    change what a returned card claims about itself."""
    both = make_producer(db, name="גם וגם", delivery_cities=["חיפה"])
    db.add(
        ProducerLocation(
            producer_id=both.id, kind="pickup", city="עכו", lat=32.9, lng=35.1
        )
    )
    db.commit()

    resp = client.get("/producers", params={**DELIVERY, "delivery_city": "חיפה"})
    assert resp.status_code == 200, resp.text
    row = _by_name(resp, "גם וגם")
    # The pickup point is in עכו and the query is about חיפה — the card still
    # says the business offers pickup, because it does.
    assert row["offers_pickup"] is True
    assert row["delivers"] is True


# ── regression controls (pass before AND after — not evidence for the change) ──


def test_control_delivery_alone_is_unchanged(client, db):
    make_producer(db, name="משלוחי חיפה", delivery_cities=["חיפה"])
    make_producer(db, name="בתיאום אישי")

    resp = client.get("/producers", params=DELIVERY)
    assert resp.status_code == 200, resp.text
    assert _names(resp) == ["משלוחי חיפה"]


def test_control_delivery_city_alone_is_unchanged(client, db):
    make_producer(db, name="משלוח לחיפה", delivery_cities=["חיפה"])
    make_producer(db, name="משלוח לעכו", delivery_cities=["עכו"])

    resp = client.get("/producers", params={"delivery_city": "חיפה"})
    assert resp.status_code == 200, resp.text
    assert _names(resp) == ["משלוח לחיפה"]


def test_control_no_service_filter_returns_everyone(client, db):
    _with_pickup(db, "איסוף בלבד")
    make_producer(db, name="משלוחים בלבד", delivery_cities=["חיפה"])
    make_producer(db, name="בתיאום אישי")

    resp = client.get("/producers")
    assert resp.status_code == 200, resp.text
    assert _names(resp) == ["איסוף בלבד", "בתיאום אישי", "משלוחים בלבד"]
