"""MEH-3296 — stage 3 of on-site ordering: the Hebrew calendar, the clock that
stops on Shabbat and the festivals, the message outbox, and expiry.

Festival dates are pinned from outside this code (the published Israeli
calendar for 5785–5789), never computed by the module under test.
"""

import re
import uuid
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest

from app.models.product_orders import (
    PRODUCT_ORDER_NOTICE_CHANNELS,
    PRODUCT_ORDER_NOTICE_KINDS,
    PRODUCT_ORDER_NOTICE_STATUSES,
    ProductOrder,
    ProductOrderNotification,
)
from app.services import hebrew_calendar as cal
from app.services import product_order_outbox as outbox
from app.services import whatsapp
from app.services.product_order_clock import active_deadline, rest_end_if_inside
from app.services.product_order_create import status_token_for
from app.services.product_order_slots import is_rest_time
from app.services.product_order_sweeper import expire_due
from app.utils.clock import ISRAEL_TZ, utc_now
from tests.conftest import auth_header, make_user
from tests import test_meh3263_order_route as route
from tests.test_meh3263_order_route import PHONE_STORED, Shop, send, stored_order

# The stage-2b fixtures, shared rather than copied.
flag_on = route.flag_on
sent = route.sent

REVISION = (
    Path(__file__).resolve().parents[1]
    / "backend/alembic/versions/20261115_0900_a8d2c6f4e1b7_meh3296_order_notifications.py"
)

# --- the calendar ------------------------------------------------------------

# The Israeli festival days, typed from the published calendar (one day each,
# Rosh Hashana two): RH ×2, Yom Kippur, Sukkot, Shemini Atzeret, Pesach,
# 7th of Pesach, Shavuot.
PUBLISHED = {
    2025: ["2025-04-13", "2025-04-19", "2025-06-02", "2025-09-23", "2025-09-24",
           "2025-10-02", "2025-10-07", "2025-10-14"],
    2026: ["2026-04-02", "2026-04-08", "2026-05-22", "2026-09-12", "2026-09-13",
           "2026-09-21", "2026-09-26", "2026-10-03"],
    2027: ["2027-04-22", "2027-04-28", "2027-06-11", "2027-10-02", "2027-10-03",
           "2027-10-11", "2027-10-16", "2027-10-23"],
    2028: ["2028-04-11", "2028-04-17", "2028-05-31", "2028-09-21", "2028-09-22",
           "2028-09-30", "2028-10-05", "2028-10-12"],
}  # fmt: skip


@pytest.mark.parametrize("year", sorted(PUBLISHED))
def test_the_festival_days_match_the_published_calendar(year):
    assert sorted(cal.festival_days(year)) == [
        date.fromisoformat(d) for d in PUBLISHED[year]
    ]


def test_rosh_hashana_into_shabbat_is_one_closed_stretch():
    # 5789: Rosh Hashana Thursday–Friday 21–22 Sep 2028, then Shabbat.
    windows = cal.rest_windows(date(2028, 9, 20), date(2028, 9, 23))
    assert windows == [
        (datetime(2028, 9, 20, 14), datetime(2028, 9, 23, 21)),
    ]


def test_a_window_crosses_the_new_year():
    # Shabbat 1 Jan 2028: the window opens on Friday 31 Dec 2027.
    assert (datetime(2027, 12, 31, 14), datetime(2028, 1, 1, 21)) in cal.rest_windows(
        date(2027, 12, 31), date(2028, 1, 1)
    )


def _il(y, m, d, h, mi=0):
    return datetime(y, m, d, h, mi, tzinfo=ISRAEL_TZ)


def test_a_slot_on_yom_kippur_is_rest_time_and_the_day_after_is_not():
    assert is_rest_time(_il(2026, 9, 21, 10), _il(2026, 9, 21, 11))  # Monday
    assert is_rest_time(_il(2026, 9, 20, 15), _il(2026, 9, 20, 16))  # the eve
    assert not is_rest_time(_il(2026, 9, 22, 10), _il(2026, 9, 22, 11))
    assert not is_rest_time(_il(2026, 9, 20, 12), _il(2026, 9, 20, 13))


def test_the_answer_clock_stops_for_shabbat():
    # Thursday 19 Nov 2026 15:00 Israel (13:00 UTC): 23 hours to the window,
    # then the last hour after Saturday 21:00.
    start = datetime(2026, 11, 19, 13)
    assert active_deadline(start, 24) == datetime(2026, 11, 21, 20)
    assert active_deadline(start, 23) == datetime(2026, 11, 20, 12)


