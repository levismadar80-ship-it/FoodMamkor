"""MEH-3377 — read-only preview link for an ownerless draft, and the admin's
«פרסום בהסכמה» for it.

Each guard has its own test, named for the input it covers. The ones marked
"shown red" in the PR body were run against a construction with exactly that
guard removed.
"""

from datetime import datetime, timedelta, timezone

import pytest
from joserfc import jwt as jose_jwt

from conftest import (
    SUBMIT_READY_IMAGE,
    auth_header,
    make_category,
    make_producer,
    make_user,
)
from app.auth import _jwt_key, create_producer_claim_token
from app.config import settings
from app.constants import LICENSE_REQUIRED_CATEGORIES
from app.models import Producer
from app.services.draft_preview import (
    DRAFT_PREVIEW_SCOPE,
    create_draft_preview_token,
    decode_draft_preview_token,
)

CONSENT = {"consent_confirmed": True, "consent_note": "אישרו בוואטסאפ, 17.11"}


def _link(pid):
    return f"/admin/producers/{pid}/preview-link"


def _read(token):
    return f"/producer-preview/{token}"


def _publish(pid):
    return f"/admin/producers/{pid}/publish-with-consent"


def _draft(db, **kw):
    kw.setdefault("images", [SUBMIT_READY_IMAGE])
    return make_producer(db, status="draft", **kw)


def _own(db, producer):
    u = make_user(db, role="producer")
    u.producer_id = producer.id
    db.commit()
    return u


def _token(producer):
    return create_draft_preview_token(producer.id)[0]


def _forged(
    producer_id,
    *,
    scope=DRAFT_PREVIEW_SCOPE,
    exp_delta=timedelta(days=1),
    with_exp=True,
):
    now = datetime.now(timezone.utc)
    payload = {
        "producer_id": str(producer_id),
        "iat": int(now.timestamp()),
        "scope": scope,
    }
    if with_exp:
        payload["exp"] = now + exp_delta
    return jose_jwt.encode({"alg": settings.algorithm}, payload, _jwt_key())


# ---------- the link ----------


def test_admin_mints_a_link_for_an_ownerless_draft(client, db):
    admin = make_user(db, role="admin")
    p = _draft(db)
    r = client.post(_link(p.id), headers=auth_header(admin))
    assert r.status_code == 200, r.text
    body = r.json()
    token = body["url"].rsplit("/draft-preview/", 1)[1]
    assert decode_draft_preview_token(token) == p.id
    assert body["url"].startswith(settings.frontend_url)


def test_link_refused_for_a_non_admin(client, db):
    p = _draft(db)
    r = client.post(_link(p.id), headers=auth_header(make_user(db)))
    assert r.status_code == 403


def test_link_refused_without_a_session(client, db):
    assert client.post(_link(_draft(db).id)).status_code == 401


def test_link_refused_for_an_approved_business(client, db):
    admin = make_user(db, role="admin")
    p = make_producer(db, status="approved")
    assert client.post(_link(p.id), headers=auth_header(admin)).status_code == 409


def test_link_refused_for_a_draft_that_has_an_owner(client, db):
    admin = make_user(db, role="admin")
    p = _draft(db)
    _own(db, p)
    assert client.post(_link(p.id), headers=auth_header(admin)).status_code == 409


# ---------- the public read ----------


def test_holder_of_the_link_reads_the_draft_page(client, db):
    p = _draft(db, name="משק הדוגמה")
    r = client.get(_read(_token(p)))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == str(p.id)
    assert body["name"] == "משק הדוגמה"
    assert body["images"] == [SUBMIT_READY_IMAGE]


def test_the_draft_stays_404_on_the_public_route(client, db):
    """The preview route is the ONLY new way in: GET /producers/{id} still
    refuses a stranger."""
    p = _draft(db)
    assert client.get(f"/producers/{p.id}").status_code == 404


def test_read_refused_for_a_claim_token(client, db):
    """A claim link is not a preview link (scope)."""
    p = _draft(db)
    claim = create_producer_claim_token(p.id)[0]
    assert client.get(_read(claim)).status_code == 404


def test_a_preview_token_cannot_claim(client, db):
    """…and a preview link is not a claim link."""
    p = _draft(db)
    r = client.post("/producer-claim/preview", json={"token": _token(p)})
    assert r.status_code == 404


def test_read_refused_for_an_expired_token(client, db):
    p = _draft(db)
    assert (
        client.get(_read(_forged(p.id, exp_delta=timedelta(seconds=-5)))).status_code
        == 404
    )


def test_read_refused_for_a_token_without_exp(client, db):
    p = _draft(db)
    assert client.get(_read(_forged(p.id, with_exp=False))).status_code == 404


