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

DISCRIMINATION (MEH-1619): all FIVE subject cases below FAIL against the code as
it stood before this ticket — the business is absent from the listing — and pass
after. Verified by running this file against the unfixed sources, and twice more
in isolation: reverting ONLY the importer fix gives `1 failed, 4 passed`, and
reverting ONLY the admin-create fix gives `1 failed, 6 passed`. Those two runs are
what show each site is carried by its own fix rather than riding on the others.

TWO cases here are NOT evidence for the change and say so where they sit: the
control (registration without areas stays out) and the admin explicit-`false`
carve-out. Both pass before AND after. They guard the opposite error — a fix that
flipped the flag on for everyone, or one that overrode an admin's stated `false`.

Sibling scan (`grep -rn "DeliveryArea(" backend/app`) found seven write sites.
They split by whether the payload can state the flag itself — but the split has
to be made per CALLER, not per call site, which is where the first version of
this change went wrong (see below).

CREATE-from-payload, flag DERIVED — five sites, all fixed, all covered here:
`auth.py` upgrade + new-email branches, `create_producer_with_relations` (behind
`POST /producers`), `producer_import.import_rows` (admin CSV), and
`admin_create_producer` (`POST /admin/producers`). The last two are the sharpest:
their rows are born `status="approved"` and are live with no approval step, and
the importer's sheet column K writes the legacy `has_delivery` column that no
delivery predicate consults (MEH-1849).

EDIT, flag left alone — `producer_me.py:97,145` and `admin.py:286`. The owner or
an admin states `offers_delivery` explicitly there (`producer_me.py:387-391`,
policed by `delivery_validation.py:68-74`); deriving would override a deliberate
choice, the opposite bug.

THE TRAP, recorded because it nearly shipped: `admin.py`'s `_apply_delivery_cities`
is called by BOTH the PUT route (edit) and the create route. The first version of
this file classified it as an edit path from its call site and therefore missed a
whole create route; a second reviewer on a different model found it by hitting the
endpoint. Admin-create is also the one create path whose schema DOES carry
`offers_delivery`, so it derives only when the field is UNSTATED — `model_fields_set`,
not a falsy check, since "omitted" and "explicitly false" both arrive as False.
"""

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
    """POST /auth/register/producer — the authenticated upgrade branch (auth.py:557).

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

    resp = client.post("/auth/register/producer", json=body, headers=auth_header(user))
    assert resp.status_code == 200, resp.text

    _approve(db, "משק השדרוג")

    listing = client.get("/producers", params=HAS_DELIVERY)
    assert listing.status_code == 200, listing.text
    assert "משק השדרוג" in _names(listing)


def test_authenticated_create_producer_with_areas_is_discoverable(client, db):
    """POST /producers — `create_producer_with_relations` (producer_queries.py:353).

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


def test_csv_import_with_delivery_areas_is_discoverable(client, db):
    """The admin CSV importer (`producer_import.py`) — the fourth create path.

    Rows land `status="approved"`, so unlike the three signup paths this one puts
    the contradictory business straight in front of consumers with no approval
    step in between.
    """
    from app.models.models import Category
    from app.services.producer_import import import_rows

    # Column layout per producer_import.parse_row (:160-181) — I=category (must
    # MEH-1534), L=delivery areas (comma-split), K=has_delivery.
    row = [
        "מאפיית הייבוא",
        "שרה כהן",
        "0541234567",
        None,
        None,
        None,
        None,
        "חיפה",
        "מאפים",
        None,
        "כן",
        "חיפה, קריית ביאליק",
        None,
        "תיאור הבדיקה",
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    ]
    db.add(Category(name="מאפים", emoji="🥖"))
    db.commit()

    result = import_rows(db, [row], dry_run=False)
    assert result["imported"] == 1, result

    listing = client.get("/producers", params=HAS_DELIVERY)
    assert listing.status_code == 200, listing.text
    assert "מאפיית הייבוא" in _names(listing)


def test_admin_create_with_delivery_cities_is_discoverable(client, db):
    """`POST /admin/producers` — the fifth create path, and the easiest to miss.

    `_apply_delivery_cities` is shared between the PUT route (`admin.py:286`)
    and this CREATE route (`admin.py:211`). Classifying the helper by its call
    site reads "edit path, leave alone" and silently hides that one of its two
    callers creates — which is exactly the mistake the first version of this
    change made. Found by the different-model reviewer, not by the sibling scan.

    Rows here are born `status="approved"`, same immediacy as the CSV importer.
    """
    from tests.conftest import make_category

    admin = make_user(db, email="admin1921@test.com", role="admin")
    cat = make_category(db, name="גבינות בדיקה")

    body = {
        "name": "משק האדמין",
        "city": "חיפה",
        "category_ids": [cat.id],
        "delivery_area_cities": ["חיפה"],
        # offers_delivery deliberately OMITTED — the case that gets derived.
    }
    resp = client.post("/admin/producers", json=body, headers=auth_header(admin))
    assert resp.status_code == 201, resp.text

    listing = client.get("/producers", params=HAS_DELIVERY)
    assert listing.status_code == 200, listing.text
    assert "משק האדמין" in _names(listing)


def test_admin_create_explicit_false_is_not_overridden(client, db):
    """CARVE-OUT — an admin who states `offers_delivery: false` is obeyed.

    This is the boundary that separates the fix from the opposite bug. Unlike
    the four signup schemas, `ProducerAdminCreate` carries the field, so an
    explicit `false` beside delivery cities is a declaration, not an omission —
    and MEH-1848's predicates are right to exclude it.

    It also pins the mechanism: only `model_fields_set` can tell "omitted" from
    "explicitly false" here, because both arrive as `False`. A fix written with
    a plain falsy check would pass the test above and fail this one.
    """
    from tests.conftest import make_category

    admin = make_user(db, email="admin1921b@test.com", role="admin")
    cat = make_category(db, name="גבינות בדיקה ב")

    body = {
        "name": "משק האדמין המסרב",
        "city": "חיפה",
        "category_ids": [cat.id],
        "delivery_area_cities": ["חיפה"],
        "offers_delivery": False,
    }
    resp = client.post("/admin/producers", json=body, headers=auth_header(admin))
    assert resp.status_code == 201, resp.text

    listing = client.get("/producers", params=HAS_DELIVERY)
    assert listing.status_code == 200, listing.text
    assert "משק האדמין המסרב" not in _names(listing)


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
