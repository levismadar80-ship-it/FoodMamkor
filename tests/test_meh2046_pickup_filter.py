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


# ── MEH-2060: the SERIALIZED pickup_points field, not just the filter ─────────
#
# The tests above prove the ?pickup_points=true FILTER already ignores the
# column (MEH-2046). These prove the field every response body carries —
# DeliveryBlock.jsx, ProducerSections.jsx, ProducerDetail.jsx and
# AdminProducersTable.jsx all still read `producer.pickup_points` directly —
# is now derived the same way, not read off the stored column. The three
# states the card's DoD names explicitly: row-without-column,
# column-without-row, both.


def test_pickup_points_field_true_with_row_and_no_column(client, db):
    """A pickup row with the legacy column at its False default must still
    serialize pickup_points=True — this is the case that used to be silently
    dropped (a producer whose only fulfillment signal is a location row, and
    whose owner has no write path to the column at all per MEH-1856)."""
    producer = _with_pickup(db, "רק שורה")
    assert producer.pickup_points is False, "the column itself is untouched"

    resp = client.get("/producers")
    assert resp.status_code == 200, resp.text
    row = _by_name(resp, "רק שורה")
    assert row["pickup_points"] is True
    assert row["pickup_points"] == row["offers_pickup"], (
        "single source of truth — the two fields must never disagree"
    )


def test_pickup_points_field_false_with_column_and_no_row(client, db):
    """The mirror of test_pickup_ignores_the_legacy_column, but on the
    serialized field instead of the filter — a stale True column with no
    backing row must read False, not leak the column's own value."""
    producer = make_producer(db, name="עמודה בלי שורה שוב")
    producer.pickup_points = True
    db.commit()

    resp = client.get("/producers")
    assert resp.status_code == 200, resp.text
    row = _by_name(resp, "עמודה בלי שורה שוב")
    assert row["pickup_points"] is False
    assert row["pickup_points"] == row["offers_pickup"]


def test_pickup_points_field_true_with_both_row_and_column(client, db):
    """Both present → True. NOT discriminating on its own — the stale column
    happens to already agree with the derived value here, so pre-fix code
    (which just read the column) passes this one too. Kept as a third matrix
    cell and a consistency check (pickup_points == offers_pickup even in the
    agreeing case); the discriminating coverage for "column lies" is the two
    tests above, where old and new code diverge."""
    producer = _with_pickup(db, "שניהם")
    producer.pickup_points = True  # matches the row — coincidental, not asserted
    db.commit()

    resp = client.get("/producers")
    assert resp.status_code == 200, resp.text
    row = _by_name(resp, "שניהם")
    assert row["pickup_points"] is True
    assert row["pickup_points"] == row["offers_pickup"]


def test_pickup_points_field_false_with_neither(client, db):
    """Baseline: no row, no column override → reads False. Same caveat as
    above — pre-fix code (reading the False-default column) also passes this,
    so it's a sanity/regression check for the matrix's fourth cell, not
    evidence for the fix on its own."""
    make_producer(db, name="שום דבר")

    resp = client.get("/producers")
    assert resp.status_code == 200, resp.text
    row = _by_name(resp, "שום דבר")
    assert row["pickup_points"] is False
    assert row["offers_pickup"] is False


