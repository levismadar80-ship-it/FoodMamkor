"""MEH-3268 (B9 follow-up): an invite accepted for a page that lost its photo
(or its required licence number) after the invite went out links the owner
but leaves the page hidden.

MEH-3246 gates SENDING the invite. Between the send and the acceptance only an
admin edit can remove the photo, and the owner cannot fix that from the accept
page — so a 422 would strand her. Instead: she becomes the owner, the page
stays `inactive`, the admin is told the page did not go live and what is
missing, and the owner is not sent the «your page is live» email.
"""

from conftest import make_category, make_producer, make_user
from app.routers import producer_owner_invite as poi
from app.routers import producer_owner_invite_existing as poe
from test_meh3256_owner_invite_existing import _accept, _arm, _consumer
from test_producer_owner_invite import _PHOTO, _row, accept_invite, invite

_APPROVED_SUBJECT = "ברוכים הבאים למהמקור"


def _record(monkeypatch, module):
    notes, mails = [], []
    monkeypatch.setattr(
        module,
        "notify_admin_owner_invite_accepted",
        lambda *a, **k: notes.append((a, k)),
    )
    monkeypatch.setattr(module, "send_email", lambda *a, **k: mails.append(a))
    return notes, mails


def _hidden_invited_then_photo_removed(client, db, **kw):
    p = make_producer(db, status="inactive", images=_PHOTO, **kw)
    r, token = invite(client, db, p)
    assert r.status_code == 200, r.text
    p.images = []  # the admin edit that happens after the invite went out
    db.commit()
    return p, token


def test_photo_removed_after_invite_links_owner_and_keeps_page_hidden(
    client, db, monkeypatch
):
    notes, mails = _record(monkeypatch, poi)
    p, token = _hidden_invited_then_photo_removed(client, db)

    r = accept_invite(client, token)

    assert r.status_code == 200, r.text
    row = _row(db, p)
    assert row.status == "inactive"
    assert row.owner_invite_accepted_at is not None
    owner = db.query(poi.User).filter(poi.User.producer_id == p.id).one()
    assert owner.role == "producer"
    assert len(notes) == 1, notes
    (_, _, published), kw = notes[0]
    assert published is False
    assert kw["missing"] == ["תמונה"]
    assert [m for m in mails if m[1] == _APPROVED_SUBJECT] == []


def test_licence_category_without_licence_keeps_page_hidden(client, db, monkeypatch):
    notes, _ = _record(monkeypatch, poi)
    cat = make_category(db, name="לחמים ואפייה")
    p = make_producer(db, status="inactive", images=_PHOTO, category=cat)
    p.producer_license_number = "12345"
    db.commit()
    r, token = invite(client, db, p)
    assert r.status_code == 200, r.text
    p.producer_license_number = None
    db.commit()

    assert accept_invite(client, token).status_code == 200
    assert _row(db, p).status == "inactive"
    assert notes[0][1]["missing"] == ["מספר רישיון"]


def test_complete_hidden_page_still_goes_live(client, db, monkeypatch):
    notes, mails = _record(monkeypatch, poi)
    p = make_producer(db, status="inactive", images=_PHOTO)
    _, token = invite(client, db, p)

    assert accept_invite(client, token).status_code == 200
    assert _row(db, p).status == "approved"
    (_, _, published), kw = notes[0]
    assert published is True
    assert kw["missing"] == []
    assert len([m for m in mails if m[1] == _APPROVED_SUBJECT]) == 1


def test_signed_in_account_gets_the_same_treatment(client, db, monkeypatch):
    notes, mails = _record(monkeypatch, poe)
    p, token = _hidden_invited_then_photo_removed(client, db)
    user = _consumer(db)
    code = _arm(client, token, user)[2]

    r = _accept(client, token, user, code)

    assert r.status_code == 200, r.text
    assert _row(db, p).status == "inactive"
    db.refresh(user)
    assert user.producer_id == p.id
    assert notes[0][1]["missing"] == ["תמונה"]
    assert notes[0][0][2] is False
    assert [m for m in mails if m[1] == _APPROVED_SUBJECT] == []


def test_admin_message_says_the_page_did_not_go_live(monkeypatch):
    from app.services import auth_notifications as an

    sent = []
    monkeypatch.setattr(an.settings, "admin_whatsapp_to", "+972500000000")
    monkeypatch.setattr(an, "send_text", lambda to, msg, **k: sent.append(msg) or True)
    monkeypatch.setattr(an, "send_email", lambda *a, **k: None)

    an.notify_admin_owner_invite_accepted(
        "מאפיית דנה", "o@example.com", False, missing=["תמונה"]
    )

    assert len(sent) == 1
    assert "הדף לא עלה לאוויר" in sent[0]
    assert "חסר: תמונה" in sent[0]


def test_held_page_user_is_a_real_owner(client, db, monkeypatch):
    """The owner is linked even though nothing went live: a second invite for
    the same page is refused as already owned."""
    _record(monkeypatch, poi)
    p, token = _hidden_invited_then_photo_removed(client, db)
    assert accept_invite(client, token).status_code == 200
    p = _row(db, p)
    p.images = _PHOTO
    db.commit()
    r, _ = invite(
        client, db, p, admin=make_user(db, role="admin", email="a2@example.com")
    )
    assert r.status_code == 409, r.text
