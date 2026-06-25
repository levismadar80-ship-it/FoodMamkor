"""MEH-769 (HOT-002) — producer-approval state-machine enforcement.

The admin status-toggle (`POST /admin/producers/{id}/toggle-status`) is the
visibility switch for an already-decided business: approved ⇄ inactive only.
Before this guard its bare `else` branch force-approved ANY non-approved
producer — a rejected/pending business could be flipped straight to
`approved` (live on the public map), skipping the real approve_producer flow
and every MEH-509 side-effect (approval email, producer_approved_v1 WhatsApp,
admin WhatsApp).

Transition matrix enforced by these tests:

| Source status     | toggle-status         | approve              |
|-------------------|-----------------------|----------------------|
| approved          | → inactive (200)      | → approved (no-op)   |
| inactive          | → approved (200)      | → approved           |
| pending           | 409 (use approve flow)| → approved + hooks   |
| pending_whatsapp  | 409                   | → approved + hooks   |
| rejected          | 409                   | → approved + hooks   |

Pure HTTP/DB tests, mirroring tests/test_producer_declaration.py. The
notification hooks fail-open in the test config; we monkeypatch
notify_producer_approved to assert fire-count (exactly once on the legit
path, zero on a blocked toggle).
"""
import app.routers.admin as admin_module
from app.constants import LICENSE_REQUIRED_CATEGORIES
from conftest import auth_header, make_category, make_producer, make_user


def _admin(db):
    return make_user(db, role="admin")


def _toggle(client, producer_id, admin):
    return client.post(
        f"/admin/producers/{producer_id}/toggle-status", headers=auth_header(admin)
    )


TEST_IMAGE = "https://res.cloudinary.com/demo/image/upload/v1/test.jpg"

# --- allowed transitions: approved ⇄ inactive ------------------------------


def test_toggle_approved_to_inactive(client, db):
    producer = make_producer(db, status="approved")
    resp = _toggle(client, producer.id, _admin(db))
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "inactive"
    db.refresh(producer)
    assert producer.status == "inactive"


def test_toggle_inactive_to_approved(client, db):
    producer = make_producer(db, status="inactive")
    resp = _toggle(client, producer.id, _admin(db))
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "approved"
    db.refresh(producer)
    assert producer.status == "approved"


# --- forbidden transitions: pending / pending_whatsapp / rejected → 409 -----


def test_toggle_rejected_is_blocked(client, db):
    producer = make_producer(db, status="rejected")
    resp = _toggle(client, producer.id, _admin(db))
    assert resp.status_code == 409, resp.text
    db.refresh(producer)
    assert producer.status == "rejected", "rejected producer must NOT be force-approved"


def test_toggle_pending_is_blocked(client, db):
    producer = make_producer(db, status="pending")
    resp = _toggle(client, producer.id, _admin(db))
    assert resp.status_code == 409, resp.text
    db.refresh(producer)
    assert producer.status == "pending"


def test_toggle_pending_whatsapp_is_blocked(client, db):
    producer = make_producer(db, status="pending_whatsapp")
    resp = _toggle(client, producer.id, _admin(db))
    assert resp.status_code == 409, resp.text
    db.refresh(producer)
    assert producer.status == "pending_whatsapp"


def test_blocked_toggle_fires_no_approval_hook(client, db, monkeypatch):
    """A blocked toggle must not run the approval side-effects."""
    calls = []
    monkeypatch.setattr(
        admin_module,
        "notify_producer_approved",
        lambda *a, **k: calls.append(a),
    )
    producer = make_producer(db, status="rejected")
    resp = _toggle(client, producer.id, _admin(db))
    assert resp.status_code == 409
    assert calls == [], "toggle 409 must not fire producer_approved_v1"


# --- the legit approval path still works + fires the hook exactly once ------


