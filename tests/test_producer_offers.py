"""MEH-1823 chunk 2 — producer_offers write + public read.

Lives in tests/ (not backend/tests/, which the ticket named and which does not
exist): the required "Backend tests (pytest)" job runs `pytest tests/` from the
repo root, so this is where the wiring already points.

Two things these tests are careful about, both learned the hard way elsewhere
in this repo:

  * `0` is a value, not an absence. A threshold of 0 must 422 EXPLICITLY rather
    than being read as "no threshold" — the delivery_fee three-value bug
    (MEH-1577 / MEH-1772) is the same shape one column over.
  * An expired offer must not leave the API AT ALL. The test asserts on the
    response body, never on a client-side filter, because the guarantee being
    checked is "the server withheld it".
"""

import uuid
from datetime import date, timedelta

import pytest

from app.models import Producer, ProducerOffer
from app.utils.clock import israel_today
from tests.conftest import auth_header, make_producer, make_user

FUTURE = israel_today() + timedelta(days=30)
PAST = israel_today() - timedelta(days=1)


@pytest.fixture
def owner(db):
    producer = make_producer(db, name="חוות ההטבות")
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def _offer(**overrides):
    base = {
        "offer_type": "free_delivery_above",
        "threshold_value": 10,
        "threshold_unit": "liters",
        "headline": "משלוח חינם בהזמנה גדולה",
        "expires_at": FUTURE.isoformat(),
    }
    base.update(overrides)
    return base


def _put(client, user, offer):
    return client.put(
        "/producers/me", json={"active_offer": offer}, headers=auth_header(user)
    )


# --------------------------------------------------------------------------- #
# The four types — each must round-trip through the API, not just the schema.
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "offer_type,threshold_value,threshold_unit",
    [
        ("free_delivery_above", 150, "ils"),
        ("gift_above", 10, "liters"),
        # Deliberately WITH a threshold. Sapir, 02/08: the threshold is optional
        # for every type and is not gated by type — "first order over ₪150" and
        # "10% off pickup over ₪100" are real offers. If someone later adds a
        # type↔threshold cross-constraint, these two rows are what go red.
        ("first_order", 150, "ils"),
        ("pickup_discount", 100, "ils"),
    ],
)
def test_each_offer_type_round_trips(
    client, db, owner, offer_type, threshold_value, threshold_unit
):
    user, producer = owner
    res = _put(
        client,
        user,
        _offer(
            offer_type=offer_type,
            threshold_value=threshold_value,
            threshold_unit=threshold_unit,
        ),
    )
    assert res.status_code == 200, res.text

    got = client.get(f"/producers/{producer.id}").json()["active_offer"]
    assert got["offer_type"] == offer_type
    assert got["threshold_value"] == threshold_value
    assert got["threshold_unit"] == threshold_unit


def test_offer_without_threshold_is_valid(client, db, owner):
    user, producer = owner
    res = _put(
        client,
        user,
        _offer(offer_type="first_order", threshold_value=None, threshold_unit=None),
    )
    assert res.status_code == 200, res.text
    got = client.get(f"/producers/{producer.id}").json()["active_offer"]
    assert got["threshold_value"] is None
    assert got["threshold_unit"] is None


