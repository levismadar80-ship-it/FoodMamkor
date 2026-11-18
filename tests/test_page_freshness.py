"""
Page freshness: the monthly "is everything still correct?" owner email.

Covers:
  - services/page_freshness.send_freshness_emails: who gets it (live business,
    older than a month, verified owner, not confirmed or emailed this month),
    that a send stamps freshness_email_sent_at, that a second run sends
    nothing, and that the job is off until the flag is set;
  - POST /page-freshness/confirm: a valid token stamps last_confirmed_at; an
    expired token, another scope's token, garbage, and a business that is no
    longer live all get one identical 404;
  - GET /admin/producers?freshness_stale=true: the admin view.

Windows are 30 and 60 days; seeds sit 10+ days away from either edge, and
are built from the Israel clock (israel_days_ago) per .claude/rules/testing.md.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import pytest

from app.services import page_freshness as pf
from app.auth import create_producer_claim_token
from conftest import auth_header, israel_days_ago, make_producer, make_user


def _naive(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def _business(db, *, name="מאפיית הבדיקה", age_days=90, status="approved", owner=True):
    producer = make_producer(db, name=name, status=status)
    producer.created_at = _naive(israel_days_ago(age_days))
    owner_user = None
    if owner:
        owner_user = make_user(db, role="producer", email_verified=True)
        owner_user.producer_id = producer.id
    db.commit()
    return producer, owner_user


@pytest.fixture
def sent(monkeypatch):
    calls = []

    def fake_send(to, subject, body, **kwargs):
        calls.append({"to": to, "subject": subject, "body": body, **kwargs})

    monkeypatch.setattr(pf, "send_email", fake_send)
    return calls


@pytest.fixture
def enabled(monkeypatch):
    monkeypatch.setattr(pf, "freshness_enabled", lambda: True)


def _token_from(body: str) -> str:
    url = next(line for line in body.splitlines() if "/freshness/confirm" in line)
    return parse_qs(urlparse(url.strip()).query)["token"][0]


class TestSend:
    def test_off_by_default_sends_nothing(self, db, sent):
        _business(db)
        assert pf.freshness_enabled() is False
        assert pf.send_freshness_emails(db)["sent"] == 0
        assert sent == []

    def test_due_business_gets_one_email_and_is_stamped(self, db, sent, enabled):
        producer, owner = _business(db, name="גבינות הגליל")
        counters = pf.send_freshness_emails(db)
        assert counters["sent"] == 1
        assert sent[0]["to"] == owner.email
        assert sent[0]["subject"] == "העמוד של גבינות הגליל במהמקור: הכול עדיין נכון?"
        assert "/freshness/confirm?token=" in sent[0]["body"]
        assert "/producer/dashboard" in sent[0]["body"]
        db.refresh(producer)
        assert producer.freshness_email_sent_at is not None
        # A second run in the same month sends nothing.
        assert pf.send_freshness_emails(db)["sent"] == 0
        assert len(sent) == 1

    def test_name_with_braces_does_not_break_the_send(self, db, sent, enabled):
        _business(db, name="מאפה {אמא}")
        assert pf.send_freshness_emails(db)["sent"] == 1
        assert "מאפה {אמא}" in sent[0]["subject"]

    @pytest.mark.parametrize(
        "case",
        ["young", "confirmed_recently", "emailed_recently", "not_live", "no_owner"],
    )
    def test_skips(self, db, sent, enabled, case):
        producer, _ = _business(
            db,
            age_days=10 if case == "young" else 90,
            status="pending" if case == "not_live" else "approved",
            owner=case != "no_owner",
        )
        if case == "confirmed_recently":
            producer.last_confirmed_at = israel_days_ago(10)
        if case == "emailed_recently":
            producer.freshness_email_sent_at = israel_days_ago(10)
        db.commit()
        assert pf.send_freshness_emails(db)["sent"] == 0
        assert sent == []
        if case == "no_owner":
            # Not stamped: it stays visible in the admin stale view.
            db.refresh(producer)
            assert producer.freshness_email_sent_at is None

    def test_test_owner_send_is_marked_test_cause(self, db, sent, enabled):
        # The send layer drops a test_cause send (MEH-2952); this pins that
        # the flag is passed, so a demo owner never gets a real email.
        _, owner = _business(db)
        owner.is_test = True
        db.commit()
        pf.send_freshness_emails(db)
        assert len(sent) == 1
        assert sent[0]["test_cause"] is True

    def test_real_owner_send_is_not_test_cause(self, db, sent, enabled):
        _business(db)
        pf.send_freshness_emails(db)
        assert sent[0]["test_cause"] is False

    def test_test_business_is_skipped(self, db, sent, enabled):
        producer, _ = _business(db)
        producer.is_test = True
        db.commit()
        assert pf.send_freshness_emails(db)["sent"] == 0
        assert sent == []

    def test_old_confirmation_is_due_again(self, db, sent, enabled):
        producer, _ = _business(db)
        producer.last_confirmed_at = israel_days_ago(45)
        producer.freshness_email_sent_at = israel_days_ago(45)
        db.commit()
        assert pf.send_freshness_emails(db)["sent"] == 1


class TestConfirm:
    def test_valid_token_stamps_confirmation(self, client, db):
        producer, _ = _business(db, name="דבש מהכרמל")
        token = pf.create_confirm_token(producer.id)
        res = client.post("/page-freshness/confirm", json={"token": token})
        assert res.status_code == 200, res.text
        assert res.json()["business_name"] == "דבש מהכרמל"
        db.refresh(producer)
        assert producer.last_confirmed_at is not None

    def test_token_from_the_email_works(self, client, db, sent, enabled):
        producer, _ = _business(db)
        pf.send_freshness_emails(db)
        res = client.post(
            "/page-freshness/confirm", json={"token": _token_from(sent[0]["body"])}
        )
        assert res.status_code == 200
        db.refresh(producer)
        assert producer.last_confirmed_at is not None

    def test_dead_links_share_one_body(self, client, db):
        producer, _ = _business(db)
        gone, _ = _business(db, name="נסגר", status="inactive")
        expired = pf.create_confirm_token(
            producer.id, now=datetime.now(timezone.utc) - timedelta(days=30)
        )
        # Same key, has `exp`, other scope: only the scope check refuses it.
        other_scope, _ = create_producer_claim_token(producer.id)
        bodies = []
        for token in (
            expired,
            other_scope,
            "garbage",
            pf.create_confirm_token(gone.id),
        ):
            res = client.post("/page-freshness/confirm", json={"token": token})
            assert res.status_code == 404, token
            bodies.append(res.json())
        assert all(b == bodies[0] for b in bodies)
        assert (
            bodies[0]["detail"]
            == "הקישור הזה כבר לא פעיל. אפשר לעדכן את העמוד מהלוח שלך."
        )
        db.refresh(producer)
        assert producer.last_confirmed_at is None
        # Control: the same business with a good token is confirmed.
        good = client.post(
            "/page-freshness/confirm",
            json={"token": pf.create_confirm_token(producer.id)},
        )
        assert good.status_code == 200


class TestAdminStaleView:
    def test_filter_lists_only_unconfirmed_old_pages(self, client, db):
        admin = make_user(db, role="admin")
        stale, _ = _business(db, name="ישן", age_days=120)
        fresh, _ = _business(db, name="אושר", age_days=120)
        fresh.last_confirmed_at = israel_days_ago(5)
        young, _ = _business(db, name="חדש", age_days=20)
        ownerless, _ = _business(db, name="בלי בעלים", age_days=120, owner=False)
        db.commit()
        res = client.get(
            "/admin/producers?status=all&freshness_stale=true",
            headers=auth_header(admin),
        )
        assert res.status_code == 200, res.text
        names = {row["name"] for row in res.json()}
        assert names == {"ישן", "בלי בעלים"}
        # The admin shape carries the date.
        rows = client.get(
            "/admin/producers?status=all", headers=auth_header(admin)
        ).json()
        by_name = {r["name"]: r for r in rows}
        assert by_name["אושר"]["last_confirmed_at"] is not None
        assert by_name["ישן"]["last_confirmed_at"] is None


# Sunday 22/11/2026, 09:00 Israel (07:00 UTC); Monday 23/11, same hour.
SUNDAY = datetime(2026, 11, 22, 7, 0, tzinfo=timezone.utc)
MONDAY = SUNDAY + timedelta(days=1)


class TestStaleDigest:
    @pytest.fixture
    def admin_mail(self, monkeypatch):
        from app.services import page_freshness_digest as dg

        calls = []
        monkeypatch.setattr(
            dg,
            "send_email",
            lambda to, subject, body, **kw: calls.append((to, subject, body)),
        )
        monkeypatch.setattr(dg.settings, "admin_email", "admin@example.com")
        return dg, calls

    def _seed(self, db):
        old = SUNDAY - timedelta(days=120)
        stale, _ = _business(db, name="ישן")
        stale.created_at = _naive(old)
        stale.last_confirmed_at = SUNDAY - timedelta(days=75)
        never, _ = _business(db, name="בלי בעלים", owner=False)
        never.created_at = _naive(old)
        fresh, _ = _business(db, name="אושר")
        fresh.created_at = _naive(old)
        fresh.last_confirmed_at = SUNDAY - timedelta(days=5)
        # A real-looking business whose owner account is a test account.
        test_row, test_owner = _business(db, name="עסק בדיקה")
        test_row.created_at = _naive(old)
        test_owner.is_test = True
        # And a business that is itself a test row.
        test_biz, _ = _business(db, name="עסק דמו")
        test_biz.created_at = _naive(old)
        test_biz.is_test = True
        db.commit()

    def test_sunday_lists_only_stale_live_pages(self, db, monkeypatch, admin_mail):
        dg, calls = admin_mail
        monkeypatch.setattr(dg, "freshness_enabled", lambda: True)
        self._seed(db)
        assert dg.send_stale_digest(db, now=SUNDAY) == 2
        to, subject, body = calls[0]
        assert to == "admin@example.com"
        assert subject == "מהמקור - 2 עמודים לא נבדקו יותר מ-60 יום"
        lines = [line for line in body.splitlines() if line.startswith("- ")]
        # Never-confirmed first; the ownerless page says so.
        assert lines[0].startswith("- בלי בעלים")
        assert "לא נבדק אף פעם" in lines[0] and "אין מייל של בעלים" in lines[0]
        assert lines[1].startswith("- ישן") and "נבדק לפני 75 ימים" in lines[1]
        assert "אין מייל" not in lines[1]
        assert "אושר" not in body and "עסק בדיקה" not in body and "עסק דמו" not in body

    def test_other_days_and_flag_off_send_nothing(self, db, monkeypatch, admin_mail):
        dg, calls = admin_mail
        self._seed(db)
        assert dg.send_stale_digest(db, now=SUNDAY) == 0  # flag off
        monkeypatch.setattr(dg, "freshness_enabled", lambda: True)
        assert dg.send_stale_digest(db, now=MONDAY) == 0
        assert calls == []
        assert dg.send_stale_digest(db, now=SUNDAY) == 2

    def test_nothing_stale_no_email(self, db, monkeypatch, admin_mail):
        dg, calls = admin_mail
        monkeypatch.setattr(dg, "freshness_enabled", lambda: True)
        assert dg.send_stale_digest(db, now=SUNDAY) == 0
        assert calls == []
