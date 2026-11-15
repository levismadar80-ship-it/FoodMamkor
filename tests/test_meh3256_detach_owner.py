"""MEH-3256 (grill retro D9) — admin «ניתוק בעלים».

v1 keeps one login per business. When a business changes hands, the admin
detaches the current owner: her account stays (a plain consumer account, her
favourites and reviews kept), every session she holds is retired, the
business keeps all its data and stays live, and the row becomes invitable
again so the new owner can be invited (on a new or an existing account).
"""

from unittest import mock

from conftest import auth_header, make_user
from app.models import User
from app.routers import producer_owner_detach as pod
from test_producer_owner_invite import _row, approved, invite, own


def _url(pid):
    return f"/admin/producers/{pid}/detach-owner"


def _setup(db, **kw):
    producer = approved(db, **kw)
    owner = own(db, producer, email="old-owner@example.com", name="דנה כהן")
    producer.owner_invite_accepted_at = producer.created_at
    db.commit()
    admin = make_user(db, role="admin", email="admin-detach@example.com")
    return producer, owner, admin


def _detach(client, producer, owner, admin, **over):
    body = {"confirm_name": producer.name, "expected_owner_user_id": str(owner.id)}
    sent = []
    with mock.patch.object(
        pod,
        "send_owner_detached_email",
        side_effect=lambda *a, **k: sent.append((a, k)),
    ):
        r = client.post(_url(producer.id), json=body | over, headers=auth_header(admin))
    return r, sent


def test_detach_demotes_the_owner_and_keeps_the_business(client, db):
    producer, owner, admin = _setup(db)
    tv_before = owner.token_version
    r, sent = _detach(client, producer, owner, admin)
    assert r.status_code == 200, r.text
    db.expire_all()
    u = db.get(User, owner.id)
    assert u is not None, "the account itself is kept"
    assert u.producer_id is None
    assert u.role == "consumer"
    assert not u.is_producer
    assert u.token_version == tv_before + 1, "every older session is retired"
    p = _row(db, producer)
    assert p.status == "approved", "the business stays live"
    assert p.owner_invite_accepted_at is None
    assert len(sent) == 1 and sent[0][0][0] == "old-owner@example.com"


def test_after_detach_the_business_can_be_invited_again(client, db):
    producer, owner, admin = _setup(db)
    before, _ = invite(client, db, producer, admin=admin)
    assert before.status_code == 409, "an owned business is not invitable"
    r, _ = _detach(client, producer, owner, admin)
    assert r.status_code == 200, r.text
    after, token = invite(client, db, producer, admin=admin)
    assert after.status_code == 200, after.text
    assert token


def test_the_typed_name_must_match(client, db):
    producer, owner, admin = _setup(db)
    r, sent = _detach(client, producer, owner, admin, confirm_name="שם אחר")
    assert r.status_code == 422
    assert "השם" in r.json()["detail"]
    db.expire_all()
    assert db.get(User, owner.id).producer_id == producer.id
    assert sent == []


def test_a_stale_owner_id_is_refused(client, db):
    """The page was loaded before someone else detached and re-invited."""
    producer, owner, admin = _setup(db)
    other = make_user(db, role="consumer", email="someone-else@example.com")
    r, sent = _detach(
        client, producer, owner, admin, expected_owner_user_id=str(other.id)
    )
    assert r.status_code == 409
    db.expire_all()
    assert db.get(User, owner.id).producer_id == producer.id
    assert sent == []


def test_a_business_with_no_owner_is_404(client, db):
    producer = approved(db)
    admin = make_user(db, role="admin", email="admin-detach@example.com")
    nobody = make_user(db, role="consumer", email="nobody@example.com")
    r = client.post(
        _url(producer.id),
        json={"confirm_name": producer.name, "expected_owner_user_id": str(nobody.id)},
        headers=auth_header(admin),
    )
    assert r.status_code == 404


def test_an_admin_account_is_never_detached(client, db):
    producer, owner, admin = _setup(db)
    owner.role = "admin"
    db.commit()
    r, sent = _detach(client, producer, owner, admin)
    assert r.status_code == 403
    db.expire_all()
    assert db.get(User, owner.id).producer_id == producer.id
    assert sent == []


def test_only_an_admin_may_detach(client, db):
    producer, owner, _ = _setup(db)
    stranger = make_user(db, role="consumer", email="stranger@example.com")
    r, sent = _detach(client, producer, owner, stranger)
    assert r.status_code == 403
    r, sent = _detach(client, producer, owner, owner)
    assert r.status_code == 403
    db.expire_all()
    assert db.get(User, owner.id).producer_id == producer.id


