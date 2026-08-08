"""
MEH-1921 — a business that registers WITH delivery areas must be discoverable
under the משלוח chip.

Every write path that persists `DeliveryArea` rows from a *registration* payload
built them without ever assigning `Producer.offers_delivery`, so the column kept
its `default=False` (models.py:253). MEH-1848 had already made both delivery
predicates conjoin that flag (`producer_listing.py:243,276`), so the resulting
row — delivery_areas present, `offers_delivery=False` — is exactly the state the
filters (correctly) exclude. The owner types her delivery cities in and the site
then answers "she does not deliver".

The DB cannot catch it and says so: `models.py:463-466` records that the pair
"delivery_areas rows + offers_delivery=false" is enforced ONLY in the query
layer; the CHECK covers just `delivery_nationwide AND NOT offers_delivery`.

WHY THE ASSERTIONS ARE BEHAVIOURAL (ADR-032 §3.6): each case drives the real
registration endpoint and then asks the real consumer-facing listing whether the
business shows up under `?has_delivery=true`. Asserting `producer.offers_delivery
is True` would instead assert that the prescribed *change was applied* — an
inert fix (setting the column somewhere the filters do not read) would pass it.

DISCRIMINATION (MEH-1619): the three subject cases below FAIL against the code
as it stood before this ticket — the business is absent from the listing — and
pass after. Verified by running this file against unfixed `auth.py` /
`producer_queries.py`; the run is quoted in the PR body. The control case passes
in BOTH worlds and is labelled as such: it is not evidence for the change, it
guards against the opposite error of flipping the flag on for everyone.

Sibling scan (`grep -rn "DeliveryArea(" backend/app`) found seven write sites.
The three exercised here are the registration/creation paths, which derive the
flag from the payload. The other four are EDIT paths — `producer_me.py:97,145`
and `admin.py:109` replace areas on an existing business whose owner or an admin
sets `offers_delivery` explicitly (`producer_me.py:387-391`, `admin.py:197`,
guarded by `delivery_validation.py:68-74`), and `producer_import.py:304` is the
admin CSV importer. Deriving the flag there would OVERRIDE an explicit choice,
so they are deliberately untouched — see the PR body.
"""

import pytest

from tests.conftest import (
    auth_header,
    make_user,
    valid_producer_register_payload,
)

HAS_DELIVERY = {"has_delivery": "true"}

AREAS = [{"city": "חיפה"}, {"city": "קריית ביאליק"}]

# Regression rule 6: `primary_contact_method="whatsapp"` (the shared payload's
# default) makes `phone` conditionally required, and the shared helper does not
# carry one — so every case must supply it or the endpoint answers 422 before
# reaching the delivery-area code at all. A 422 would prove nothing about this
# ticket; the first run of this file returned exactly that, on three of four
# cases, and is the reason this constant exists rather than an inline literal.
# Distinct numbers per case so no uniqueness check can couple them.
PHONE_NEW_EMAIL = "0501234567"
PHONE_UPGRADE = "0521234567"
PHONE_CONTROL = "0531234567"


def _names(resp):
    return [p["name"] for p in resp.json()]


def _approve(db, producer_name):
    """Registration lands on `pending_whatsapp`; the public listing shows only
    approved rows. Approving is what puts the business in front of a consumer,
    which is the state this ticket is about — it is not part of the fix."""
    from app.models.models import Producer

    producer = db.query(Producer).filter(Producer.name == producer_name).first()
    assert producer is not None, "registration did not create the producer row"
    producer.status = "approved"
    db.commit()
    return producer


# ── subject cases: fail before the fix, pass after ─────────────────────────
def test_new_email_registration_with_areas_is_discoverable(client, db):
    """POST /auth/register/producer — the password/new-email branch (auth.py:675)."""
    body = valid_producer_register_payload() | {
        "producer_name": "משק המייל החדש",
        "phone": PHONE_NEW_EMAIL,
        "delivery_areas": AREAS,
    }

    resp = client.post("/auth/register/producer", json=body)
    assert resp.status_code == 200, resp.text

    _approve(db, "משק המייל החדש")

    listing = client.get("/producers", params=HAS_DELIVERY)
    assert listing.status_code == 200, listing.text
    assert "משק המייל החדש" in _names(listing)


def test_upgrade_registration_with_areas_is_discoverable(client, db):
    """POST /auth/register/producer — the authenticated upgrade branch (auth.py:552).

    A separate case, not a parametrisation: the two branches are independent
    code paths that each build their own `DeliveryArea` rows, so a fix applied
    to only one would pass the other test and fail this one.
    """
    user = make_user(db, email="upgrade@test.com", role="consumer")
    body = valid_producer_register_payload() | {
        "producer_name": "משק השדרוג",
        "phone": PHONE_UPGRADE,
        "delivery_areas": AREAS,
    }
    for field in ("email", "name", "password"):
        body.pop(field, None)

    resp = client.post(
        "/auth/register/producer", json=body, headers=auth_header(user)
    )
    assert resp.status_code == 200, resp.text

    _approve(db, "משק השדרוג")

    listing = client.get("/producers", params=HAS_DELIVERY)
    assert listing.status_code == 200, listing.text
    assert "משק השדרוג" in _names(listing)


def test_authenticated_create_producer_with_areas_is_discoverable(client, db):
    """POST /producers — `create_producer_with_relations` (producer_queries.py:318).

    Found by the DoD's sibling scan, not named in the ticket: the same
    `for da in data.delivery_areas` loop, the same missing assignment. The
    endpoint is authenticated but open to any logged-in user
    (`producers.py:446-463`), so it is a live write path, not dead code.
    """
    user = make_user(db, email="creator@test.com", role="consumer")
    payload = valid_producer_register_payload()
    body = {
        "name": "משק היצירה",
        "city": "תל אביב",
        "category_ids": payload["category_ids"],
        "delivery_areas": AREAS,
    }

    resp = client.post("/producers", json=body, headers=auth_header(user))
    assert resp.status_code == 201, resp.text

    _approve(db, "משק היצירה")

    listing = client.get("/producers", params=HAS_DELIVERY)
    assert listing.status_code == 200, listing.text
    assert "משק היצירה" in _names(listing)


# ── control: passes before AND after — not evidence for the change ─────────
def test_control_registration_without_areas_stays_out(client, db):
    """CONTROL — the flag is derived from the areas, never switched on blindly.

    Guards the opposite failure: a fix that set `offers_delivery=True` on every
    registration would put a business that never offered delivery under the
    משלוח chip. Green in both worlds by design.
    """
    body = valid_producer_register_payload() | {
        "producer_name": "משק בלי משלוח",
        "phone": PHONE_CONTROL,
        "delivery_areas": [],
    }

    resp = client.post("/auth/register/producer", json=body)
    assert resp.status_code == 200, resp.text

    producer = _approve(db, "משק בלי משלוח")
    assert producer.offers_delivery is False

    listing = client.get("/producers", params=HAS_DELIVERY)
    assert listing.status_code == 200, listing.text
    assert "משק בלי משלוח" not in _names(listing)