# --------------------------------------------------------------------------- #
# Rejections — each names the rule it is exercising.
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "bad,reason",
    [
        ({"expires_at": PAST.isoformat()}, "expiry already passed"),
        ({"offer_type": "bogus_type"}, "offer_type outside the closed set"),
        ({"threshold_unit": "tons"}, "threshold_unit outside the closed set"),
        ({"threshold_unit": None}, "value without unit"),
        ({"threshold_value": None}, "unit without value"),
        # 0 must be rejected EXPLICITLY, not silently read as "no threshold".
        ({"threshold_value": 0, "threshold_unit": "ils"}, "threshold of zero"),
        ({"threshold_value": -5, "threshold_unit": "ils"}, "negative threshold"),
        ({"headline": "א" * 61}, "headline over 60 chars"),
        ({"headline": "משלוח חינם 🎁"}, "emoji in headline (Emoji LOCK)"),
        (
            {
                "starts_at": (FUTURE + timedelta(days=1)).isoformat(),
                "expires_at": FUTURE.isoformat(),
            },
            "window closes before it opens",
        ),
        (
            {"starts_at": FUTURE.isoformat(), "expires_at": FUTURE.isoformat()},
            "same-day window",
        ),
    ],
)
def test_invalid_offer_is_rejected(client, db, owner, bad, reason):
    user, _ = owner
    res = _put(client, user, _offer(**bad))
    assert res.status_code == 422, f"{reason} should 422, got {res.status_code}"


def test_headline_at_the_limit_is_accepted(client, db, owner):
    """The boundary in the direction that must NOT fail — 60 is legal, 61 is
    not. Without this, a cap of 0 would pass the rejection test above."""
    user, producer = owner
    res = _put(client, user, _offer(headline="א" * 60))
    assert res.status_code == 200, res.text
    assert len(client.get(f"/producers/{producer.id}").json()["active_offer"]["headline"]) == 60


# --------------------------------------------------------------------------- #
# The expiry guarantee — server-side, not client-side.
# --------------------------------------------------------------------------- #


def test_expired_offer_never_leaves_the_api(client, db, owner):
    """Written straight to the DB, bypassing the schema, because the API cannot
    create an expired offer — which is exactly why this path needs its own
    test: rows expire by the calendar moving, not by anyone writing them."""
    user, producer = owner
    db.add(
        ProducerOffer(
            producer_id=producer.id,
            offer_type="gift_above",
            expires_at=PAST,
            is_active=True,
        )
    )
    db.commit()

    body = client.get(f"/producers/{producer.id}").json()
    assert body["active_offer"] is None, "an expired offer must not be serialized"

    # GET /producers returns a bare list (not {"items": [...]}) — asserted
    # against the real response shape rather than an assumed envelope.
    listing = client.get("/producers").json()
    row = next(p for p in listing if p["id"] == str(producer.id))
    assert row["active_offer"] is None


def test_offer_expiring_today_is_still_live(client, db, owner):
    """`>=`, not `>`. An offer expiring today is live today — the off-by-one
    that would silently shorten every offer by a day."""
    user, producer = owner
    db.add(
        ProducerOffer(
            producer_id=producer.id,
            offer_type="first_order",
            expires_at=israel_today(),
            is_active=True,
        )
    )
    db.commit()
    assert client.get(f"/producers/{producer.id}").json()["active_offer"] is not None


# --------------------------------------------------------------------------- #
# At most one active offer, and the three-valued write contract.
# --------------------------------------------------------------------------- #


def test_second_active_offer_is_refused_by_the_database(db, owner):
    """The unique partial index, exercised directly. The API cannot produce this
    state (the write path deactivates first), so the constraint is the only
    thing standing between a bug in that path and two live offers."""
    from sqlalchemy.exc import IntegrityError

    _, producer = owner
    for _ in range(2):
        db.add(
            ProducerOffer(
                producer_id=producer.id,
                offer_type="first_order",
                expires_at=FUTURE,
                is_active=True,
            )
        )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_writing_a_second_offer_replaces_the_first(client, db, owner):
    user, producer = owner
    assert _put(client, user, _offer(offer_type="gift_above")).status_code == 200
    assert _put(client, user, _offer(offer_type="pickup_discount")).status_code == 200

    got = client.get(f"/producers/{producer.id}").json()["active_offer"]
    assert got["offer_type"] == "pickup_discount"
    # The superseded row survives as history rather than being destroyed.
    rows = db.query(ProducerOffer).filter(ProducerOffer.producer_id == producer.id).all()
    assert len(rows) == 2
    assert sum(1 for r in rows if r.is_active) == 1