def test_the_answer_clock_counts_real_hours_across_the_clock_change():
    # Sunday 25 Oct 2026 01:00 Israel (DST, 22:00 UTC Saturday): the clock goes
    # back at 02:00. 24 real hours, nothing to skip.
    start = datetime(2026, 10, 24, 22)
    assert active_deadline(start, 24) == datetime(2026, 10, 25, 22)


def test_a_start_inside_a_window_counts_from_its_end():
    inside = datetime(2026, 9, 12, 9)  # Rosh Hashana, Saturday
    end = rest_end_if_inside(inside)
    assert end == datetime(2026, 9, 13, 18)  # Sunday 21:00 Israel (IDT)
    assert active_deadline(inside, 24) == end + timedelta(hours=24)
    assert rest_end_if_inside(datetime(2026, 9, 14, 9)) is None


# --- the table ---------------------------------------------------------------


def test_the_revision_literals_match_the_model():
    source = REVISION.read_text(encoding="utf-8")

    def literal(name):
        block = re.search(rf"^{name} = \((.*?)\)$", source, re.S | re.M).group(1)
        return tuple(re.findall(r'"([a-z_]+)"', block))

    assert literal("KINDS") == PRODUCT_ORDER_NOTICE_KINDS
    assert literal("CHANNELS") == PRODUCT_ORDER_NOTICE_CHANNELS
    assert literal("STATUSES") == PRODUCT_ORDER_NOTICE_STATUSES


# --- what each move owes -----------------------------------------------------


def owed(db, order_id=None):
    db.expire_all()
    q = db.query(ProductOrderNotification)
    if order_id is not None:
        q = q.filter_by(order_id=order_id)
    return sorted((n.kind, n.channel) for n in q)


def test_a_new_order_owes_the_business_a_message_and_a_reminder(
    client, db, flag_on, sent
):
    shop = Shop(db)
    assert send(client, shop, sent).status_code == 201
    order = db.query(ProductOrder).one()
    assert owed(db) == [
        ("business_reminder", "email"),
        ("business_reminder", "whatsapp"),
        ("new_order", "email"),
        ("new_order", "whatsapp"),
    ]
    reminder = (
        db.query(ProductOrderNotification).filter_by(kind="business_reminder").first()
    )
    assert reminder.send_after == active_deadline(order.created_at, 4) or (
        abs(reminder.send_after - active_deadline(order.created_at, 4))
        < timedelta(seconds=5)
    )


def test_confirming_owes_the_buyer_a_message_and_a_day_before_reminder(
    client, db, flag_on, sent
):
    shop = Shop(db, lead_time_hours=48)
    created = send(client, shop, sent).json()
    res = client.post(
        f"/producers/me/product-orders/{created['id']}/confirm",
        json={},
        headers=shop.headers,
    )
    assert res.status_code == 200, res.text
    assert ("confirmed", "whatsapp") in owed(db)
    tomorrow = db.query(ProductOrderNotification).filter_by(kind="day_before").one()
    order = db.query(ProductOrder).one()
    assert tomorrow.send_after == order.slot_start - outbox.DAY_BEFORE


def test_an_order_confirmed_close_to_its_slot_gets_no_separate_reminder(
    client, db, flag_on, sent
):
    shop = Shop(db)  # lead time 0: the slot is today
    created = send(client, shop, sent).json()
    client.post(
        f"/producers/me/product-orders/{created['id']}/confirm",
        json={},
        headers=shop.headers,
    )
    assert ("confirmed", "whatsapp") in owed(db)
    assert ("day_before", "whatsapp") not in owed(db)


@pytest.mark.parametrize(
    ("action", "body", "kind"),
    [
        ("decline", {"note": "אזל המלאי"}, ("closed", "whatsapp")),
        (
            "propose-change",
            {"total_agorot": 5000, "note": "חסרה חלה"},
            ("change_proposed", "whatsapp"),
        ),
    ],
)
def test_a_business_answer_owes_the_buyer_a_message(
    client, db, flag_on, sent, action, body, kind
):
    shop = Shop(db)
    created = send(client, shop, sent).json()
    res = client.post(
        f"/producers/me/product-orders/{created['id']}/{action}",
        json=body,
        headers=shop.headers,
    )
    assert res.status_code == 200, res.text
    assert kind in owed(db)


