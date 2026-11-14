"""
Module:   test_meh3226_no_show_emails
Purpose:  MEH-3226 (D4 of the 14/11 grill retro). Each no-show the business
          marks mails the buyer: the first explains what two do, the second
          says the block is on. /admin/users shows who is blocked, and the
          admin release restarts the count. Copy approved by Sapir 14/11.
Touches:  Postgres test DB via TestClient; send_email patched in the service.
Related:  backend/app/services/rescue_no_show.py · routers/rescue.py
          (mark_no_show, clear_no_show_block) · routers/admin_extra.py
History:  MEH-3226 (creation)
"""

from datetime import timedelta

import pytest

from app.models.models import RescueOrder
from app.utils.clock import utc_now
from tests.conftest import auth_header, make_user
from tests.test_rescue import _seed_offer, rescue_on, shop  # noqa: F401

FIRST = "שתי אי-הגעות בתוך 30 יום חוסמות שריון של סלים חדשים."
SECOND = "זו אי-ההגעה השנייה ב-30 הימים האחרונים, ולכן כרגע אי אפשר לשריין סלים חדשים."


@pytest.fixture
def mails(monkeypatch):
    out = []
    monkeypatch.setattr(
        "app.services.rescue_no_show.send_email",
        lambda to, subject, body, html=None, test_cause=False: out.append(
            {
                "to": to,
                "subject": subject,
                "body": body,
                "html": html,
                "test": test_cause,
            }
        ),
    )
    return out


def _ended_order(db, shop, buyer, code):
    now = utc_now()
    offer = _seed_offer(
        db,
        shop["location"],
        qty_total=1,
        qty_left=0,
        pickup_start=now - timedelta(hours=3),
        pickup_end=now - timedelta(hours=1),
        cancel_until=now - timedelta(hours=4),
    )
    order = RescueOrder(offer_id=offer.id, user_id=buyer.id, qty=1, pickup_code=code)
    db.add(order)
    db.commit()
    return order


def _mark(client, shop, order):
    return client.post(
        f"/rescue/orders/{order.id}/no_show", headers=auth_header(shop["owner"])
    )


class TestNoShowMail:
    def test_the_first_no_show_warns(self, client, db, shop, rescue_on, mails):
        buyer = make_user(db, email="buyer@example.com")
        r = _mark(client, shop, _ended_order(db, shop, buyer, "0001"))
        assert r.status_code == 200, r.text
        assert len(mails) == 1
        m = mails[0]
        assert m["to"] == "buyer@example.com"
        assert m["subject"] == "הסל במאפיית ההצלה לא נאסף"
        assert "בית העסק מאפיית ההצלה סימן שהסל ששריינתם ל-" in m["body"]
        assert FIRST in m["body"] and SECOND not in m["body"]
        assert "אם זו טעות, כתבו לנו ונבדוק: " in m["body"]
        assert m["body"].rstrip().endswith("/contact")
        assert 'href="' in m["html"] and "/contact" in m["html"]

    def test_the_second_no_show_says_the_block_is_on(
        self, client, db, shop, rescue_on, mails
    ):
        buyer = make_user(db, email="buyer@example.com")
        _mark(client, shop, _ended_order(db, shop, buyer, "0001"))
        _mark(client, shop, _ended_order(db, shop, buyer, "0002"))
        assert [SECOND in m["body"] for m in mails] == [False, True]
        assert FIRST not in mails[1]["body"]

    def test_a_refused_mark_sends_nothing(self, client, db, shop, rescue_on, mails):
        buyer = make_user(db, email="buyer@example.com")
        order = _ended_order(db, shop, buyer, "0001")
        order.status = "cancelled"
        db.commit()
        assert _mark(client, shop, order).status_code == 409
        assert mails == []

    def test_after_a_release_the_next_no_show_warns_again(
        self, client, db, shop, rescue_on, mails
    ):
        buyer = make_user(db, email="buyer@example.com")
        admin = make_user(db, email="admin@example.com", role="admin")
        _mark(client, shop, _ended_order(db, shop, buyer, "0001"))
        _mark(client, shop, _ended_order(db, shop, buyer, "0002"))
        r = client.post(
            f"/admin/rescue/users/{buyer.id}/clear-block", headers=auth_header(admin)
        )
        assert r.status_code == 200 and r.json()["blocked"] is False
        _mark(client, shop, _ended_order(db, shop, buyer, "0003"))
        assert FIRST in mails[-1]["body"]