def test_explicit_null_deactivates_the_offer(client, db, owner):
    user, producer = owner
    assert _put(client, user, _offer()).status_code == 200
    assert _put(client, user, None).status_code == 200
    assert client.get(f"/producers/{producer.id}").json()["active_offer"] is None


def test_an_unrelated_put_leaves_the_offer_alone(client, db, owner):
    """The reason producer_me consults `model_fields_set` rather than the popped
    value: omitted and explicit-null are different requests. If they collapsed,
    every unrelated dashboard save would silently delete the owner's offer."""
    user, producer = owner
    assert _put(client, user, _offer(offer_type="gift_above")).status_code == 200

    res = client.put(
        "/producers/me", json={"description": "תיאור חדש"}, headers=auth_header(user)
    )
    assert res.status_code == 200, res.text
    still = client.get(f"/producers/{producer.id}").json()["active_offer"]
    assert still is not None and still["offer_type"] == "gift_above"


def test_owner_cannot_write_an_offer_onto_another_business(client, db, owner):
    """IDOR: /producers/me resolves the producer from the token, so a second
    business must be untouched no matter what the first owner sends."""
    user, _ = owner
    other = make_producer(db, name="עסק אחר")
    assert _put(client, user, _offer()).status_code == 200
    assert client.get(f"/producers/{other.id}").json()["active_offer"] is None


# --------------------------------------------------------------------------- #
# Concurrency — the reviewer's finding on PR #2502, reproduced then fixed.
# --------------------------------------------------------------------------- #


def test_concurrent_offer_write_returns_409_not_500(client, db, owner, monkeypatch):
    """Two PUTs racing for the same business must not 500.

    The race is real and was reproduced against a live Postgres with two
    interleaved sessions: both SELECT the active rows before either writes, so
    the second INSERT collides on uq_producer_offers_active_per_producer.

    Reproducing that interleaving inside a single-threaded test would be
    theatre, so this asserts the half that is actually mine — that an
    IntegrityError from the offer INSERT is translated into a 409 rather than
    escaping as a 500. The collision is injected at the flush the handler
    guards; if that try/except is removed, this returns 500 and the test fails.
    """
    from sqlalchemy.exc import IntegrityError

    from app.routers import producer_me as pm

    user, _ = owner
    orig = db.__class__.flush

    def exploding_flush(self, *a, **kw):
        # ONLY the flush that carries the new ProducerOffer explodes. Earlier
        # flushes in the same request (delivery rows, category sync) must behave
        # normally — otherwise the 409 could come from an unrelated failure and
        # the test would pass for the wrong reason.
        if any(isinstance(o, pm.ProducerOffer) for o in self.new):
            raise IntegrityError("INSERT", {}, Exception("duplicate key"))
        return orig(self, *a, **kw)

    monkeypatch.setattr(db.__class__, "flush", exploding_flush)
    res = _put(client, user, _offer())
    assert res.status_code == 409, f"expected 409, got {res.status_code}: {res.text}"


def test_scheduled_offer_is_not_live_before_its_start_date(client, db, owner):
    """The NEAR end of the window, which the first implementation omitted.

    A future starts_at was served as live from the moment the offer was
    created — measured at starts_at 2026-09-01 being returned on 2026-08-02.
    Unreachable through the dashboard (it does not expose starts_at yet), but
    the API accepts it and the revision docstring promises the opposite.
    """
    user, producer = owner
    start = israel_today() + timedelta(days=30)
    res = _put(
        client,
        user,
        _offer(
            offer_type="gift_above",
            starts_at=start.isoformat(),
            expires_at=(start + timedelta(days=30)).isoformat(),
        ),
    )
    assert res.status_code == 200, res.text
    assert client.get(f"/producers/{producer.id}").json()["active_offer"] is None

    # BOTH serialization paths, matching test_expired_offer_never_leaves_the_api
    # above. One property drives both, so this is cheap — but asserting only the
    # detail path would leave the listing half of the window rule uncovered, and
    # asymmetric coverage between two tests of the same property is how a later
    # refactor slips through one of them.
    listing = client.get("/producers").json()
    row = next(p for p in listing if p["id"] == str(producer.id))
    assert row["active_offer"] is None


