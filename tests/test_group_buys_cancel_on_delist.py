"""MEH-2498 — an admin taking a business off the site cancels its live group buys.

Since MEH-2484 a group buy of a business that is not approved is invisible: off
the list, its page 404s, it cannot be joined. A participant who joined before
the business was suspended or rejected was left with a group that still
claimed to be open and no page to leave it from. So when an admin moves a
business OUT of ``approved`` — suspend (``POST …/toggle-status``,
approved→inactive) or reject (``POST …/reject``, approved→rejected) — every
group buy of that business still ``open`` or ``funded`` becomes ``cancelled``,
and its participants get the delisted-cancel email.

Counts are tested at 0 / 1 / many (CLAUDE.md, conditional states). Each
side-effect case carries a no-change control: a business that was not approved
before, a group buy already fulfilled or cancelled, another business's group.
"""

from datetime import timedelta
from unittest import mock

from conftest import auth_header, make_producer, make_user

from app.models.models import GroupBuy, GroupBuyCommit
from app.services import group_buy_notifications
from app.utils.clock import utc_now


def _business(db, status="approved", email=None):
    producer = make_producer(db, name="מאפיית הגליל", status=status)
    owner = make_user(db, role="producer", email=email or f"owner-{producer.id}@example.com")
    owner.producer_id = producer.id
    db.commit()
    return producer, owner


def _group(db, producer, status="open", title="רכש קמח מלא"):
    gb = GroupBuy(
        producer_id=producer.id,
        title=title,
        product_name="קמח מלא",
        unit="שק",
        price_per_unit_regular=120,
        price_per_unit_group=90,
        min_participants=5,
        deadline=utc_now() + timedelta(days=7),
        city="תל אביב",
        status=status,
        fulfillment_note="איסוף מהמאפייה",
    )
    db.add(gb)
    db.commit()
    db.refresh(gb)
    return gb


def _join(db, gb, email):
    user = make_user(db, email=email)
    db.add(GroupBuyCommit(group_buy_id=gb.id, user_id=user.id, quantity=1))
    db.commit()
    return user


def _statuses(db, *gbs):
    db.expire_all()
    return [db.query(GroupBuy).filter(GroupBuy.id == g.id).one().status for g in gbs]


def _suspend(client, admin, producer):
    return client.post(
        f"/admin/producers/{producer.id}/toggle-status", headers=auth_header(admin)
    )


def _reject(client, admin, producer):
    return client.post(
        f"/admin/producers/{producer.id}/reject", json={}, headers=auth_header(admin)
    )


def _capture(monkeypatch):
    sent = []
    monkeypatch.setattr(
        "app.services.group_buy_notifications.send_email",
        lambda to, subject, body, html=None: sent.append((to, subject, body)),
    )
    return sent


class TestSuspendCancelsLiveGroupBuys:
    def test_zero_group_buys_suspend_still_works(self, client, db, monkeypatch):
        sent = _capture(monkeypatch)
        producer, _ = _business(db)
        admin = make_user(db, role="admin", email="admin0@example.com")
        assert _suspend(client, admin, producer).status_code == 200
        assert sent == []

    def test_one_open_group_is_cancelled_and_its_participant_told(
        self, client, db, monkeypatch
    ):
        sent = _capture(monkeypatch)
        producer, _ = _business(db)
        gb = _group(db, producer)
        _join(db, gb, "buyer1@example.com")
        admin = make_user(db, role="admin", email="admin1@example.com")

        assert _suspend(client, admin, producer).status_code == 200
        assert _statuses(db, gb) == ["cancelled"]
        assert [to for to, _, _ in sent] == ["buyer1@example.com"]
        assert "כבר לא מופיע במהמקור" in sent[0][2]

    def test_many_groups_open_and_funded_cancelled_finished_ones_untouched(
        self, client, db, monkeypatch
    ):
        sent = _capture(monkeypatch)
        producer, _ = _business(db)
        open_gb = _group(db, producer, "open", title="קבוצה א")
        funded_gb = _group(db, producer, "funded", title="קבוצה ב")
        fulfilled_gb = _group(db, producer, "fulfilled", title="קבוצה ג")
        cancelled_gb = _group(db, producer, "cancelled", title="קבוצה ד")
        for i, gb in enumerate((open_gb, funded_gb, fulfilled_gb, cancelled_gb)):
            _join(db, gb, f"many{i}@example.com")
        # Control: another business's open group is not touched.
        other, _ = _business(db, email="other-owner@example.com")
        other_gb = _group(db, other, "open")
        admin = make_user(db, role="admin", email="admin2@example.com")

        assert _suspend(client, admin, producer).status_code == 200
        assert _statuses(db, open_gb, funded_gb, fulfilled_gb, cancelled_gb, other_gb) == [
            "cancelled",
            "cancelled",
            "fulfilled",
            "cancelled",
            "open",
        ]
        # Only the two groups this action cancelled send mail — not the one that
        # was already cancelled, not the fulfilled one.
        assert sorted(to for to, _, _ in sent) == ["many0@example.com", "many1@example.com"]

    def test_the_owner_who_joined_her_own_group_is_not_mailed(
        self, client, db, monkeypatch
    ):
        sent = _capture(monkeypatch)
        producer, owner = _business(db, email="owner-joined@example.com")
        gb = _group(db, producer)
        db.add(GroupBuyCommit(group_buy_id=gb.id, user_id=owner.id, quantity=1))
        db.commit()
        _join(db, gb, "buyer-owner-case@example.com")
        admin = make_user(db, role="admin", email="admin3@example.com")

        assert _suspend(client, admin, producer).status_code == 200
        assert [to for to, _, _ in sent] == ["buyer-owner-case@example.com"]

    def test_reactivating_does_not_touch_group_buys(self, client, db, monkeypatch):
        sent = _capture(monkeypatch)
        producer, _ = _business(db, status="inactive")
        # Inserted directly: an inactive business cannot open one through the API.
        gb = _group(db, producer, "open")
        admin = make_user(db, role="admin", email="admin4@example.com")

        resp = _suspend(client, admin, producer)  # inactive -> approved
        assert resp.status_code == 200
        assert resp.json()["status"] == "approved"
        assert _statuses(db, gb) == ["open"]
        assert sent == []

    def test_a_failing_email_never_fails_the_suspension(self, client, db, monkeypatch):
        def _boom(*_a, **_k):
            raise RuntimeError("resend down")

        monkeypatch.setattr("app.services.group_buy_notifications.send_email", _boom)
        producer, _ = _business(db)
        gb = _group(db, producer)
        _join(db, gb, "buyer-boom@example.com")
        admin = make_user(db, role="admin", email="admin5@example.com")

        assert _suspend(client, admin, producer).status_code == 200
        assert _statuses(db, gb) == ["cancelled"]


