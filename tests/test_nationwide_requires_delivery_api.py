"""
MEH-1879 — every API write path returns 422, not 500, for the contradiction.

CHECK producer_nationwide_requires_delivery landed in 09fbfbe9 (MEH-1849).
Nothing above the DB knew about it, so a payload carrying
delivery_nationwide=true with offers_delivery=false reached Postgres and came
back as an uncaught IntegrityError — a 500 on the admin manual-approval path,
which is DNA-LOCK operational.

Phase 0 inventoried FOUR backend writers. Three can build the payload and each
gets a case here:

  admin POST /admin/producers          — admin.py:195   (create)
  admin PUT  /admin/producers/{id}     — admin.py:275   (bulk setattr)
  owner PUT  /producers/me             — producer_me.py (writable-field set)

The fourth, scripts/seed_demo_business.py:629, sets offers_delivery=True on the
same object and cannot contradict; it has no case here by design.

WHY THE STATUS CODE IS NOT THE WHOLE ASSERTION: a 422 also comes back from
Pydantic for a missing required field, a bad enum, a malformed city list. Each
case therefore asserts the Hebrew detail names THIS contradiction, so a 422
arriving for an unrelated reason cannot be read as the guard working.

Pre-fix behaviour is recorded in the PR body: both admin paths raised
psycopg2.errors.CheckViolation, captured against the merged constraint rather
than reconstructed by stashing.
"""

import pytest

from tests.conftest import auth_header, make_producer, make_user

# The contradiction's message, from services/delivery_validation.py and the two
# schema validators. Asserted as a substring so the three stay honest about
# being one invariant with one wording.
MSG = '"לכל הארץ" מסומן, אבל "משלוחים" לא. סמני "משלוחים", או בטלי את "לכל הארץ".'


@pytest.fixture
def admin(db):
    return make_user(db, email="admin-1879@example.com", role="admin")


def _detail_text(resp) -> str:
    """The DECODED message, not the wire text.

    Two response shapes reach here and both must be readable:
      HTTPException(422, detail=str)  -> {"detail": "<msg>"}          (the routers)
      Pydantic ValueError            -> {"detail": [{"msg": "Value error, <msg>"}]}

    Decoding matters and is not defensive tidying: the copy contains ASCII
    double quotes (it names the two checkboxes by label), and JSON escapes those
    to \\" on the wire. A substring match against `resp.text` therefore FAILS on
    a perfectly correct 422 — which is exactly what happened when this copy
    landed. The previous wording had no quotes, so the shortcut passed by luck.
    """
    body = resp.json()
    detail = body.get("detail")
    if isinstance(detail, str):
        return detail
    return " ".join(item.get("msg", "") for item in detail)


def _assert_contradiction_rejected(resp):
    """422 AND the message that names this contradiction — not merely 422."""
    assert resp.status_code == 422, f"expected 422, got {resp.status_code}: {resp.text}"
    detail = _detail_text(resp)
    assert MSG in detail, f"422 arrived for the wrong reason: {detail}"


def test_admin_create_rejects_contradiction(client, admin):
    """admin.py:195 — create has no stored row, so ProducerCreate validates it."""
    resp = client.post(
        "/admin/producers",
        json={
            "name": "ארצי בלי משלוחים",
            "description": "nationwide scope, delivery declared off",
            "city": "תל אביב",
            "has_physical_location": True,
            "offers_delivery": False,
            "delivery_nationwide": True,
        },
        headers=auth_header(admin),
    )
    _assert_contradiction_rejected(resp)


def test_admin_update_rejects_contradiction(client, db, admin):
    """admin.py:275 — the exact payload ProducerForm built before MEH-1879:
    tick משלוחים → tick לכל הארץ → untick משלוחים → save."""
    producer = make_producer(db, name="עסק אדמין")

    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={
            "has_physical_location": True,
            "offers_delivery": False,
            "delivery_nationwide": True,
            "delivery_area_cities": [],
            "delivery_excluded_cities": [],
        },
        headers=auth_header(admin),
    )
    _assert_contradiction_rejected(resp)


def test_owner_update_rejects_contradiction(client, db):
    """producer_me.py — the PARTIAL-update shape, which is why the effective-state
    guard exists: offers_delivery is absent from the body entirely, so only the
    stored value (False) makes this a contradiction. A schema validator cannot
    see that; nothing here would fail if the guard were removed from this router
    and left only in schemas.py."""
    producer = make_producer(db, name="עסק בעלים")
    owner = make_user(db, email="owner-1879@example.com", role="producer")
    owner.producer_id = producer.id
    db.commit()

    resp = client.put(
        "/producers/me",
        json={"delivery_nationwide": True},
        headers=auth_header(owner),
    )
    _assert_contradiction_rejected(resp)


def test_control_nationwide_with_delivery_is_accepted(client, db, admin):
    """CONTROL — passes before AND after, so it is not evidence for the change.
    It guards the opposite failure: a guard that rejected the coherent pair too
    would break every real nationwide business."""
    producer = make_producer(db, name="עסק ארצי תקין")

    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={
            "has_physical_location": True,
            "offers_delivery": True,
            "delivery_nationwide": True,
            "delivery_area_cities": [],
            "delivery_excluded_cities": [],
        },
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.delivery_nationwide is True
    assert producer.offers_delivery is True