def test_read_refused_for_garbage(client, db):
    assert client.get(_read("not-a-token")).status_code == 404


def test_read_refused_once_the_draft_has_an_owner(client, db):
    p = _draft(db)
    token = _token(p)
    _own(db, p)
    assert client.get(_read(token)).status_code == 404


def test_read_refused_for_a_pending_business(client, db):
    p = make_producer(db, status="pending", images=[SUBMIT_READY_IMAGE])
    assert client.get(_read(_token(p))).status_code == 404


def test_read_refused_after_the_draft_is_deleted(client, db):
    p = _draft(db)
    token = _token(p)
    db.delete(p)
    db.commit()
    assert client.get(_read(token)).status_code == 404


# ---------- publish with consent ----------


def test_publish_moves_an_ownerless_draft_to_approved_and_records_consent(client, db):
    admin = make_user(db, role="admin")
    p = _draft(db)
    token = _token(p)
    r = client.post(_publish(p.id), json=CONSENT, headers=auth_header(admin))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"
    db.expire_all()
    row = db.query(Producer).filter(Producer.id == p.id).one()
    assert row.status == "approved"
    assert row.owner_invite_consent_note == CONSENT["consent_note"]
    # The page is public now, and the preview link is dead.
    assert client.get(f"/producers/{p.id}").status_code == 200
    assert client.get(_read(token)).status_code == 404


def test_publish_refused_without_the_consent_box(client, db):
    admin = make_user(db, role="admin")
    p = _draft(db)
    r = client.post(
        _publish(p.id),
        json={**CONSENT, "consent_confirmed": False},
        headers=auth_header(admin),
    )
    assert r.status_code == 422
    db.expire_all()
    assert db.query(Producer).filter(Producer.id == p.id).one().status == "draft"


def test_publish_refused_with_a_blank_consent_note(client, db):
    admin = make_user(db, role="admin")
    p = _draft(db)
    r = client.post(
        _publish(p.id),
        json={"consent_confirmed": True, "consent_note": "   "},
        headers=auth_header(admin),
    )
    assert r.status_code == 422
    db.expire_all()
    assert db.query(Producer).filter(Producer.id == p.id).one().status == "draft"


def test_publish_refused_for_a_non_admin(client, db):
    p = _draft(db)
    r = client.post(_publish(p.id), json=CONSENT, headers=auth_header(make_user(db)))
    assert r.status_code == 403
    db.expire_all()
    assert db.query(Producer).filter(Producer.id == p.id).one().status == "draft"


def test_publish_refused_for_a_draft_that_has_an_owner(client, db):
    """Her page, her button: the owner submits it herself."""
    admin = make_user(db, role="admin")
    p = _draft(db)
    _own(db, p)
    r = client.post(_publish(p.id), json=CONSENT, headers=auth_header(admin))
    assert r.status_code == 409
    db.expire_all()
    assert db.query(Producer).filter(Producer.id == p.id).one().status == "draft"


def test_publish_refused_for_a_rejected_business(client, db):
    """Not a side door around the review decision (MEH-769's class)."""
    admin = make_user(db, role="admin")
    p = make_producer(db, status="rejected", images=[SUBMIT_READY_IMAGE])
    r = client.post(_publish(p.id), json=CONSENT, headers=auth_header(admin))
    assert r.status_code == 409
    db.expire_all()
    assert db.query(Producer).filter(Producer.id == p.id).one().status == "rejected"


def test_publish_refused_for_a_draft_with_no_photo(client, db):
    admin = make_user(db, role="admin")
    p = make_producer(db, status="draft")
    r = client.post(_publish(p.id), json=CONSENT, headers=auth_header(admin))
    assert r.status_code == 422
    db.expire_all()
    assert db.query(Producer).filter(Producer.id == p.id).one().status == "draft"


def _licence_category_draft(db):
    cat = make_category(db, name=LICENSE_REQUIRED_CATEGORIES[0], emoji="🍯")
    return _draft(db, category=cat)


def test_publish_refused_without_a_licence_number_in_a_licence_category(client, db):
    admin = make_user(db, role="admin")
    p = _licence_category_draft(db)
    r = client.post(_publish(p.id), json=CONSENT, headers=auth_header(admin))
    assert r.status_code == 422
    db.expire_all()
    assert db.query(Producer).filter(Producer.id == p.id).one().status == "draft"


def test_publish_without_a_licence_number_passes_with_the_explicit_override(client, db):
    """Sapir, 17/11: it goes live, without the «מאומת» badge."""
    admin = make_user(db, role="admin")
    p = _licence_category_draft(db)
    r = client.post(
        _publish(p.id),
        params={"allow_without_license": "true"},
        json=CONSENT,
        headers=auth_header(admin),
    )
    assert r.status_code == 200, r.text
    db.expire_all()
    row = db.query(Producer).filter(Producer.id == p.id).one()
    assert row.status == "approved"
    # The badge is the public page's `verification_tier`; a licence-required
    # category with no licence number must not read "verified".
    page = client.get(f"/producers/{p.id}")
    assert page.status_code == 200
    assert page.json()["verification_tier"] != "verified"