class TestAdminUsersList:
    def _list(self, client, db):
        admin = make_user(db, email="admin@example.com", role="admin")
        r = client.get("/admin/users", headers=auth_header(admin))
        assert r.status_code == 200, r.text
        return {u["email"]: u for u in r.json()}

    def test_blocked_state_per_user(self, client, db, shop, rescue_on, mails):
        none = make_user(db, email="none@example.com")
        once = make_user(db, email="once@example.com")
        twice = make_user(db, email="twice@example.com")
        _mark(client, shop, _ended_order(db, shop, once, "0001"))
        _mark(client, shop, _ended_order(db, shop, twice, "0002"))
        _mark(client, shop, _ended_order(db, shop, twice, "0003"))
        rows = self._list(client, db)
        got = {
            e: (rows[e]["rescue_active_no_shows"], rows[e]["rescue_blocked"])
            for e in (none.email, once.email, twice.email)
        }
        assert got == {
            "none@example.com": (0, False),
            "once@example.com": (1, False),
            "twice@example.com": (2, True),
        }

    def test_a_release_clears_the_list_flag(self, client, db, shop, rescue_on, mails):
        buyer = make_user(db, email="twice@example.com")
        _mark(client, shop, _ended_order(db, shop, buyer, "0001"))
        _mark(client, shop, _ended_order(db, shop, buyer, "0002"))
        admin = make_user(db, email="admin2@example.com", role="admin")
        client.post(
            f"/admin/rescue/users/{buyer.id}/clear-block", headers=auth_header(admin)
        )
        row = self._list(client, db)["twice@example.com"]
        assert (row["rescue_active_no_shows"], row["rescue_blocked"]) == (0, False)


class TestReviewCells:
    """Cells the stronger-model review named (MEH-3226)."""

    def test_a_third_no_show_does_not_say_second(
        self, client, db, shop, rescue_on, mails
    ):
        buyer = make_user(db, email="buyer@example.com")
        orders = [_ended_order(db, shop, buyer, f"000{i}") for i in range(3)]
        for o in orders:
            _mark(client, shop, o)
        third = mails[-1]["body"]
        assert SECOND not in third
        assert "שתי אי-הגעות בתוך 30 יום חוסמות שריון של סלים חדשים." in third
        assert "אפשר לבטל בחינם" not in third

    def test_a_test_buyer_or_business_marks_the_mail_as_test(
        self, client, db, shop, rescue_on, mails
    ):
        tester = make_user(db, email="tester@example.com")
        tester.is_test = True
        real = make_user(db, email="real@example.com")
        db.commit()
        _mark(client, shop, _ended_order(db, shop, tester, "0001"))
        _mark(client, shop, _ended_order(db, shop, real, "0002"))
        assert [(m["to"], m["test"]) for m in mails] == [
            ("tester@example.com", True),
            ("real@example.com", False),
        ]

    def test_the_html_escapes_the_business_name(self, monkeypatch):
        from app.services import rescue_no_show

        out = []
        monkeypatch.setattr(
            rescue_no_show,
            "send_email",
            lambda to, subject, body, **k: out.append(k["html"]),
        )
        rescue_no_show.send_no_show_email(
            "b@example.com", "<b>מאפייה</b>", "14.11.2026", active=1
        )
        assert "<b>" not in out[0] and "&lt;b&gt;" in out[0]