def test_offer_starting_today_is_live_today(client, db, owner):
    """`<=`, not `<` — the mirror of the expires_at boundary. An offer that
    starts today is live today, or every scheduled offer loses its first day."""
    user, producer = owner
    db.add(
        ProducerOffer(
            producer_id=producer.id,
            offer_type="first_order",
            starts_at=israel_today(),
            expires_at=FUTURE,
            is_active=True,
        )
    )
    db.commit()
    assert client.get(f"/producers/{producer.id}").json()["active_offer"] is not None


def test_same_day_window_at_TODAY_is_422_not_a_500_from_the_db(client, db, owner):
    """`starts_at == expires_at == today` must 422, not reach the DB.

    This pins the INTERACTION of two decisions that were made separately and
    pull in opposite directions:

      * the expiry rule was deliberately relaxed to accept today
        (`expires_at < israel_today()` — an offer expiring today is live today);
      * the migration's CHECK `producer_offer_date_order` is STRICT
        (`expires_at > starts_at`).

    So today/today sits exactly in the gap: it sails past the expiry check on
    the strength of the relaxation, and the only thing standing between it and
    the DB CHECK is the date-order rule in `_validate_offer_shape`.

    MEASURED, not assumed: with the date-order rule carved out for today, this
    request returns **409**, not 500 — `_sync_active_offer` already catches
    IntegrityError and maps it to a conflict. Still the wrong answer (a
    validation error surfacing as a conflict, with the DB as the only guard),
    but the symptom is a 409.

    Why this is its own test rather than another parametrize row: the existing
    "same-day window" case uses FUTURE dates, so it clears the expiry check
    trivially. Both tests go red if `<=` is relaxed to `<` — that construction
    does NOT discriminate between them. The one that does is a carve-out for
    `starts_at == israel_today()`, exactly the shape the expiry relaxation
    invites: under it the FUTURE case still passes and only this one fails.

    Asserting the message, not just the status, because the parametrized case
    checks the code alone.
    """
    user, _ = owner
    today = israel_today()
    res = _put(
        client,
        user,
        _offer(starts_at=today.isoformat(), expires_at=today.isoformat()),
    )
    assert res.status_code == 422, (
        f"today/today must be refused by Pydantic, got {res.status_code} — "
        "a 500 here means the DB CHECK is the only guard left"
    )
    assert "אחרי תאריך ההתחלה" in res.text


def test_is_active_false_cannot_create_an_inactive_row(client, db, owner):
    """`is_active: false` in the payload must not reach the row.

    The field was caller-settable and passed through verbatim, so this body
    took the deactivate-then-insert path and wrote a row that had never been
    active. Visibly that is indistinguishable from `active_offer: null` — no
    badge either way — which is precisely why it could sit there unnoticed,
    accumulating a dead row per call (the unique index is partial, `WHERE
    is_active`, so it does not constrain inactive rows at all).

    `is_active` is no longer a ProducerOfferCreate field. There is no
    `extra="forbid"` on the model, so Pydantic v2 IGNORES the unknown key
    rather than 422-ing it — the request succeeds and produces a normal ACTIVE
    offer. That is the intended contract: an offer object means an active
    offer, and activation belongs to the replace logic.

    Both halves are asserted. "exactly one row, and it is active" is what fails
    under the old passthrough (which wrote is_active=False); "the API serves
    it" is what fails if some future change starts dropping the row instead.
    """
    user, producer = owner
    res = _put(client, user, _offer(is_active=False))
    assert res.status_code == 200, res.text

    rows = db.query(ProducerOffer).filter_by(producer_id=producer.id).all()
    assert len(rows) == 1, f"expected exactly one row, got {len(rows)}"
    assert rows[0].is_active is True, "the payload's is_active=False reached the row"

    served = client.get(f"/producers/{producer.id}").json()["active_offer"]
    assert served is not None, "an offer written as active must leave the API"