def test_the_old_session_stops_working(client, db):
    from app.auth import create_access_token

    producer, owner, admin = _setup(db)
    old = {
        "Authorization": f"Bearer {create_access_token(owner.id, owner.token_version)}"
    }
    assert client.get("/auth/me", headers=old).status_code == 200
    r, _ = _detach(client, producer, owner, admin)
    assert r.status_code == 200
    assert client.get("/auth/me", headers=old).status_code == 401


def test_the_email_tells_her_the_account_stays():
    from app.services import owner_detach

    seen = []
    with mock.patch.object(
        owner_detach, "send_email", side_effect=lambda *a, **k: seen.append((a, k))
    ):
        owner_detach.send_owner_detached_email(
            "a@example.com", "דנה", "<b>מאפיית הגבעה</b>", test_cause=True
        )
    (to, subject, body), kw = seen[0][0][:3], seen[0][1]
    assert to == "a@example.com"
    assert "מאפיית הגבעה" in subject
    assert "החשבון עצמו נשאר" in body
    assert "&lt;b&gt;" in kw["html"], "the business name is escaped in HTML"
    assert kw["test_cause"] is True


def test_the_admin_payload_names_the_owner_id(client, db):
    """The panel needs the id to send as expected_owner_user_id."""
    producer, owner, admin = _setup(db)
    r = client.get(f"/admin/producers/{producer.id}", headers=auth_header(admin))
    assert r.status_code == 200, r.text
    assert r.json()["owner"]["id"] == str(owner.id)


def test_the_old_refresh_token_stops_working(client, db):
    """Review: the bump must retire the 14-day refresh token too, not only the
    15-minute access token."""
    from app.auth import create_refresh_token

    producer, owner, admin = _setup(db)
    refresh = create_refresh_token(owner.id, owner.token_version)
    r, _ = _detach(client, producer, owner, admin)
    assert r.status_code == 200
    res = client.post("/auth/refresh", cookies={"refresh_token": refresh})
    assert res.status_code == 401


def test_surrounding_spaces_in_the_typed_name_are_ignored(client, db):
    producer, owner, admin = _setup(db)
    r, _ = _detach(client, producer, owner, admin, confirm_name=f"  {producer.name}  ")
    assert r.status_code == 200, r.text


def test_the_protected_super_admin_is_never_detached(client, db, monkeypatch):
    """Review: role alone is not the whole guard — the SUPER_ADMIN_EMAIL
    account is protected even when its role row says something else."""
    from app.services import account_guards

    producer, owner, admin = _setup(db)
    monkeypatch.setattr(account_guards.settings, "super_admin_email", owner.email)
    r, sent = _detach(client, producer, owner, admin)
    assert r.status_code == 403
    db.expire_all()
    assert db.get(User, owner.id).producer_id == producer.id
    assert sent == []


def test_two_linked_accounts_are_refused(client, db):
    """users.producer_id is not unique; detaching one of two would answer ok
    and leave the business still owned."""
    producer, owner, admin = _setup(db)
    second = make_user(db, role="producer", email="second-owner@example.com")
    second.producer_id = producer.id
    db.commit()
    r, sent = _detach(client, producer, owner, admin)
    assert r.status_code == 409
    db.expire_all()
    assert db.get(User, owner.id).producer_id == producer.id
    assert db.get(User, second.id).producer_id == producer.id
    assert sent == []


def test_an_owner_hosting_a_live_experience_is_not_detached(client, db):
    """Review: an experience belongs to its host USER. Detaching would leave
    the former owner holding the business's upcoming experience and its
    sign-ups, so the detach waits until none is live."""
    from test_experiences import _make_experience

    producer, owner, admin = _setup(db)
    _make_experience(db, owner, status="approved")
    r, sent = _detach(client, producer, owner, admin)
    assert r.status_code == 409
    assert "חוויות" in r.json()["detail"]
    db.expire_all()
    assert db.get(User, owner.id).producer_id == producer.id
    assert sent == []


def test_a_past_or_cancelled_experience_does_not_block(client, db):
    from datetime import timedelta

    from app.utils.clock import israel_today
    from test_experiences import _make_experience

    producer, owner, admin = _setup(db)
    _make_experience(
        db, owner, status="approved", event_date=israel_today() - timedelta(days=3)
    )
    _make_experience(db, owner, status="approved", is_active=False)
    _make_experience(db, owner, status="rejected")
    r, _ = _detach(client, producer, owner, admin)
    assert r.status_code == 200, r.text