class TestRejectCancelsLiveGroupBuys:
    def test_rejecting_an_approved_business_cancels_its_open_group(
        self, client, db, monkeypatch
    ):
        sent = _capture(monkeypatch)
        producer, _ = _business(db)
        gb = _group(db, producer)
        _join(db, gb, "buyer-rej@example.com")
        admin = make_user(db, role="admin", email="admin6@example.com")

        assert _reject(client, admin, producer).status_code == 200
        assert _statuses(db, gb) == ["cancelled"]
        # Exact list: the delisted-cancel email reaches the participant only.
        # (The owner's rejection email goes through admin.send_email, not here.)
        assert [to for to, _, _ in sent] == ["buyer-rej@example.com"]

    def test_rejecting_a_pending_business_does_not_touch_group_buys(
        self, client, db, monkeypatch
    ):
        sent = _capture(monkeypatch)
        producer, _ = _business(db, status="pending")
        gb = _group(db, producer)  # direct insert; the rule keys on the transition
        admin = make_user(db, role="admin", email="admin7@example.com")

        assert _reject(client, admin, producer).status_code == 200
        assert _statuses(db, gb) == ["open"]
        assert sent == []


class TestAdminEditCannotDelist:
    """The admin PUT used to accept `status` (ProducerUpdate.status) — a third
    way out of 'approved', found in the adversarial review of #3750. Since
    MEH-2502 it refuses `status` outright, so it cancels nothing."""

    def test_put_status_inactive_refused_and_touches_nothing(
        self, client, db, monkeypatch
    ):
        sent = _capture(monkeypatch)
        producer, _ = _business(db)
        gb = _group(db, producer)
        _join(db, gb, "buyer-put@example.com")
        admin = make_user(db, role="admin", email="admin8@example.com")

        resp = client.put(
            f"/admin/producers/{producer.id}",
            json={"status": "inactive"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 422
        assert _statuses(db, gb) == ["open"]
        assert sent == []

    def test_put_without_status_change_touches_nothing(self, client, db, monkeypatch):
        sent = _capture(monkeypatch)
        producer, _ = _business(db)
        gb = _group(db, producer)
        admin = make_user(db, role="admin", email="admin9@example.com")

        resp = client.put(
            f"/admin/producers/{producer.id}",
            json={"name": "מאפיית הגליל החדשה"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        assert _statuses(db, gb) == ["open"]
        assert sent == []


class TestRecipients:
    def test_a_buyer_who_owns_a_different_business_is_still_mailed(
        self, client, db, monkeypatch
    ):
        # Guards the filter against shrinking to "users with no business".
        sent = _capture(monkeypatch)
        producer, _ = _business(db)
        gb = _group(db, producer)
        _, other_owner = _business(db, email="buyer-is-a-business@example.com")
        db.add(GroupBuyCommit(group_buy_id=gb.id, user_id=other_owner.id, quantity=1))
        db.commit()
        admin = make_user(db, role="admin", email="admin10@example.com")

        assert _suspend(client, admin, producer).status_code == 200
        assert [to for to, _, _ in sent] == ["buyer-is-a-business@example.com"]


class TestDelistedEmailCopy:
    def test_wording_is_pinned_and_carries_no_contact_details(self):
        sent = {}

        def _cap(to, subject, body, html=None):
            sent.update(to=to, subject=subject, body=body)

        with mock.patch("app.services.group_buy_notifications.send_email", _cap):
            group_buy_notifications.notify_participant_cancelled_delisted(
                "buyer@example.com", "רכש קמח מלא", "מאפיית הגליל"
            )

        assert sent["to"] == "buyer@example.com"
        assert sent["subject"] == 'מהמקור — הקבוצה "רכש קמח מלא" בוטלה'
        assert sent["body"] == (
            "שלום,\n\n"
            'הקבוצה שהצטרפת אליה, "רכש קמח מלא", בוטלה כי בית העסק מאפיית הגליל '
            "כבר לא מופיע במהמקור.\n"
            "אם סיכמתם משהו ישירות מול בית העסק, אפשר להמשיך מולו כרגיל.\n\n"
            "בברכה,\nצוות מהמקור"
        )
        # Does not say the business cancelled it — the existing email does, and
        # here that would be false.
        assert "על ידי" not in sent["body"]
        assert "@" not in sent["body"].replace("buyer@example.com", "")
