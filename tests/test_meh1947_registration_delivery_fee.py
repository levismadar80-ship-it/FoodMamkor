"""
MEH-1947 — a per-area delivery fee stated at REGISTRATION must survive to the API.

The write-side twin of MEH-1942. That ticket fixed the reading end: the Zod
nested shape was stripping `delivery_areas[].delivery_fee`, so every city
rendered the producer-level rate and a free-delivery city displayed a charge.
With that closed, the pipe runs from the database to the screen — and the
source is dry, because no registration path ever wrote the column.

`DeliveryAreaCreate` accepts the field (`schemas.py:870-873` — "None = not
stated, 0 = משלוח חינם, positive = the fee") and
`persist_registration_delivery_areas` built its `DeliveryArea` rows from three
of the schema's four fields. The docstring on that helper said so out loud
rather than leaving it silent, and deliberately did not fix it while the reading
end was still open.

WHY THE ASSERTIONS ARE BEHAVIOURAL (ADR-032 §3.6): each case drives the real
registration endpoint and then reads the real public producer document — what a
visitor's browser receives. Asserting that the helper passes a keyword, or that
the ORM object carries an attribute, would assert that the prescribed change was
APPLIED; an inert fix (writing the column somewhere the serializer does not
read, or a serializer that coalesces it away) would pass that and ship the bug.

`0` IS THE CASE THAT MATTERS, and it is not interchangeable with any other
number. `0` means "delivery to this city is free" and is distinct from NULL
("the owner stated nothing, inherit the producer rate") —
`DeliveryBlock.jsx:320` is built on exactly that distinction. A test written
with `delivery_fee: 30` would go green against a fix that wrote `da.delivery_fee
or None`, which silently converts every free city back into an inheriting one.
Case 1 is the free city; case 2 exists so a fix that hardcoded 0 cannot pass.

DISCRIMINATION (MEH-1619): the three subject cases FAIL against the code as it
stands before this ticket — the API returns `delivery_fee: null` for every area
— and pass after. The fourth is a CONTROL and is NOT evidence for the change: it
passes before and after, and guards the opposite error, a fix that turns "not
stated" into 0 and promises free delivery to someone who will be charged.
"""

from tests.conftest import (
    auth_header,
    make_user,
    valid_producer_register_payload,
)

# Regression rule 6: the shared payload defaults `primary_contact_method` to
# "whatsapp", which makes `phone` conditionally required, and the helper carries
# none. Without one the endpoint answers 422 before reaching any delivery-area
# code — and a 422 proves nothing about this ticket. Distinct numbers per case
# so no uniqueness constraint can couple them.
PHONE_FREE = "0541234567"
PHONE_MIXED = "0551234567"
PHONE_CONTROL = "0561234567"
PHONE_UPGRADE = "0571234567"


def _approve(db, producer_name):
    """Registration lands on `pending_whatsapp`. Approving is what puts the row
    in front of a consumer; it is not part of the fix."""
    from app.models.models import Producer

    producer = db.query(Producer).filter(Producer.name == producer_name).first()
    assert producer is not None, "registration did not create the producer row"
    producer.status = "approved"
    db.commit()
    return producer


def _fees_by_city(client, producer_id):
    """The public producer document, read the way a browser reads it."""
    resp = client.get(f"/producers/{producer_id}")
    assert resp.status_code == 200, resp.text
    return {a["city"]: a["delivery_fee"] for a in resp.json()["delivery_areas"]}


# ── subject cases: fail before the fix, pass after ─────────────────────────
def test_free_city_stated_at_registration_survives_as_zero(client, db):
    """THE case. A city registered with `delivery_fee: 0` must come back as 0,
    not null — null makes the client inherit the producer rate and bill for a
    delivery the owner declared free."""
    body = valid_producer_register_payload() | {
        "producer_name": "משק המשלוח החינם",
        "phone": PHONE_FREE,
        "delivery_fee": 25,
        "delivery_areas": [{"city": "חיפה", "delivery_fee": 0}],
    }

    resp = client.post("/auth/register/producer", json=body)
    assert resp.status_code == 200, resp.text
    producer = _approve(db, "משק המשלוח החינם")

    fees = _fees_by_city(client, producer.id)
    assert fees["חיפה"] == 0, "a free city came back as %r" % (fees["חיפה"],)


def test_nonzero_per_area_fee_survives_and_is_not_flattened(client, db):
    """A second case, not a parametrisation of the first: it is what stops a fix
    that hardcodes 0, and it proves the per-area values stay DISTINCT rather
    than all collapsing to one number."""
    body = valid_producer_register_payload() | {
        "producer_name": "משק שני התעריפים",
        "phone": PHONE_MIXED,
        "delivery_fee": 25,
        "delivery_areas": [
            {"city": "חיפה", "delivery_fee": 0},
            {"city": "עכו", "delivery_fee": 30},
        ],
    }

    resp = client.post("/auth/register/producer", json=body)
    assert resp.status_code == 200, resp.text
    producer = _approve(db, "משק שני התעריפים")

    fees = _fees_by_city(client, producer.id)
    assert fees == {"חיפה": 0, "עכו": 30}


def test_upgrade_branch_also_persists_the_fee(client, db):
    """`auth.py:557` — the authenticated upgrade branch. A separate case because
    it is a separate code path; both route through the same helper today, and
    this is what would notice if one stopped."""
    user = make_user(db, email="fee-upgrade@test.com", role="consumer")
    body = valid_producer_register_payload() | {
        "producer_name": "משק השדרוג עם תעריף",
        "phone": PHONE_UPGRADE,
        "delivery_areas": [{"city": "נהריה", "delivery_fee": 0}],
    }

    resp = client.post("/auth/register/producer", json=body, headers=auth_header(user))
    assert resp.status_code == 200, resp.text
    producer = _approve(db, "משק השדרוג עם תעריף")

    fees = _fees_by_city(client, producer.id)
    assert fees["נהריה"] == 0


# ── control: NOT evidence for the change — passes before AND after ─────────
def test_area_with_no_stated_fee_stays_null(client, db):
    """The opposite error, and the more dangerous one. "Not stated" must remain
    NULL so the client inherits the producer rate. A fix that defaulted the
    column to 0 would pass every case above and tell a customer her delivery is
    free when she is about to be charged 25.

    Stated plainly because it matters: this case is green against the broken
    code too. It is a guard, not proof."""
    body = valid_producer_register_payload() | {
        "producer_name": "משק בלי הצהרה",
        "phone": PHONE_CONTROL,
        "delivery_fee": 25,
        "delivery_areas": [{"city": "כרמיאל"}],
    }

    resp = client.post("/auth/register/producer", json=body)
    assert resp.status_code == 200, resp.text
    producer = _approve(db, "משק בלי הצהרה")

    fees = _fees_by_city(client, producer.id)
    assert fees["כרמיאל"] is None
