"""
Module:   test_business_community_row
Purpose:  The dashboard's «קבוצת העדכונים לבתי עסק» row gets its invite link
          from GET /producers/me/dashboard (`community_invite_url`) — only for
          an approved business, and only when WHATSAPP_COMMUNITY_INVITE_URL
          is set.
Touches:  GET /producers/me/dashboard.
Related:  backend/app/routers/producer_me.py _community_invite_url ·
          frontend/components/producer/CommunityRow.jsx.
Cells:    set × approved → the link · set × pending → None · set × organizer
          → None · set × seeded test row → the link · unset → None ·
          whitespace-only → None.
"""
import pytest

from app.config import settings
from app.models import Producer
from conftest import auth_header
from test_meh2763_registrations import _owner

# NOT a real invite — the repo is public (config.py:93). `.invalid` never resolves.
FAKE_INVITE_URL = "https://example.invalid/community-row-fake-invite"


def _invite(client, owner):
    r = client.get("/producers/me/dashboard", headers=auth_header(owner))
    assert r.status_code == 200, r.text
    return r.json()["community_invite_url"]


@pytest.fixture
def invite_set(monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_community_invite_url", FAKE_INVITE_URL)


def test_approved_business_gets_the_link(client, db, invite_set):
    owner = _owner(db, email="community-ok@example.com")
    assert _invite(client, owner) == FAKE_INVITE_URL


def test_pending_business_gets_none(client, db, invite_set):
    owner = _owner(db, email="community-pending@example.com", status="pending")
    assert _invite(client, owner) is None


def test_organizer_gets_none(client, db, invite_set):
    owner = _owner(db, email="community-org@example.com")
    db.get(Producer, owner.producer_id).kind = "organizer"
    db.commit()
    assert _invite(client, owner) is None


@pytest.mark.parametrize("value", ["", "   "])
def test_unset_or_blank_setting_gives_none(client, db, monkeypatch, value):
    monkeypatch.setattr(settings, "whatsapp_community_invite_url", value)
    owner = _owner(db, email="community-unset@example.com")
    assert _invite(client, owner) is None


def test_padded_setting_is_returned_stripped(client, db, monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_community_invite_url", f"  {FAKE_INVITE_URL}\n")
    owner = _owner(db, email="community-padded@example.com")
    assert _invite(client, owner) == FAKE_INVITE_URL


def test_seeded_test_business_still_gets_the_link(client, db, invite_set):
    """The demo owner on staging is a seeded test row; the row must show there."""
    owner = _owner(db, email="community-test-row@example.com")
    db.get(Producer, owner.producer_id).is_test = True
    db.commit()
    assert _invite(client, owner) == FAKE_INVITE_URL