def test_pickup_points_field_on_producer_detail_endpoint(client, db):
    """The public detail endpoint (ProducerDetail.jsx/ProducerSections.jsx/
    DeliveryBlock.jsx's actual data source) goes through a SEPARATE query
    builder from the listing above (producers.py, not producer_listing.py) —
    assert it independently rather than trusting the listing's coverage to
    imply it."""
    producer = _with_pickup(db, "פרטים")

    resp = client.get(f"/producers/{producer.id}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["pickup_points"] is True


def test_pickup_points_field_on_admin_producers_list(client, db):
    """AdminProducersTable.jsx's own endpoint (admin.py, ProducerAdminOut) —
    a third, independent code path that never called attach_badge_fields
    before this ticket. Proven failing pre-fix: before MEH-2060,
    list_producers returned the raw column with no eager-load of `locations`
    at all, so a pickup-row-only business here would have serialized
    pickup_points=False — the exact drift this ticket exists to close."""
    from tests.conftest import auth_header, make_user

    admin = make_user(db, role="admin", email="meh2060-admin@example.com")
    _with_pickup(db, "אדמין רואה איסוף")
    make_producer(db, name="אדמין בלי איסוף")

    resp = client.get(
        "/admin/producers",
        params={"search": "אדמין"},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text
    rows = {r["name"]: r for r in resp.json()}
    assert rows["אדמין רואה איסוף"]["pickup_points"] is True
    assert rows["אדמין בלי איסוף"]["pickup_points"] is False


def test_admin_update_does_not_write_pickup_points_column(client, db):
    """The admin PUT payload can still send pickup_points (ProducerForm.jsx's
    checkbox is unchanged, out of scope for this ticket) — assert the bulk
    setattr no longer persists it to the column, mirroring the existing
    delivery_cities no-op-pop this line was modeled on."""
    from tests.conftest import auth_header, make_user

    admin = make_user(db, role="admin", email="meh2060-admin2@example.com")
    producer = make_producer(db, name="לא נכתב")
    assert producer.pickup_points is False

    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"pickup_points": True},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text
    # The response reads False despite the payload claiming True — this
    # producer has no ProducerLocation row, so the derived value is False
    # regardless of what the (no-op'd) write payload said.
    assert resp.json()["pickup_points"] is False

    db.refresh(producer)
    assert producer.pickup_points is False, (
        "the column itself must be untouched by the write — "
        "if this is True, the payload reached setattr and the pop failed"
    )


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
    day, so day-filtering must not delete the pickup arm from the union.

    The third business is the exclusion witness, and this test went in without
    one: both of the others match (make_producer hardcodes
    `delivery_day="ראשון"`, conftest.py:334), so a filter that returned the
    whole feed produced this exact list and the assertion passed for the wrong
    reason. It discriminated against the pre-2046 ladder but not against an
    inert service group — two different failure modes, and the module docstring
    claims coverage of both. Caught by the CI reviewer on PR #2855, after a
    correction pass over this same file had already fixed four siblings.
    """
    _with_pickup(db, "איסוף בלבד")
    make_producer(db, name="משלוח בראשון", delivery_cities=["חיפה"])
    make_producer(db, name="בתיאום אישי")

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


def test_control_delivery_days_alone_is_unchanged(client, db):
    """The `delivery_days` rung moved from an inline `.filter()` to a held
    `delivery_scope_cond`. Logically identical, but the docstring above promises
    a control for EVERY refactored branch and this one had none — the promise
    was covering two of four. (tests/test_meh1645_delivery_day_filter.py is the
    real depth here; this is the isolation guard for the refactor itself.)"""
    make_producer(db, name="משלוח בראשון", delivery_cities=["חיפה"])
    _with_pickup(db, "איסוף בלבד")
    make_producer(db, name="בתיאום אישי")

    resp = client.get("/producers", params={"delivery_days": "ראשון"})
    assert resp.status_code == 200, resp.text
    # Pickup alone must NOT satisfy a day filter when no pickup flag is sent.
    assert _names(resp) == ["משלוח בראשון"]


def test_control_delivery_cities_alone_is_unchanged(client, db):
    """Same reasoning for the `delivery_cities` region-fallback rung."""
    make_producer(db, name="משלוח לחיפה", delivery_cities=["חיפה"])
    make_producer(db, name="משלוח לאילת", delivery_cities=["אילת"])
    _with_pickup(db, "איסוף בלבד")

    resp = client.get(
        "/producers", params=[("delivery_cities", "חיפה"), ("delivery_cities", "עכו")]
    )
    assert resp.status_code == 200, resp.text
    assert _names(resp) == ["משלוח לחיפה"]


def test_control_no_service_filter_returns_everyone(client, db):
    _with_pickup(db, "איסוף בלבד")
    make_producer(db, name="משלוחים בלבד", delivery_cities=["חיפה"])
    make_producer(db, name="בתיאום אישי")

    resp = client.get("/producers")
    assert resp.status_code == 200, resp.text
    assert _names(resp) == ["איסוף בלבד", "בתיאום אישי", "משלוחים בלבד"]