def test_legit_approve_from_rejected_fires_hook_once(client, db, monkeypatch):
    calls = []
    monkeypatch.setattr(
        admin_module,
        "notify_producer_approved",
        lambda *a, **k: calls.append(a),
    )
    # MEH-799: the approve gate requires an image — give it one so this
    # test keeps exercising the hook-count contract, not the image gate.
    producer = make_producer(db, status="rejected", images=[TEST_IMAGE])
    resp = client.post(
        f"/admin/producers/{producer.id}/approve", headers=auth_header(_admin(db))
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.status == "approved"
    assert len(calls) == 1, "producer_approved_v1 must fire exactly once on approve"


# --- MEH-799: approve requires at least one image ---------------------------


def test_approve_imageless_producer_is_blocked(client, db, monkeypatch):
    """0 images -> 422 with the locked Hebrew detail; no side-effects fire."""
    calls = []
    monkeypatch.setattr(
        admin_module,
        "notify_producer_approved",
        lambda *a, **k: calls.append(a),
    )
    producer = make_producer(db, status="pending")
    resp = client.post(
        f"/admin/producers/{producer.id}/approve", headers=auth_header(_admin(db))
    )
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == (
        "לא ניתן לאשר בית עסק ללא תמונה. בקשי מבעלת העסק להעלות תמונה אחת לפחות."
    )
    db.refresh(producer)
    assert producer.status == "pending", "blocked approve must not change status"
    assert calls == [], "blocked approve must not fire producer_approved_v1"


def test_approve_with_image_succeeds(client, db, monkeypatch):
    monkeypatch.setattr(
        admin_module, "notify_producer_approved", lambda *a, **k: None
    )
    producer = make_producer(db, status="pending", images=[TEST_IMAGE])
    resp = client.post(
        f"/admin/producers/{producer.id}/approve", headers=auth_header(_admin(db))
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.status == "approved"


# --- MEH-971 chunk 4: license-pending approval guard ------------------------
# A producer in a license-required category (constants.LICENSE_REQUIRED_CATEGORIES)
# with a NULL/empty license number cannot be approved unless an explicit
# override is passed. Reuses categories_require_license (no list duplication).
# No-op today (the register-time 422 still blocks such producers from being
# created); this is the safety net for the upcoming license-pending path.

# Reference the real constant (not a literal) so the test can't drift if the
# license-required list changes — any element is a valid license-required name.
assert LICENSE_REQUIRED_CATEGORIES, "LICENSE_REQUIRED_CATEGORIES must not be empty"
LICENSE_REQUIRED_CATEGORY = LICENSE_REQUIRED_CATEGORIES[0]


def _set_license(db, producer, value):
    producer.producer_license_number = value
    db.commit()
    db.refresh(producer)


def test_approve_license_required_no_license_is_blocked(client, db, monkeypatch):
    """(a) license-required category + NULL license + no override → 422, no flip."""
    calls = []
    monkeypatch.setattr(
        admin_module, "notify_producer_approved", lambda *a, **k: calls.append(a)
    )
    cat = make_category(db, name=LICENSE_REQUIRED_CATEGORY, emoji="🍯")
    producer = make_producer(
        db, status="pending", images=[TEST_IMAGE], category=cat
    )  # producer_license_number defaults to NULL
    resp = client.post(
        f"/admin/producers/{producer.id}/approve", headers=auth_header(_admin(db))
    )
    assert resp.status_code == 422, resp.text
    db.refresh(producer)
    assert producer.status == "pending", "blocked approve must not change status"
    assert calls == [], "blocked approve must not fire producer_approved_v1"


def test_approve_license_required_with_override_succeeds(client, db, monkeypatch):
    """(b) same as (a) but ?allow_without_license=true → approved."""
    monkeypatch.setattr(
        admin_module, "notify_producer_approved", lambda *a, **k: None
    )
    cat = make_category(db, name=LICENSE_REQUIRED_CATEGORY, emoji="🍯")
    producer = make_producer(
        db, status="pending", images=[TEST_IMAGE], category=cat
    )
    resp = client.post(
        f"/admin/producers/{producer.id}/approve?allow_without_license=true",
        headers=auth_header(_admin(db)),
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.status == "approved"


def test_approve_license_required_with_license_succeeds(client, db, monkeypatch):
    """(c) license-required category + license present → approved (no override)."""
    monkeypatch.setattr(
        admin_module, "notify_producer_approved", lambda *a, **k: None
    )
    cat = make_category(db, name=LICENSE_REQUIRED_CATEGORY, emoji="🍯")
    producer = make_producer(
        db, status="pending", images=[TEST_IMAGE], category=cat
    )
    _set_license(db, producer, "1234567")
    resp = client.post(
        f"/admin/producers/{producer.id}/approve", headers=auth_header(_admin(db))
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.status == "approved"


def test_approve_non_license_category_no_license_succeeds(client, db, monkeypatch):
    """(d) non-license category + NULL license → approved (guard does not fire)."""
    monkeypatch.setattr(
        admin_module, "notify_producer_approved", lambda *a, **k: None
    )
    cat = make_category(db, name="ירקות", emoji="🥬")  # not license-required
    producer = make_producer(
        db, status="pending", images=[TEST_IMAGE], category=cat
    )
    resp = client.post(
        f"/admin/producers/{producer.id}/approve", headers=auth_header(_admin(db))
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.status == "approved"