def test_a_buyer_cancelling_owes_the_business_an_email(client, db, flag_on, sent):
    shop = Shop(db)
    created = send(client, shop, sent).json()
    client.post(
        "/product-orders/status/cancel", json={"token": created["status_token"]}
    )
    assert ("buyer_cancelled", "email") in owed(db)
    assert ("closed", "whatsapp") not in owed(db)


def test_a_deleted_account_owes_the_buyer_nothing_and_tells_the_business(
    client, db, flag_on
):
    shop = Shop(db)
    buyer = make_user(db, email="buyer@example.com")
    order = stored_order(db, shop, "pending", user_id=buyer.id)
    assert (
        client.post(
            "/auth/me/delete",
            json={"password": "Zx7Yp9Mq2Lr4"},
            headers=auth_header(buyer),
        ).status_code
        == 200
    )
    assert owed(db, order.id) == [("buyer_cancelled", "email")]


# --- sending -----------------------------------------------------------------


class Wire:
    """Everything the outbox hands to the two senders, captured."""

    def __init__(
        self, monkeypatch, wa_outcome="accepted", http_status=200, mail="sent"
    ):
        self.wa, self.mail = [], []

        def fake_wa(to, template, test_cause=False):
            self.wa.append((to, template, test_cause))
            if test_cause:
                return whatsapp.WhatsAppSendResult(
                    outcome=whatsapp.OUTCOME_SKIPPED_TEST, ok=False
                )
            return whatsapp.WhatsAppSendResult(
                outcome=wa_outcome, ok=wa_outcome == "accepted", http_status=http_status
            )

        def fake_mail(to, subject, body, html=None, reply_to=None, test_cause=False):
            self.mail.append((to, subject, body, test_cause))
            return "skipped_test" if test_cause else mail

        monkeypatch.setattr(outbox.whatsapp, "send_template_result", fake_wa)
        monkeypatch.setattr(outbox.email_service, "send_email_result", fake_mail)


def due_order(db, shop, status="pending", **over):
    order = stored_order(db, shop, status, idempotency_key=str(uuid.uuid4()), **over)
    return order


def owe_now(db, order, kind, channel):
    row = ProductOrderNotification(
        order_id=order.id,
        kind=kind,
        channel=channel,
        send_after=utc_now() - timedelta(minutes=1),
    )
    db.add(row)
    db.commit()
    return row


def outcome_of(db, row):
    db.expire_all()
    fresh = db.get(ProductOrderNotification, row.id)
    return fresh.outcome, fresh.last_error, fresh.attempts


def test_a_due_message_is_sent_once_with_the_buyer_link_in_the_fragment(
    db, monkeypatch
):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    order = due_order(db, shop, "confirmed")
    row = owe_now(db, order, "confirmed", "whatsapp")
    assert outbox.dispatch_due(db) == 1
    assert outcome_of(db, row) == ("sent", None, 0)
    to, template, test = wire.wa[0]
    assert to == f"+{PHONE_STORED}" and test is False
    token = status_token_for(str(order.idempotency_key))
    assert template.link.endswith(f"/he/order/{order.id}#t={token}")
    assert outbox.dispatch_due(db) == 0  # nothing left: sent once
    assert len(wire.wa) == 1


def test_a_test_business_is_skipped_not_retried(db, monkeypatch):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    shop.producer.is_test = True
    db.commit()
    row = owe_now(db, due_order(db, shop), "new_order", "email")
    outbox.dispatch_due(db)
    assert wire.mail[0][3] is True
    assert outcome_of(db, row) == ("skipped", "skipped_test", 0)


def test_a_provider_hiccup_is_retried_later_and_a_refusal_is_final(db, monkeypatch):
    shop = Shop(db)
    Wire(monkeypatch, wa_outcome="failed", http_status=503)
    hiccup = owe_now(db, due_order(db, shop, "confirmed"), "confirmed", "whatsapp")
    outbox.dispatch_due(db)
    db.expire_all()
    again = db.get(ProductOrderNotification, hiccup.id)
    assert (again.outcome, again.attempts) == ("pending", 1)
    assert again.send_after > utc_now()

    Wire(monkeypatch, wa_outcome="failed", http_status=400)  # e.g. unknown template
    refused = owe_now(db, due_order(db, shop, "confirmed"), "confirmed", "whatsapp")
    outbox.dispatch_due(db)
    assert outcome_of(db, refused) == ("failed", "provider", 1)


