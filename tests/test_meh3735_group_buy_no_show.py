"""
Module:   test_meh3735_group_buy_no_show
Purpose:  MEH-3735. A group-buy participant gets a pickup code; after pickup
          the business marks each code «נמסר» or «לא הגיע» (codes only, never
          names, MEH-1651); a no-show mails her; two in 30 days block joining
          group buys until an admin releases her. Separate from the rescue
          count.
Touches:  Postgres test DB via TestClient; send_email patched in the service.
Related:  backend/app/services/group_buy_no_show.py ·
          backend/app/routers/group_buy_pickup.py
History:  MEH-3735 (creation)
"""

from datetime import timedelta

import pytest

from app.models.models import GroupBuyCommit
from app.utils.clock import utc_now
from tests.conftest import auth_header, make_user
from tests.test_group_buys_api import _make_group_buy, _producer_user

WARN = (
    "שתי אי-הגעות בתוך 30 יום חוסמות הצטרפות לקבוצות רכישה חדשות. "
    "אם אי אפשר להגיע, אפשר לבטל את ההצטרפות עד המועד האחרון של הקבוצה."
)
BLOCK = (
    "זו אי-ההגעה השנייה ב-30 הימים האחרונים, ולכן כרגע אי אפשר להצטרף "
    "לקבוצות רכישה חדשות."
)
REFUSED = (
    "כרגע אי אפשר להצטרף: היו שתי אי-הגעות ב-30 הימים האחרונים. "
    "אם זו טעות, כתבו לנו."
)


@pytest.fixture
def mails(monkeypatch):
    out = []
    monkeypatch.setattr(
        "app.services.group_buy_no_show.send_email",
        lambda to, subject, body, html=None, test_cause=False: out.append(
            {"to": to, "subject": subject, "body": body, "html": html}
        ),
    )
    return out


def _ended_group(db, producer, *, status="funded"):
    """A group whose pickup window ended an hour ago."""
    gb = _make_group_buy(db, producer, status=status, min_participants=1)
    gb.pickup_starts_at = utc_now() - timedelta(hours=3)
    gb.pickup_ends_at = utc_now() - timedelta(hours=1)
    db.commit()
    return gb


def _commit(db, gb, user, code):
    c = GroupBuyCommit(group_buy_id=gb.id, user_id=user.id, quantity=2, pickup_code=code)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def _no_show(client, owner, gb, commit):
    return client.post(
        f"/group-buys/{gb.id}/commits/{commit.id}/no-show", headers=auth_header(owner)
    )


class TestPickupCode:
    def test_joining_gives_her_a_four_digit_code_on_the_page(self, client, db):
        producer, _ = _producer_user(db, email="c1-owner@example.com")
        gb = _make_group_buy(db, producer, min_participants=3)
        buyer = make_user(db, email="c1-buyer@example.com")
        r = client.post(
            f"/group-buys/{gb.id}/commit", json={"quantity": 1}, headers=auth_header(buyer)
        )
        assert r.status_code == 201, r.text
        mine = client.get(f"/group-buys/{gb.id}", headers=auth_header(buyer)).json()
        code = mine["user_commit"]["pickup_code"]
        assert len(code) == 4 and code.isdigit()


