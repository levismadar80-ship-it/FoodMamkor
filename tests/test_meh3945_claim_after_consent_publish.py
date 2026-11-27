"""MEH-3945 — a /c/ claim link sent for a draft keeps working after the admin
publishes that draft with the owner's consent («פרסום בהסכמה»).

27/11/2026: three businesses opened the link they had been sent and saw
«העמוד הזה כבר שויך לחשבון» on a page nobody owned, because the claim only
accepted drafts. Every test here goes through the real routes: mint the link
on a draft, publish with consent, then preview and claim with that link.
"""

import pytest

from conftest import SUBMIT_READY_IMAGE, auth_header, make_producer, make_user
from app.models import Producer, User

CLAIM = "/producer-claim"
PREVIEW = "/producer-claim/preview"
CONSENT = {"consent_confirmed": True, "consent_note": "אישרה בוואטסאפ, 27.11"}


@pytest.fixture(autouse=True)
def _quiet_side_effects(monkeypatch):
    for name in (
        "notify_producer_registered",
        "score_producer",
        "notify_admin_draft_claimed",
        "send_welcome_email",
    ):
        monkeypatch.setattr(f"app.routers.producer_claim.{name}", lambda *a, **k: None)


def _body(token):
    return {"token": token, "declaration_accepted": True, "terms_accepted": True}


def _draft_with_link(client, db):
    admin = make_user(db, role="admin")
    p = make_producer(db, status="draft", images=[SUBMIT_READY_IMAGE])
    r = client.post(f"/admin/producers/{p.id}/claim-link", headers=auth_header(admin))
    assert r.status_code == 200, r.text
    return admin, p, r.json()["url"].rsplit("/c/", 1)[1]


def _publish(client, admin, p):
    r = client.post(
        f"/admin/producers/{p.id}/publish-with-consent?slug=test-farm",
        json=CONSENT,
        headers=auth_header(admin),
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"


def test_link_previews_after_consent_publish(client, db):
    admin, p, code = _draft_with_link(client, db)
    _publish(client, admin, p)
    r = client.post(PREVIEW, json={"token": code})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == p.name


def test_link_claims_after_consent_publish_and_page_stays_live(client, db):
    admin, p, code = _draft_with_link(client, db)
    _publish(client, admin, p)
    owner = make_user(db, email="owner3945@example.com")
    r = client.post(CLAIM, json=_body(code), headers=auth_header(owner))
    assert r.status_code == 200, r.text
    assert r.json() == {"producer_id": str(p.id), "status": "approved"}
    db.expire_all()
    assert db.get(User, owner.id).producer_id == p.id
    assert db.get(Producer, p.id).status == "approved"


def test_claim_spends_an_outstanding_owner_invite(client, db):
    # The page now has one owner; a second hand-over link for it must die.
    admin, p, code = _draft_with_link(client, db)
    _publish(client, admin, p)
    r = client.post(
        f"/admin/producers/{p.id}/owner-invite",
        json={"name": "בעלת העסק", "email": None, **CONSENT},
        headers=auth_header(admin),
    )
    assert r.status_code == 200, r.text
    invite = r.json()["invite_url"].rsplit("/owner-invite/", 1)[1]
    assert client.get(f"/auth/owner-invite/{invite}").status_code == 200
    owner = make_user(db, email="owner3945b@example.com")
    assert (
        client.post(CLAIM, json=_body(code), headers=auth_header(owner)).status_code
        == 200
    )
    assert client.get(f"/auth/owner-invite/{invite}").status_code == 404


def test_live_page_without_consent_note_stays_409(client, db):
    # MEH-2321 D2 still holds for a page that went live any other way.
    admin, p, code = _draft_with_link(client, db)
    p.status = "approved"
    db.commit()
    assert client.post(PREVIEW, json={"token": code}).status_code == 409
    owner = make_user(db, email="owner3945c@example.com")
    assert (
        client.post(CLAIM, json=_body(code), headers=auth_header(owner)).status_code
        == 409
    )


def test_consent_published_page_with_an_owner_stays_409(client, db):
    admin, p, code = _draft_with_link(client, db)
    _publish(client, admin, p)
    first = make_user(db, email="owner3945d@example.com")
    assert (
        client.post(CLAIM, json=_body(code), headers=auth_header(first)).status_code
        == 200
    )
    second = make_user(db, email="owner3945e@example.com")
    assert client.post(PREVIEW, json={"token": code}).status_code == 409
    assert (
        client.post(CLAIM, json=_body(code), headers=auth_header(second)).status_code
        == 409
    )
