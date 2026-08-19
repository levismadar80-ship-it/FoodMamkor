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
    producer = make_producer(
        db, status="rejected", images=[TEST_IMAGE], phone_verified=True
    )
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
    producer = make_producer(
        db, status="pending", images=[TEST_IMAGE], phone_verified=True
    )
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
        db, status="pending", images=[TEST_IMAGE], category=cat, phone_verified=True
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
        db, status="pending", images=[TEST_IMAGE], category=cat, phone_verified=True
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
        db, status="pending", images=[TEST_IMAGE], category=cat, phone_verified=True
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
        db, status="pending", images=[TEST_IMAGE], category=cat, phone_verified=True
    )
    resp = client.post(
        f"/admin/producers/{producer.id}/approve", headers=auth_header(_admin(db))
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.status == "approved"


# --- MEH-2113: the approval email carries the celebratory headline ----------


def test_approval_email_subject_is_the_welcome_headline(client, db, monkeypatch):
    """The subject of the approval email is «ברוכים הבאים למהמקור» — verbatim,
    Sapir-approved (16/08).

    The headline was REJECTED for the registration screen (MEH-2100 item 9)
    because onboarding was not complete there; at approval it is — the
    business is live. This is the one surface where the celebration is true,
    and the test asserts it end-to-end through the real approve route so a
    refactor of the email call site cannot silently drop it.

    Asserted through capture, not by re-declaring the string next to the code
    it tests — the recipient and body are checked as presence (owner's email,
    body untouched by MEH-2113), the subject as exact equality because the
    subject IS the change.
    """
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        admin_module,
        "_send_notification_email",
        lambda to, subject, body: sent.append((to, subject, body)),
    )
    monkeypatch.setattr(admin_module, "notify_producer_approved", lambda *a, **k: None)

    producer = make_producer(
        db, status="pending", images=[TEST_IMAGE], phone_verified=True
    )
    owner = make_user(db, role="producer")
    owner.producer_id = producer.id
    db.commit()

    resp = client.post(
        f"/admin/producers/{producer.id}/approve", headers=auth_header(_admin(db))
    )
    assert resp.status_code == 200, resp.text

    assert len(sent) == 1, "approval must email the owner exactly once"
    to, subject, body = sent[0]
    assert to == owner.email
    assert subject == "ברוכים הבאים למהמקור"
    # The body is deliberately NOT the change: MEH-2113 swaps the subject only.
    assert producer.name in body
    assert "אושר במהמקור" in body


# --- MEH-2121: the admin side of the draft state machine ---------------------
#
# Two guards with no override (draft is simply not in the queue) and one with
# an explicit one (an unverified WhatsApp number is a judgement call the admin
# is allowed to make, the way the licence already is).


def test_approve_draft_is_blocked(client, db, monkeypatch):
    """A draft never asked to be reviewed.

    Approving one publishes a business that skipped the machine and leaves
    `submitted_for_review_at` NULL — the column MEH-2110's SLA badge counts
    from, so the queue would carry a row it cannot age.
    """
    calls = []
    monkeypatch.setattr(
        admin_module, "notify_producer_approved", lambda *a, **k: calls.append(a)
    )
    # Otherwise fully approvable: the ONLY thing wrong is the status, so a 409
    # here cannot be some other gate firing.
    producer = make_producer(
        db, status="draft", images=[TEST_IMAGE], phone_verified=True
    )

    resp = client.post(
        f"/admin/producers/{producer.id}/approve", headers=auth_header(_admin(db))
    )

    assert resp.status_code == 409, resp.text
    db.refresh(producer)
    assert producer.status == "draft", "a blocked approve must not change status"
    assert calls == [], "a blocked approve must not fire producer_approved_v1"


def test_approve_draft_has_no_override(client, db, monkeypatch):
    """The licence and phone gates have doors; this one does not.

    Passing BOTH override flags must still 409 — there is no legitimate reason
    to approve something that was never submitted, and the owner pressing the
    button is the only thing that should move it.
    """
    monkeypatch.setattr(
        admin_module, "notify_producer_approved", lambda *a, **k: None
    )
    producer = make_producer(
        db, status="draft", images=[TEST_IMAGE], phone_verified=True
    )

    resp = client.post(
        f"/admin/producers/{producer.id}/approve"
        "?allow_without_license=true&allow_unverified_phone=true",
        headers=auth_header(_admin(db)),
    )

    assert resp.status_code == 409, resp.text
    db.refresh(producer)
    assert producer.status == "draft"