def test_the_fifth_failure_is_the_last(db, monkeypatch):
    Wire(monkeypatch, wa_outcome="failed", http_status=503)
    shop = Shop(db)
    row = owe_now(db, due_order(db, shop, "confirmed"), "confirmed", "whatsapp")

    def tick():
        db.query(ProductOrderNotification).update(
            {"send_after": utc_now() - timedelta(seconds=1)}
        )
        db.commit()
        outbox.dispatch_due(db)

    for _ in range(4):  # the number is the spec: five tries, not the constant
        tick()
    assert outcome_of(db, row) == ("pending", "provider", 4)
    tick()
    assert outcome_of(db, row) == ("failed", "provider", 5)


def test_a_reminder_that_no_longer_fits_is_dropped(db, monkeypatch):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    row = owe_now(db, due_order(db, shop, "confirmed"), "business_reminder", "whatsapp")
    outbox.dispatch_due(db)
    assert outcome_of(db, row) == ("skipped", "not_relevant", 0)
    assert wire.wa == []


def test_a_message_hours_late_is_dropped_not_sent(db, monkeypatch):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    row = owe_now(db, due_order(db, shop, "confirmed"), "confirmed", "whatsapp")
    row.send_after = utc_now() - outbox.STALE_AFTER - timedelta(minutes=1)
    db.commit()
    outbox.dispatch_due(db)
    assert outcome_of(db, row) == ("skipped", "stale", 0)
    assert wire.wa == []


def test_an_observant_business_sends_nothing_during_shabbat(db, monkeypatch):
    wire = Wire(monkeypatch)
    shop = Shop(db, shabbat_observant=True)
    row = owe_now(db, due_order(db, shop, "confirmed"), "confirmed", "whatsapp")
    shabbat = datetime(2026, 11, 21, 10)  # Saturday noon, Israel
    row.send_after = shabbat - timedelta(minutes=1)
    db.commit()
    outbox.dispatch_due(db, now=shabbat)
    db.expire_all()
    held = db.get(ProductOrderNotification, row.id)
    assert (held.outcome, held.attempts) == ("pending", 0)
    assert held.send_after == datetime(2026, 11, 21, 19)  # Saturday 21:00 Israel
    assert wire.wa == []


def test_a_buyer_without_a_phone_or_a_link_gets_nothing(db, monkeypatch):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    order = stored_order(db, shop, "confirmed", customer_phone="")
    row = owe_now(db, order, "confirmed", "whatsapp")
    outbox.dispatch_due(db)
    assert outcome_of(db, row) == ("skipped", "no_address", 0)
    assert wire.wa == []


def test_the_business_gets_the_approved_new_order_text_by_email(db, monkeypatch):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    owe_now(db, due_order(db, shop), "new_order", "email")
    outbox.dispatch_due(db)
    to, subject, body, _ = wire.mail[0]
    assert to == shop.owner.email and subject == outbox.NEW_ORDER_SUBJECT
    assert body.startswith("הזמנה חדשה ממהמקור: דנה לוי, ")
    assert "/he/producer/dashboard/orders" in body


# --- expiry --------------------------------------------------------------------


def test_an_unanswered_request_expires_and_the_buyer_is_told(db):
    shop = Shop(db)
    late = due_order(db, shop, "pending", expires_at=utc_now() - timedelta(minutes=1))
    fresh = due_order(db, shop, "pending", expires_at=utc_now() + timedelta(hours=1))
    agreed = due_order(
        db, shop, "confirmed", expires_at=utc_now() - timedelta(minutes=1)
    )
    assert expire_due(db) == 1
    db.expire_all()
    assert [db.get(ProductOrder, o.id).status for o in (late, fresh, agreed)] == [
        "expired",
        "pending",
        "confirmed",
    ]
    assert owed(db, late.id) == [("closed", "whatsapp")]


def test_an_observant_business_takes_no_order_during_a_festival(
    client, db, flag_on, sent, monkeypatch
):
    from app.services import product_order_create as create_module

    shop = Shop(db, shabbat_observant=True)
    monkeypatch.setattr(create_module, "rest_end_if_inside", lambda now: now)
    res = send(client, shop, sent)
    assert res.status_code == 409
    assert create_module.RESTING_DETAIL in res.text
    assert db.query(ProductOrder).count() == 0


