"""
MEH-2100 — the draft → submit-for-review state machine.

Covers, in order:
  1. All THREE producer-creation sites land on `draft`, plus a removal-style
     absence assertion that no creation site writes a queue status.
  2. The submit gate: one case per requirement code, each asserting THAT code
     is named in the 422 — never just "a 422 happened".
  3. The success transition: status flip + tz-aware stamp + admin ping.
  4. 409 on every non-draft status.
  5. Fail-closed: a draft is invisible on the public surfaces.
  6. The admin queue's three-way filter.

WHY THE GATE CASES ARE BUILT SUBTRACTIVELY. Every gate test starts from a
COMPLETE producer and removes exactly one requirement. Building up from an
empty producer instead would 422 for reasons the test never named, and would
keep passing if the requirement under test were deleted from the gate — the
assertion would ride on the other four. Removing one thing from a known-good
whole is what makes each case discriminate.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest

from app.models.models import (
    Category,
    DeliveryArea,
    Producer,
    ProducerCategory,
    Product,
    User,
)
from app.services.submission_gate import (
    MISSING_CATEGORY,
    MISSING_IMAGE,
    MISSING_LOCATION,
    MISSING_PHONE_VERIFIED,
    MISSING_PRODUCT,
    SUBMISSION_REQUIREMENTS,
    submission_missing_items,
)

from conftest import (
    auth_header,
    make_submit_ready_producer,
    make_user,
    valid_producer_register_payload,
)

_IMAGE = "https://res.cloudinary.com/demo/image/upload/x.jpg"


def _complete_draft(db, *, status: str = "draft") -> tuple[Producer, User]:
    """A draft that satisfies every submit requirement. The baseline each
    gate case degrades by exactly one field.

    Thin alias over conftest.make_submit_ready_producer — the body moved there
    (CI reviewer, #3004) once a second and third suite needed it. Kept as a
    local name so this file's many call sites read unchanged.
    """
    return make_submit_ready_producer(db, status=status)


# --- 0. the baseline is genuinely complete (MEH-1619 self-test) ---------------
#
# Run FIRST and asserted directly against the real helper. If the baseline is
# not actually complete, every "remove one field → that code appears" case
# below would pass for the wrong reason, and nothing in their output would say
# so. This is the control that makes the rest of the file readable.


def test_selftest_baseline_is_complete_and_gate_discriminates(db):
    producer, _user = _complete_draft(db)
    assert submission_missing_items(producer) == [], (
        "the shared baseline must satisfy every requirement — if it does not, "
        "every gate case below is green for a reason it never states"
    )

    # And the helper must actually notice a removal, in both directions.
    producer.images = []
    db.flush()
    assert submission_missing_items(producer) == [MISSING_IMAGE]
    producer.images = [_IMAGE]
    db.flush()
    assert submission_missing_items(producer) == []


def test_every_requirement_code_is_reachable(db):
    """Each declared requirement can actually be provoked.

    Guards the case where a code is declared in SUBMISSION_REQUIREMENTS but no
    branch can ever emit it — a constant that reads like coverage while
    checking nothing. Derived from the tuple, so adding a code without a
    degrade case here fails rather than silently going untested.
    """
    degrade = {
        MISSING_IMAGE: lambda p: setattr(p, "images", []),
        MISSING_PRODUCT: lambda p: [db.delete(x) for x in p.products],
        MISSING_CATEGORY: lambda p: [db.delete(x) for x in p.categories],
        MISSING_LOCATION: lambda p: (
            setattr(p, "lat", None),
            setattr(p, "lng", None),
        ),
        MISSING_PHONE_VERIFIED: lambda p: setattr(p, "phone_verified", False),
    }
    assert set(degrade) == set(SUBMISSION_REQUIREMENTS), (
        "a requirement code has no degrade case — it would never be exercised"
    )

    for code, break_it in degrade.items():
        producer, _user = _complete_draft(db)
        break_it(producer)
        db.flush()
        db.refresh(producer)
        assert code in submission_missing_items(producer), (
            f"degrading {code} must make the gate report {code}"
        )


def test_delivery_only_producer_satisfies_the_location_requirement(db):
    """A delivery-only business has NO lat/lng by design (MEH-213), and must
    still clear the location requirement via its delivery declaration.

    THE GAP THIS CLOSES (CI reviewer, #2979): every other MISSING_LOCATION
    case in this file provokes the finding by clearing lat/lng, which only
    ever exercises `_has_location`'s PHYSICAL branch. The delivery-only branch
    — the one that reads delivery_nationwide / delivery_areas — had no test at
    all. A bug in it would not have shown up as a failure here; it would have
    shown up as every delivery-only business in the country getting a 422 at
    submit with no indication why.

    Asserted in three shapes because they are three different code paths:
    a named delivery city, the nationwide flag, and neither (which must still
    report MISSING_LOCATION, or the test proves nothing about the branch).
    """
    # (a) delivery-only with a named city row
    producer, _user = _complete_draft(db)
    producer.has_physical_location = False
    producer.offers_delivery = True
    producer.lat = None
    producer.lng = None
    db.add(DeliveryArea(producer_id=producer.id, city="חיפה"))
    db.flush()
    db.refresh(producer)
    assert MISSING_LOCATION not in submission_missing_items(producer), (
        "a delivery-only business with a delivery city HAS stated where it "
        "operates — demanding coordinates from it makes submission unreachable"
    )

    # (b) delivery-only, nationwide, no city rows
    nationwide, _ = _complete_draft(db)
    nationwide.has_physical_location = False
    nationwide.offers_delivery = True
    nationwide.delivery_nationwide = True
    nationwide.lat = None
    nationwide.lng = None
    db.flush()
    db.refresh(nationwide)
    assert MISSING_LOCATION not in submission_missing_items(nationwide), (
        "a nationwide delivery business has stated where it operates — "
        "everywhere — so it must clear the location requirement without "
        "coordinates and without any delivery_areas row"
    )

    # (c) delivery-only with NEITHER — the branch must still be able to fail,
    # otherwise (a) and (b) would pass against a branch that returns True
    # unconditionally.
    neither, _ = _complete_draft(db)
    neither.has_physical_location = False
    neither.offers_delivery = True
    neither.lat = None
    neither.lng = None
    db.flush()
    db.refresh(neither)
    assert MISSING_LOCATION in submission_missing_items(neither), (
        "delivery-only with no nationwide flag and no city rows has told us "
        "nothing about where it delivers"
    )


def test_delivery_only_producer_can_submit(client, db):
    """End-to-end companion to the unit case above: the 422 must not fire."""
    producer, user = _complete_draft(db)
    producer.has_physical_location = False
    producer.offers_delivery = True
    producer.lat = None
    producer.lng = None
    db.add(DeliveryArea(producer_id=producer.id, city="חיפה"))
    db.commit()

    resp = client.post("/producers/me/submit-for-review", headers=auth_header(user))
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.status == "pending"


# --- 1. all three creation sites land on draft --------------------------------


def test_register_new_email_creates_draft(client, db):
    payload = valid_producer_register_payload()
    # primary_contact_method="whatsapp" requires a phone (auth.py's contact
    # gate) — the shared fixture omits it because its own callers are guard
    # tests that never reach the happy path.
    payload["phone"] = "0501234567"
    resp = client.post("/auth/register/producer", json=payload)
    assert resp.status_code == 200, resp.text

    producer = (
        db.query(Producer).filter(Producer.name == payload["producer_name"]).first()
    )
    assert producer is not None
    assert producer.status == "draft"
    assert producer.submitted_for_review_at is None, (
        "registration must NOT stamp a submission that never happened"
    )


def test_register_upgrade_path_creates_draft(client, db):
    user = make_user(db, email="upgrade_draft@example.com")
    payload = valid_producer_register_payload()
    payload["phone"] = "0501234567"
    payload.pop("email", None)
    payload.pop("password", None)
    payload.pop("name", None)

    resp = client.post(
        "/auth/register/producer", json=payload, headers=auth_header(user)
    )
    assert resp.status_code == 200, resp.text

    db.refresh(user)
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    assert producer is not None
    assert producer.status == "draft"


def test_post_producers_creates_draft(client, db):
    """The THIRD creation site, and the one that matters most for security.

    POST /producers is authenticated by require_verified_email — ANY logged-in
    user reaches it. Left on `pending` it would have been an open route into
    the admin review queue, straight past the submit gate.
    """
    user = make_user(db, email="anyuser@example.com", email_verified=True)
    category = Category(name=f"קטגוריה {uuid.uuid4().hex[:6]}", emoji="🥬")
    db.add(category)
    db.commit()

    resp = client.post(
        "/producers",
        json={
            "name": "עסק דרך POST",
            "description": "בדיקה",
            "city": "חיפה",
            "lat": 32.79,
            "lng": 34.98,
            "phone": "0501234567",
            "category_ids": [category.id],
        },
        headers=auth_header(user),
    )
    assert resp.status_code == 201, resp.text
    producer = db.query(Producer).filter(Producer.name == "עסק דרך POST").first()
    assert producer is not None
    assert producer.status == "draft"


def test_no_creation_site_writes_a_queue_status():
    """Removal-style absence assertion (the ticket's own verification step).

    Reads the SOURCE of the three creation sites and requires that none of them
    still constructs a Producer with a queue status. A behavioural test cannot
    express "and there is no fourth line doing it elsewhere in this file".
    """
    import pathlib

    root = pathlib.Path(__file__).resolve().parents[1]
    sites = [
        root / "backend" / "app" / "routers" / "auth.py",
        root / "backend" / "app" / "services" / "producer_queries.py",
    ]
    for path in sites:
        source = path.read_text(encoding="utf-8")
        code_lines = [
            ln for ln in source.splitlines() if not ln.lstrip().startswith("#")
        ]
        body = "\n".join(code_lines)
        assert 'status="pending"' not in body, f"{path.name} still creates pending"
        # `pending_whatsapp` was removed in MEH-2124, from the codebase
        # entirely. This assertion is KEPT rather than deleted with it: it is now the
        # guard that a creation site cannot re-introduce it, which is exactly
        # what a Contract phase needs to hold. It reads as trivially true only
        # for as long as the removal holds.
        assert 'status="pending_whatsapp"' not in body, (
            f"{path.name} creates a status removed in MEH-2124"
        )
        assert 'status="draft"' in body, f"{path.name} lost its draft write"


# --- 2. the submit gate: one case per requirement ------------------------------


@pytest.mark.parametrize(
    "code,break_it",
    [
        (MISSING_IMAGE, lambda db, p: setattr(p, "images", [])),
        (MISSING_PRODUCT, lambda db, p: [db.delete(x) for x in p.products]),
        (MISSING_CATEGORY, lambda db, p: [db.delete(x) for x in p.categories]),
        (
            MISSING_LOCATION,
            lambda db, p: (setattr(p, "lat", None), setattr(p, "lng", None)),
        ),
        (MISSING_PHONE_VERIFIED, lambda db, p: setattr(p, "phone_verified", False)),
    ],
)
def test_submit_422_names_the_missing_requirement(client, db, code, break_it):
    producer, user = _complete_draft(db)
    break_it(db, producer)
    db.commit()

    resp = client.post("/producers/me/submit-for-review", headers=auth_header(user))

    assert resp.status_code == 422, resp.text
    detail = resp.json()["detail"]
    assert code in detail["params"]["missing"], (
        f"the 422 must NAME {code}; a bare 422 would pass even if the gate "
        f"rejected for an unrelated reason"
    )
    # MEH-1943 shape — this is what lets detailToMessage render it unchanged.
    assert detail["code"] == "submit_gate_incomplete"
    assert detail["message"]

    db.refresh(producer)
    assert producer.status == "draft", "a rejected submit must not move the row"
    assert producer.submitted_for_review_at is None


def test_submit_success_flips_status_and_stamps_tz_aware(client, db):
    producer, user = _complete_draft(db)
    before = datetime.now(timezone.utc)

    resp = client.post("/producers/me/submit-for-review", headers=auth_header(user))
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.status == "pending"
    assert producer.submitted_for_review_at is not None
    # tz-aware, not naive — a naive utcnow here would be silently wrong by the
    # local offset and nothing else in the row would show it.
    assert producer.submitted_for_review_at.tzinfo is not None
    assert producer.submitted_for_review_at >= before


def test_submit_pings_the_admin_with_the_business_identity(client, db, monkeypatch):
    """A successful submit is the moment the admin ping becomes ACTIONABLE.

    Asserts the call and its arguments, deliberately NOT "an exception is
    swallowed". The fail-open lives one layer down, inside send_text /
    send_email (they no-op on missing config and log on HTTP failure), and the
    task is queued post-commit so a real ASGI server has already sent the 200.
    Raising from the task here would only prove that Starlette's TestClient
    runs background tasks inline, which is a fact about the test client and
    not about this endpoint.
    """
    calls: list[tuple] = []
    monkeypatch.setattr(
        "app.routers.producer_me.notify_admin_new_producer",
        lambda name, city: calls.append((name, city)),
    )

    producer, user = _complete_draft(db)
    resp = client.post("/producers/me/submit-for-review", headers=auth_header(user))

    assert resp.status_code == 200, resp.text
    assert calls == [("חוות הניסוי", "תל אביב")], (
        "the admin must be told WHICH business is waiting, not merely pinged"
    )
    db.refresh(producer)
    assert producer.status == "pending"


@pytest.mark.parametrize(
    "status", ["pending", "approved", "rejected", "inactive"]
)
def test_submit_409_on_every_non_draft_status(client, db, status):
    producer, user = _complete_draft(db, status=status)

    resp = client.post("/producers/me/submit-for-review", headers=auth_header(user))

    assert resp.status_code == 409, resp.text
    db.refresh(producer)
    assert producer.status == status, "a 409 must leave the row untouched"
    assert producer.submitted_for_review_at is None


def test_submit_requires_auth(client):
    assert client.post("/producers/me/submit-for-review").status_code == 401


# --- 3. fail-closed: a draft is invisible in public --------------------------


def test_draft_is_absent_from_public_listing(client, db):
    producer, _user = _complete_draft(db)
    producer.slug = "draft-business"
    db.commit()

    listing = client.get("/producers").json()
    ids = {row["id"] for row in (listing if isinstance(listing, list) else [])}
    assert str(producer.id) not in ids, "a draft must never be publicly listed"

    assert client.get("/producers/count").json()["count"] == 0
    assert client.get("/producers/by-slug/draft-business").status_code == 404


# --- 4. the admin queue's three-way filter -----------------------------------


def test_admin_queue_default_excludes_drafts(client, db):
    draft, _ = _complete_draft(db)
    pending, _ = _complete_draft(db, status="pending")

    admin = make_user(db, email="admin2100@example.com", role="admin")
    rows = client.get("/admin/producers", headers=auth_header(admin)).json()
    ids = {row["id"] for row in rows}

    assert str(pending.id) in ids
    assert str(draft.id) not in ids, (
        "the default queue IS what the admin toolbar requests — drafts in it "
        "are exactly the noise this ticket removes"
    )


def test_admin_status_draft_returns_only_drafts(client, db):
    draft, _ = _complete_draft(db)
    pending, _ = _complete_draft(db, status="pending")

    admin = make_user(db, email="admin2100b@example.com", role="admin")
    rows = client.get(
        "/admin/producers?status=draft", headers=auth_header(admin)
    ).json()
    ids = {row["id"] for row in rows}

    assert ids == {str(draft.id)}
    assert str(pending.id) not in ids


def test_admin_status_all_really_means_all(client, db):
    draft, _ = _complete_draft(db)
    pending, _ = _complete_draft(db, status="pending")

    admin = make_user(db, email="admin2100c@example.com", role="admin")
    rows = client.get("/admin/producers?status=all", headers=auth_header(admin)).json()
    ids = {row["id"] for row in rows}

    assert str(draft.id) in ids, "'all' must not quietly mean 'all but drafts'"
    assert str(pending.id) in ids