def test_reject_draft_is_blocked(client, db):
    """Rejecting a draft emails the owner that an application she never made
    was turned down, and writes a `rejection_reason` her dashboard renders."""
    producer = make_producer(db, status="draft", images=[TEST_IMAGE])

    resp = client.post(
        f"/admin/producers/{producer.id}/reject",
        json={"reason": "לא מתאים"},
        headers=auth_header(_admin(db)),
    )

    assert resp.status_code == 409, resp.text
    db.refresh(producer)
    assert producer.status == "draft", "a blocked reject must not change status"
    assert producer.rejection_reason is None, (
        "a blocked reject must not write a reason the owner's banner would show"
    )


def test_reject_pending_still_works(client, db):
    """The other side of the boundary — every non-draft status keeps today's
    behaviour. A guard asserted only on its refusing side passes just as well
    when it refuses everything."""
    producer = make_producer(db, status="pending", images=[TEST_IMAGE])

    resp = client.post(
        f"/admin/producers/{producer.id}/reject",
        json={"reason": "לא מתאים"},
        headers=auth_header(_admin(db)),
    )

    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.status == "rejected"


def test_approve_unverified_phone_is_blocked(client, db, monkeypatch):
    """The WhatsApp number is the channel every customer contact runs through,
    so an approved page carrying an unverified one has a CTA that may go
    nowhere."""
    calls = []
    monkeypatch.setattr(
        admin_module, "notify_producer_approved", lambda *a, **k: calls.append(a)
    )
    # Degraded by exactly one field against the passing case below.
    producer = make_producer(
        db, status="pending", images=[TEST_IMAGE], phone_verified=False
    )

    resp = client.post(
        f"/admin/producers/{producer.id}/approve", headers=auth_header(_admin(db))
    )

    # 422, not 409: an approve-time CONTENT gate, like the photo and licence
    # gates it sits beside. Ruled 18/08 — the ticket's AC said 409.
    assert resp.status_code == 422, resp.text
    db.refresh(producer)
    assert producer.status == "pending"
    assert calls == [], "a blocked approve must not fire producer_approved_v1"


def test_approve_unverified_phone_with_override_succeeds(client, db, monkeypatch):
    """?allow_unverified_phone=true — the same explicit door the licence guard
    has had since MEH-971."""
    monkeypatch.setattr(
        admin_module, "notify_producer_approved", lambda *a, **k: None
    )
    producer = make_producer(
        db, status="pending", images=[TEST_IMAGE], phone_verified=False
    )

    resp = client.post(
        f"/admin/producers/{producer.id}/approve?allow_unverified_phone=true",
        headers=auth_header(_admin(db)),
    )

    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.status == "approved"


def test_the_phone_override_is_audited_like_the_license_one(
    client, db, monkeypatch, caplog
):
    """The override leaves a trail, and it is the SAME trail the licence
    override leaves — a `logger.warning` naming the producer and the admin.

    Phase 0 found that mechanism (`admin.py` `_assert_approvable`) and this
    mirrors it rather than inventing a second one. Asserted because an
    un-audited override is indistinguishable from no guard at all after the
    fact: the row ends up approved either way, and nothing records that a human
    chose it.
    """
    monkeypatch.setattr(
        admin_module, "notify_producer_approved", lambda *a, **k: None
    )
    admin = _admin(db)
    producer = make_producer(
        db, status="pending", images=[TEST_IMAGE], phone_verified=False
    )

    with caplog.at_level("WARNING", logger="app.routers.admin"):
        resp = client.post(
            f"/admin/producers/{producer.id}/approve?allow_unverified_phone=true",
            headers=auth_header(admin),
        )
    assert resp.status_code == 200, resp.text

    overrides = [
        r for r in caplog.records if "unverified-phone override" in r.getMessage()
    ]
    assert len(overrides) == 1, (
        "expected exactly one audit line for the override, got "
        f"{[r.getMessage() for r in caplog.records]}"
    )
    logged = overrides[0].getMessage()
    assert str(producer.id) in logged, "the audit line must name the producer"
    assert str(admin.id) in logged, "the audit line must name the admin who chose"


def test_no_audit_line_when_the_override_is_not_needed(client, db, monkeypatch, caplog):
    """The control for the test above.

    A verified producer approved WITH the flag set must not log an override —
    otherwise the audit trail fills with lines recording overrides that never
    happened, and the signal it exists to carry is gone.
    """
    monkeypatch.setattr(
        admin_module, "notify_producer_approved", lambda *a, **k: None
    )
    producer = make_producer(
        db, status="pending", images=[TEST_IMAGE], phone_verified=True
    )

    with caplog.at_level("WARNING", logger="app.routers.admin"):
        resp = client.post(
            f"/admin/producers/{producer.id}/approve?allow_unverified_phone=true",
            headers=auth_header(_admin(db)),
        )
    assert resp.status_code == 200, resp.text

    assert not [
        r for r in caplog.records if "unverified-phone override" in r.getMessage()
    ], "an override was audited although the gate would have passed anyway"
