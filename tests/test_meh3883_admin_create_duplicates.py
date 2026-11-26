"""MEH-3883 — the admin «new business» form stops before opening a second page.

26/11: page threads build many admin drafts in parallel before the Friday
outreach. POST /admin/producers created a business whatever it shared with an
existing one; the only signal was the list's «כפילות?» (name + main phone),
after the fact. Now a match on phone (either), email, Instagram, website or
Facebook answers 409 with the matching businesses, before anything is written,
and `allow_duplicate: true` creates it anyway.

States (CLAUDE.md 5-state): 0 matches → 201 · 1 match (owned / unowned) →
409 with that one · many → 409 with at most MAX_SHOWN, strongest first.
"""

import pytest

from app.models import Producer
from app.services.admin_create_duplicates import DUPLICATE_CODE, MAX_SHOWN
from conftest import auth_header, make_producer, make_user


def _admin(db):
    return auth_header(make_user(db, role="admin"))


def _body(**overrides):
    body = {
        "name": "עסק חדש לבדיקה",
        "city": "תל אביב",
        "description": "תיאור קצר של העסק החדש",
        "as_draft": True,
    }
    body.update(overrides)
    return body


def _existing(db, name="Farmerim", status="draft", **cols):
    biz = make_producer(db, name=name, status=status)
    for k, v in cols.items():
        setattr(biz, k, v)
    db.commit()
    return biz


def _count(db, name):
    return db.query(Producer).filter(Producer.name == name).count()


def test_no_match_creates_as_before(client, db):
    _existing(db, phone="0521111111", instagram="someone_else")
    r = client.post(
        "/admin/producers",
        json=_body(phone="0529999999", instagram="new_biz"),
        headers=_admin(db),
    )
    assert r.status_code == 201, r.text


@pytest.mark.parametrize(
    ("existing", "sent", "reason"),
    [
        ({"phone": "052-555-1234"}, {"phone": "+972525551234"}, "phone"),
        # Farmerim: the match was the page's SECOND phone.
        ({"secondary_phone": "0525551234"}, {"phone": "052 555 1234"}, "phone"),
        ({"phone": "0525551234"}, {"secondary_phone": "0525551234"}, "phone"),
        (
            {"contact_email": "Order@Farmerim.com"},
            {"contact_email": "order@farmerim.com"},
            "email",
        ),
        (
            {"instagram": "https://www.instagram.com/farmerim/"},
            {"instagram": "@Farmerim"},
            "instagram",
        ),
        (
            {"website": "https://www.farmerim.com/"},
            {"website": "http://farmerim.com"},
            "website",
        ),
        (
            {"facebook": "https://facebook.com/farmerim"},
            {"facebook": "https://www.facebook.com/farmerim/"},
            "facebook",
        ),
    ],
)
def test_each_signal_stops_the_create(client, db, existing, sent, reason):
    biz = _existing(db, **existing)
    r = client.post("/admin/producers", json=_body(**sent), headers=_admin(db))
    assert r.status_code == 409, r.text
    detail = r.json()["detail"]
    assert detail["code"] == DUPLICATE_CODE
    assert [m["id"] for m in detail["matches"]] == [str(biz.id)]
    assert reason in detail["matches"][0]["reasons"]
    assert _count(db, "עסק חדש לבדיקה") == 0  # nothing was written


def test_owned_match_shows_the_owner_account(client, db):
    biz = _existing(db, status="approved", phone="0525551234")
    owner = make_user(db, email="order@farmerim.com", role="producer")
    owner.producer_id = biz.id
    db.commit()
    r = client.post(
        "/admin/producers", json=_body(phone="0525551234"), headers=_admin(db)
    )
    assert r.status_code == 409
    m = r.json()["detail"]["matches"][0]
    assert (m["name"], m["status"], m["owner_email"]) == (
        "Farmerim",
        "approved",
        "order@farmerim.com",
    )


def test_unowned_match_has_no_owner_email(client, db):
    _existing(db, phone="0525551234")
    r = client.post(
        "/admin/producers", json=_body(phone="0525551234"), headers=_admin(db)
    )
    assert r.json()["detail"]["matches"][0]["owner_email"] is None


def test_owner_account_email_matches_the_contact_email(client, db):
    """The owner's login address is the business's too, even when the page's
    contact email is something else."""
    biz = _existing(db)
    owner = make_user(db, email="order@farmerim.com", role="producer")
    owner.producer_id = biz.id
    db.commit()
    r = client.post(
        "/admin/producers",
        json=_body(contact_email="order@farmerim.com"),
        headers=_admin(db),
    )
    assert r.status_code == 409


def test_many_matches_are_capped_strongest_first(client, db):
    strong = _existing(db, name="א חזק", phone="0525551234", instagram="farmerim")
    for i in range(MAX_SHOWN + 1):
        _existing(db, name=f"ב חלש {i}", phone="0525551234")
    r = client.post(
        "/admin/producers",
        json=_body(phone="0525551234", instagram="farmerim"),
        headers=_admin(db),
    )
    matches = r.json()["detail"]["matches"]
    assert len(matches) == MAX_SHOWN
    assert r.json()["detail"]["total"] == MAX_SHOWN + 2
    assert matches[0]["id"] == str(strong.id)


def test_allow_duplicate_creates_anyway(client, db):
    _existing(db, phone="0525551234")
    r = client.post(
        "/admin/producers",
        json=_body(phone="0525551234", allow_duplicate=True),
        headers=_admin(db),
    )
    assert r.status_code == 201, r.text
    assert _count(db, "עסק חדש לבדיקה") == 1


def test_test_business_does_not_block_a_real_create(client, db):
    """Admin create cannot set is_test, so a seeded test business (staging
    demo) neither blocks it nor shows its owner (MEH-2952 worlds)."""
    _existing(db, phone="0525551234", is_test=True)
    r = client.post(
        "/admin/producers", json=_body(phone="0525551234"), headers=_admin(db)
    )
    assert r.status_code == 201, r.text


def test_dummy_phone_does_not_match(client, db):
    _existing(db, phone="0500000000")
    r = client.post(
        "/admin/producers", json=_body(phone="0500000000"), headers=_admin(db)
    )
    assert r.status_code == 201, r.text


def test_non_admin_never_reaches_the_check(client, db):
    _existing(db, phone="0525551234")
    r = client.post(
        "/admin/producers",
        json=_body(phone="0525551234"),
        headers=auth_header(make_user(db, role="consumer")),
    )
    assert r.status_code == 403
