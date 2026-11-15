"""MEH-2626 — WhatsApp updates link, stage 1 (backend half).

`producers.whatsapp_group` already existed (MEH-1537) but:
  * the validator accepted only chat.whatsapp.com GROUP invites and rejected
    WhatsApp CHANNEL links (whatsapp.com/channel/…), the shape Sapir wants to
    recommend because a channel hides members' phone numbers;
  * a tap on the link was not a contact click, so it neither counted on the
    dashboard nor opened the first-review gate (reviews.py, MEH-2204);
  * an approved business could swap the link with nobody notified.

Each test below is named after the input it covers.
"""
from unittest.mock import patch

import pytest
from pydantic import ValidationError

from app.models.models import ContactClick
from app.schemas.schemas import ProducerAdminCreate, ProducerUpdate
from tests.conftest import auth_header, make_producer, make_user

HEBREW_ERROR = (
    "קישור לעדכונים בוואטסאפ חייב להתחיל ב-https://chat.whatsapp.com"
    " או ב-https://whatsapp.com/channel"
)

GROUP_LINK = "https://chat.whatsapp.com/ABCdef123"
CHANNEL_LINK = "https://whatsapp.com/channel/0029VaABCdef123"
WWW_CHANNEL_LINK = "https://www.whatsapp.com/channel/0029VaABCdef123"


def _admin_create(**overrides):
    base = dict(name="חוות אדמין")
    base.update(overrides)
    return ProducerAdminCreate(**base)


# --------------------------------------------------------------------------- #
# A1 — validator
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("schema_factory", [ProducerUpdate, _admin_create])
@pytest.mark.parametrize("url", [GROUP_LINK, CHANNEL_LINK, WWW_CHANNEL_LINK])
def test_whatsapp_updates_link_accepts_group_channel_and_www_channel(schema_factory, url):
    assert schema_factory(whatsapp_group=url).whatsapp_group == url


def test_whatsapp_updates_link_strips_surrounding_whitespace():
    assert ProducerUpdate(whatsapp_group=f"  {CHANNEL_LINK} ").whatsapp_group == CHANNEL_LINK


@pytest.mark.parametrize(
    "bad",
    [
        "http://whatsapp.com/channel/0029Va",  # wrong scheme
        "https://whatsapp.com/channel/",  # channel with no id
        "https://whatsapp.com/channel",  # channel with no id, no slash
        "https://whatsapp.com/0029Va",  # whatsapp.com but not a channel path
        "https://whatsapp.com/",  # bare site
        "https://evil.whatsapp.com/channel/0029Va",  # other subdomain
        "https://evilwhatsapp.com/channel/0029Va",  # look-alike host
        "https://wa.me/972501234567",  # personal chat link
        "https://whatsapp.com.evil.com/channel/x",  # suffix spoof
    ],
)
def test_whatsapp_updates_link_rejects_other_urls_with_hebrew_error(bad):
    with pytest.raises(ValidationError) as exc:
        ProducerUpdate(whatsapp_group=bad)
    assert HEBREW_ERROR in str(exc.value)


@pytest.mark.parametrize("blank", ["", "   "])
def test_whatsapp_updates_link_blank_becomes_none(blank):
    assert ProducerUpdate(whatsapp_group=blank).whatsapp_group is None


def _producer_user(db, *, status="approved", whatsapp_group=None, name="משק העדכונים"):
    producer = make_producer(db, name=name, status=status)
    producer.whatsapp_group = whatsapp_group
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def test_put_me_channel_link_persists(client, db):
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me", json={"whatsapp_group": CHANNEL_LINK}, headers=auth_header(user)
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.whatsapp_group == CHANNEL_LINK


def test_put_me_random_url_returns_422_with_exact_hebrew_error(client, db):
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"whatsapp_group": "https://example.com/join"},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text
    msgs = " · ".join(str(item.get("msg", "")) for item in resp.json()["detail"])
    assert HEBREW_ERROR in msgs


# --------------------------------------------------------------------------- #
# A2 — contact-click accepts method "whatsapp_group"
# --------------------------------------------------------------------------- #
def test_contact_click_whatsapp_group_returns_204_and_writes_row(client, db):
    producer = make_producer(db)
    visitor = make_user(db)
    resp = client.post(
        f"/producers/{producer.id}/contact-click",
        json={"method": "whatsapp_group"},
        headers=auth_header(visitor),
    )
    assert resp.status_code == 204, resp.text
    rows = db.query(ContactClick).filter(ContactClick.producer_id == producer.id).all()
    assert [(r.method, r.user_id) for r in rows] == [("whatsapp_group", visitor.id)]


def test_review_gate_opens_for_a_user_whose_only_contact_is_a_whatsapp_group_click(
    client, db
):
    """End to end through the real beacon endpoint — not a hand-inserted row —
    so the gate is shown to open for exactly what the page sends."""
    producer = make_producer(db)
    visitor = make_user(db)
    click = client.post(
        f"/producers/{producer.id}/contact-click",
        json={"method": "whatsapp_group"},
        headers=auth_header(visitor),
    )
    assert click.status_code == 204, click.text
    review = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 5, "body": "קיבלתי עדכון בערוץ והזמנתי, מעולה!"},
        headers=auth_header(visitor),
    )
    assert review.status_code == 201, review.text


# --------------------------------------------------------------------------- #
# A3 — admin ping on change (MEH-2073 sensitive-edit path)
# --------------------------------------------------------------------------- #
PATCH_TARGET = "app.routers.producer_me.notify_admin_producer_sensitive_edit"


def test_approved_business_changing_the_link_pings_admin_once(client, db):
    user, _ = _producer_user(db, whatsapp_group=GROUP_LINK)
    with patch(PATCH_TARGET) as ping:
        resp = client.put(
            "/producers/me", json={"whatsapp_group": CHANNEL_LINK}, headers=auth_header(user)
        )
    assert resp.status_code == 200, resp.text
    ping.assert_called_once_with(
        "משק העדכונים", ["whatsapp_group"], test_cause=False
    )


def test_approved_business_resaving_the_same_link_does_not_ping(client, db):
    user, _ = _producer_user(db, whatsapp_group=CHANNEL_LINK)
    with patch(PATCH_TARGET) as ping:
        resp = client.put(
            "/producers/me", json={"whatsapp_group": CHANNEL_LINK}, headers=auth_header(user)
        )
    assert resp.status_code == 200, resp.text
    ping.assert_not_called()


def test_whatsapp_group_admin_label_is_the_approved_hebrew():
    from app.services.auth_notifications import SENSITIVE_FIELD_LABELS

    assert SENSITIVE_FIELD_LABELS["whatsapp_group"] == "קישור לעדכונים בוואטסאפ"