# --------------------------------------------------------------------------- #
# MEH-1898 — the fifth type, `custom`.
#
# The point of these three is that `custom` is NOT special anywhere in the
# backend. The whole feature is a one-value widening of the CHECK plus a
# rendering rule on the frontend, and the tests are written to fail if someone
# later "tidies" that into a type-conditional branch.
# --------------------------------------------------------------------------- #


def test_custom_offer_with_a_headline_round_trips(client, db, owner):
    """The happy path: `custom` + the owner's own words, served back verbatim.

    Asserts on the PUBLIC read (`GET /producers/{id}`), not on the row, because
    the headline being stored is not the feature — the headline reaching the
    consumer surface is. OfferBadge renders exactly this string as the offer
    text for `custom`.
    """
    user, producer = owner
    headline = "שני מגשי בורקס במחיר אחד בימי שישי"
    res = _put(
        client,
        user,
        _offer(
            offer_type="custom",
            headline=headline,
            threshold_value=None,
            threshold_unit=None,
        ),
    )
    assert res.status_code == 200, res.text

    served = client.get(f"/producers/{producer.id}").json()["active_offer"]
    assert served["offer_type"] == "custom"
    assert served["headline"] == headline


def test_custom_without_a_headline_is_accepted_by_the_api(client, db, owner):
    """A headline-less `custom` offer is a **200**, and that is deliberate.

    This is the test most likely to be read as documenting a bug, so it is the
    one that most needs to exist. `custom` carries no platform sentence, so an
    empty headline means the offer has no text — and the reflex is to reject it
    at the API. We do not, for the reasons in ProducerOfferCreate's docstring:
    it would be the FIRST type-conditional rule in a model that is uniform by
    an explicit 02/08 decision, and it would buy nothing, because the dashboard
    already requires the headline client-side and OfferBadge renders nothing at
    all for this row.

    If someone adds `if offer_type == "custom" and not headline: raise`, this
    test goes red. That is the alarm working, not a stale test — take it to the
    decision in models.py before changing either.
    """
    user, producer = owner
    res = _put(
        client,
        user,
        _offer(
            offer_type="custom",
            headline=None,
            threshold_value=None,
            threshold_unit=None,
        ),
    )
    assert res.status_code == 200, (
        "a headline-less custom offer must be accepted — the backend is "
        f"uniform across offer_types by design; got {res.status_code}: {res.text}"
    )

    served = client.get(f"/producers/{producer.id}").json()["active_offer"]
    assert served["offer_type"] == "custom"
    assert served["headline"] is None


def test_an_unknown_offer_type_is_422_with_the_hebrew_message(client, db, owner):
    """The closed set stays closed, and says so in Hebrew.

    Two assertions, and the second is the one with teeth. A bare `== 422` would
    pass against a validator that rejected EVERY type, including the four that
    already worked — so this also pins that the message enumerates the live
    vocabulary and that `custom` is inside it. The message is built by
    interpolating OFFER_TYPES, so a type added to the tuple appears here for
    free; a type added to the DB CHECK alone would not, and this is where that
    drift surfaces.
    """
    user, _ = owner
    res = _put(client, user, _offer(offer_type="not_a_real_type"))
    assert res.status_code == 422, res.text
    assert "סוג הטבה חייב להיות אחד מ" in res.text, res.text
    assert "custom" in res.text, (
        "the 422 must enumerate the live vocabulary including `custom` — if "
        "this fails, the message and OFFER_TYPES have drifted apart"
    )