def test_plain_approve_still_refuses_a_draft(client, db):
    """This card adds a route; it does not loosen approve_producer (MEH-2121)."""
    admin = make_user(db, role="admin")
    p = _draft(db)
    r = client.post(f"/admin/producers/{p.id}/approve", headers=auth_header(admin))
    assert r.status_code == 409


def test_every_dead_link_answers_with_the_same_body(client, db):
    """No oracle: a holder cannot tell expired from forged from published."""
    admin = make_user(db, role="admin")
    published = _draft(db)
    published_token = _token(published)
    r = client.post(_publish(published.id), json=CONSENT, headers=auth_header(admin))
    assert r.status_code == 200, r.text
    owned = _draft(db)
    owned_token = _token(owned)
    _own(db, owned)
    live = _draft(db)
    # Control: the same helper mints a link that opens, so a 404 below is
    # about the row's state and not about a token the helper built wrong.
    assert client.get(_read(_token(live))).status_code == 200
    bodies = {
        "published": client.get(_read(published_token)),
        "owned": client.get(_read(owned_token)),
        "expired": client.get(_read(_forged(live.id, exp_delta=timedelta(seconds=-5)))),
        "claim scope": client.get(_read(create_producer_claim_token(live.id)[0])),
        "garbage": client.get(_read("not-a-token")),
    }
    assert {name: r.status_code for name, r in bodies.items()} == dict.fromkeys(
        bodies, 404
    )
    assert len({r.text for r in bodies.values()}) == 1


def test_an_organizer_draft_has_no_preview_and_is_not_published(client, db):
    admin = make_user(db, role="admin")
    p = _draft(db)
    p.kind = "organizer"
    db.commit()
    assert client.post(_link(p.id), headers=auth_header(admin)).status_code == 409
    assert client.get(_read(_token(p))).status_code == 404
    r = client.post(_publish(p.id), json=CONSENT, headers=auth_header(admin))
    assert r.status_code == 409


# ---------- the optional consent screenshot ----------

SHOT = "https://res.cloudinary.com/demo/image/upload/v1/mehamakor/abc123.jpg"


def test_publish_stores_the_consent_screenshot_and_shows_it_to_the_admin_only(
    client, db
):
    admin = make_user(db, role="admin")
    p = _draft(db)
    r = client.post(
        _publish(p.id),
        json={**CONSENT, "consent_screenshot_url": SHOT},
        headers=auth_header(admin),
    )
    assert r.status_code == 200, r.text
    db.expire_all()
    row = db.query(Producer).filter(Producer.id == p.id).one()
    assert row.consent_screenshot_url == SHOT
    # The admin reads it back…
    got = client.get(f"/admin/producers/{p.id}", headers=auth_header(admin))
    assert got.status_code == 200, got.text
    assert got.json()["consent_screenshot_url"] == SHOT
    # …and the public page carries neither the key nor the URL.
    public = client.get(f"/producers/{p.id}")
    assert public.status_code == 200
    assert "consent_screenshot_url" not in public.json()
    assert SHOT not in public.text


def test_publish_without_a_screenshot_stores_none(client, db):
    admin = make_user(db, role="admin")
    p = _draft(db)
    r = client.post(_publish(p.id), json=CONSENT, headers=auth_header(admin))
    assert r.status_code == 200, r.text
    db.expire_all()
    row = db.query(Producer).filter(Producer.id == p.id).one()
    assert row.consent_screenshot_url is None


@pytest.mark.parametrize(
    "url",
    [
        "http://res.cloudinary.com/demo/image/upload/v1/a.jpg",
        "https://evil.example/image/upload/a.jpg",
        "https://res.cloudinary.com.evil.example/image/upload/a.jpg",
        "https://user@res.cloudinary.com/demo/image/upload/a.jpg",
        "https://res.cloudinary.com/demo/raw/upload/a.html",
        "javascript:alert(1)",
        "/placeholder-image.png?name=abc",
    ],
)
def test_publish_refuses_a_screenshot_url_that_is_not_our_cloudinary_image(
    client, db, url
):
    admin = make_user(db, role="admin")
    p = _draft(db)
    r = client.post(
        _publish(p.id),
        json={**CONSENT, "consent_screenshot_url": url},
        headers=auth_header(admin),
    )
    assert r.status_code == 422, r.text
    db.expire_all()
    assert db.query(Producer).filter(Producer.id == p.id).one().status == "draft"