class TestOwnerList:
    def test_the_owner_sees_codes_and_quantities_and_no_person(self, client, db):
        producer, owner = _producer_user(db, email="l1-owner@example.com")
        gb = _ended_group(db, producer)
        buyer = make_user(db, email="l1-buyer@example.com", name="Dana Secret")
        _commit(db, gb, buyer, "0042")
        r = client.get(
            f"/producers/me/group-buys/{gb.id}/pickups", headers=auth_header(owner)
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["can_mark"] is True
        assert [(p["pickup_code"], p["quantity"]) for p in body["pickups"]] == [("0042", 2)]
        assert "Dana" not in r.text and "l1-buyer" not in r.text
        assert "user_id" not in body["pickups"][0]

    def test_another_business_cannot_read_the_list(self, client, db):
        producer, _ = _producer_user(db, email="l2-owner@example.com")
        _, stranger = _producer_user(db, email="l2-stranger@example.com")
        gb = _ended_group(db, producer)
        r = client.get(
            f"/producers/me/group-buys/{gb.id}/pickups", headers=auth_header(stranger)
        )
        assert r.status_code == 403

    def test_before_the_pickup_ends_nothing_can_be_marked(self, client, db):
        producer, owner = _producer_user(db, email="l3-owner@example.com")
        gb = _make_group_buy(db, producer, status="funded", min_participants=1)
        gb.pickup_starts_at = utc_now() + timedelta(hours=1)
        gb.pickup_ends_at = utc_now() + timedelta(hours=3)
        db.commit()
        buyer = make_user(db, email="l3-buyer@example.com")
        commit = _commit(db, gb, buyer, "1111")
        listed = client.get(
            f"/producers/me/group-buys/{gb.id}/pickups", headers=auth_header(owner)
        ).json()
        assert listed["can_mark"] is False
        assert _no_show(client, owner, gb, commit).status_code == 409


class TestMarking:
    def test_handed_then_no_show_is_refused(self, client, db, mails):
        producer, owner = _producer_user(db, email="m1-owner@example.com")
        gb = _ended_group(db, producer)
        buyer = make_user(db, email="m1-buyer@example.com")
        commit = _commit(db, gb, buyer, "2222")
        r = client.post(
            f"/group-buys/{gb.id}/commits/{commit.id}/handed", headers=auth_header(owner)
        )
        assert r.status_code == 200, r.text
        assert r.json()["handed_at"] is not None
        assert _no_show(client, owner, gb, commit).status_code == 409
        assert mails == []

    def test_another_business_cannot_mark(self, client, db, mails):
        producer, _ = _producer_user(db, email="m2-owner@example.com")
        _, stranger = _producer_user(db, email="m2-stranger@example.com")
        gb = _ended_group(db, producer)
        buyer = make_user(db, email="m2-buyer@example.com")
        commit = _commit(db, gb, buyer, "3333")
        assert _no_show(client, stranger, gb, commit).status_code == 403
        db.refresh(commit)
        assert commit.no_show_at is None and mails == []

    def test_a_commit_of_another_group_is_not_found(self, client, db):
        producer, owner = _producer_user(db, email="m3-owner@example.com")
        gb = _ended_group(db, producer)
        other = _ended_group(db, producer)
        buyer = make_user(db, email="m3-buyer@example.com")
        commit = _commit(db, other, buyer, "4444")
        assert _no_show(client, owner, gb, commit).status_code == 404

    def test_a_group_that_never_reached_its_goal_cannot_be_marked(self, client, db):
        producer, owner = _producer_user(db, email="m4-owner@example.com")
        gb = _ended_group(db, producer, status="cancelled")
        buyer = make_user(db, email="m4-buyer@example.com")
        commit = _commit(db, gb, buyer, "5555")
        assert _no_show(client, owner, gb, commit).status_code == 409

    def test_an_admin_may_mark(self, client, db, mails):
        producer, _ = _producer_user(db, email="m5-owner@example.com")
        admin = make_user(db, email="m5-admin@example.com", role="admin")
        gb = _ended_group(db, producer)
        buyer = make_user(db, email="m5-buyer@example.com")
        commit = _commit(db, gb, buyer, "6666")
        assert _no_show(client, admin, gb, commit).status_code == 200


class TestMailAndBlock:
    def test_first_warns_second_blocks_and_joining_is_refused(self, client, db, mails):
        producer, owner = _producer_user(db, email="b1-owner@example.com")
        buyer = make_user(db, email="b1-buyer@example.com")
        g1, g2 = _ended_group(db, producer), _ended_group(db, producer)
        c1, c2 = _commit(db, g1, buyer, "0001"), _commit(db, g2, buyer, "0002")

        assert _no_show(client, owner, g1, c1).status_code == 200
        assert len(mails) == 1 and mails[0]["to"] == "b1-buyer@example.com"
        assert WARN in mails[0]["body"] and BLOCK not in mails[0]["body"]
        assert "רכש קמח מלא" in mails[0]["body"]

        assert _no_show(client, owner, g2, c2).status_code == 200
        assert BLOCK in mails[1]["body"] and WARN not in mails[1]["body"]

        g3 = _make_group_buy(db, producer, min_participants=5)
        r = client.post(
            f"/group-buys/{g3.id}/commit", json={"quantity": 1}, headers=auth_header(buyer)
        )
        assert r.status_code == 403
        assert r.json()["detail"] == REFUSED

    def test_one_no_show_does_not_block(self, client, db, mails):
        producer, owner = _producer_user(db, email="b2-owner@example.com")
        buyer = make_user(db, email="b2-buyer@example.com")
        g1 = _ended_group(db, producer)
        _no_show(client, owner, g1, _commit(db, g1, buyer, "0003"))
        g2 = _make_group_buy(db, producer, min_participants=5)
        r = client.post(
            f"/group-buys/{g2.id}/commit", json={"quantity": 1}, headers=auth_header(buyer)
        )
        assert r.status_code == 201, r.text

    def test_no_shows_older_than_thirty_days_do_not_count(self, client, db, mails):
        producer, _ = _producer_user(db, email="b3-owner@example.com")
        buyer = make_user(db, email="b3-buyer@example.com")
        for code in ("0004", "0005"):
            gb = _ended_group(db, producer)
            c = _commit(db, gb, buyer, code)
            c.no_show_at = utc_now() - timedelta(days=31)
        db.commit()
        g = _make_group_buy(db, producer, min_participants=5)
        r = client.post(
            f"/group-buys/{g.id}/commit", json={"quantity": 1}, headers=auth_header(buyer)
        )
        assert r.status_code == 201, r.text

    def test_admin_release_lets_her_join_again(self, client, db, mails):
        producer, _ = _producer_user(db, email="b4-owner@example.com")
        admin = make_user(db, email="b4-admin@example.com", role="admin")
        buyer = make_user(db, email="b4-buyer@example.com")
        for code in ("0006", "0007"):
            gb = _ended_group(db, producer)
            c = _commit(db, gb, buyer, code)
            c.no_show_at = utc_now() - timedelta(hours=1)
        db.commit()
        nobody = make_user(db, email="b4-nobody@example.com")
        url = f"/admin/group-buys/users/{buyer.id}/clear-block"
        assert client.post(url, headers=auth_header(nobody)).status_code == 403
        r = client.post(url, headers=auth_header(admin))
        assert r.status_code == 200, r.text
        assert r.json()["active_no_shows"] == 0
        g = _make_group_buy(db, producer, min_participants=5)
        joined = client.post(
            f"/group-buys/{g.id}/commit", json={"quantity": 1}, headers=auth_header(buyer)
        )
        assert joined.status_code == 201, joined.text

    def test_the_admin_user_list_shows_the_block(self, client, db):
        producer, _ = _producer_user(db, email="b5-owner@example.com")
        admin = make_user(db, email="b5-admin@example.com", role="admin")
        buyer = make_user(db, email="b5-buyer@example.com")
        for code in ("0008", "0009"):
            gb = _ended_group(db, producer)
            c = _commit(db, gb, buyer, code)
            c.no_show_at = utc_now() - timedelta(hours=1)
        db.commit()
        rows = client.get("/admin/users", headers=auth_header(admin)).json()
        row = next(u for u in rows if u["email"] == "b5-buyer@example.com")
        assert row["group_buy_blocked"] is True
        assert row["group_buy_active_no_shows"] == 2
        assert row["rescue_blocked"] is False