# --- review fixes ----------------------------------------------------------------


def test_accepting_a_new_slot_times_the_reminder_off_the_new_slot(db):
    from app.services.product_order_actions import buyer_accept_change
    from app.services.product_order_state import Actor

    shop = Shop(db)
    now = utc_now()
    new_start = now + timedelta(days=3)
    order = stored_order(
        db,
        shop,
        "change_proposed",
        slot_start=now + timedelta(hours=5),
        slot_end=now + timedelta(hours=6),
        proposed_slot_start=new_start,
        proposed_slot_end=new_start + timedelta(hours=1),
    )
    buyer_accept_change(db, order, Actor("customer"))
    db.commit()
    tomorrow = (
        db.query(ProductOrderNotification)
        .filter_by(order_id=order.id, kind="day_before")
        .one()
    )
    assert tomorrow.send_after == new_start - outbox.DAY_BEFORE


def test_the_business_whatsapp_goes_to_the_international_number(db, monkeypatch):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    shop.producer.phone = "0501234567"
    db.commit()
    owe_now(db, due_order(db, shop), "new_order", "whatsapp")
    outbox.dispatch_due(db)
    assert wire.wa[0][0] == "+972501234567"


def test_a_business_with_a_landline_only_gets_no_whatsapp(db, monkeypatch):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    shop.producer.phone = "046123456"
    db.commit()
    row = owe_now(db, due_order(db, shop), "new_order", "whatsapp")
    outbox.dispatch_due(db)
    assert outcome_of(db, row) == ("skipped", "no_address", 0)
    assert wire.wa == []


def test_an_auto_confirmed_order_is_not_announced_as_waiting(db, monkeypatch):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    order = due_order(db, shop, "confirmed")
    wa = owe_now(db, order, "new_order", "whatsapp")
    owe_now(db, order, "new_order", "email")
    outbox.dispatch_due(db)
    assert outcome_of(db, wa) == ("skipped", "auto_confirmed", 0)
    assert wire.wa == []
    _, subject, body, _ = wire.mail[0]
    assert subject == outbox.NEW_ORDER_AUTO_SUBJECT
    assert "לאישור" not in body and "פרטים: " in body


def test_a_business_typing_the_deletion_note_still_tells_the_buyer(db):
    from app.services.product_order_state import Actor, apply_transition

    shop = Shop(db)
    order = due_order(db, shop, "confirmed")
    apply_transition(
        db, order, "cancelled", Actor("business"), outbox.ACCOUNT_DELETED_NOTE
    )
    db.commit()
    assert owed(db, order.id) == [("closed", "whatsapp")]


def test_the_buyer_cancelled_email_reads_about_the_order_not_a_person(db, monkeypatch):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    owe_now(db, due_order(db, shop, "cancelled"), "buyer_cancelled", "email")
    outbox.dispatch_due(db)
    _, subject, body, _ = wire.mail[0]
    assert subject == "הזמנה בוטלה"
    assert body.startswith("ההזמנה של דנה לוי ל")
    assert " בוטלה. פרטים: " in body


def test_inside_a_three_day_stretch_the_end_is_the_stretch_end():
    # Rosh Hashana 2028 runs Thursday-Friday into Shabbat.
    def utc(at):
        return at.astimezone(UTC).replace(tzinfo=None)

    assert rest_end_if_inside(utc(_il(2028, 9, 20, 15))) == utc(_il(2028, 9, 23, 21))


def test_a_row_that_crashes_is_marked_and_the_batch_goes_on(db, monkeypatch):
    wire = Wire(monkeypatch)
    shop = Shop(db)
    bad = owe_now(db, due_order(db, shop, "confirmed"), "confirmed", "whatsapp")
    good = owe_now(db, due_order(db, shop, "confirmed"), "confirmed", "whatsapp")
    real = outbox._handle

    def handle(db_, row, now):
        if row.id == bad.id:
            raise RuntimeError("boom")
        real(db_, row, now)

    monkeypatch.setattr(outbox, "_handle", handle)
    assert outbox.dispatch_due(db) == 2
    assert outcome_of(db, bad) == ("failed", "error", 0)
    assert outcome_of(db, good)[0] == "sent"
    assert len(wire.wa) == 1
