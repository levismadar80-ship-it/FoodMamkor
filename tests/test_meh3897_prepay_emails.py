"""MEH-3897 — the prepay follow-up to MEH-3895.

1. The buyer's code email (and its reminder) carries the business's link
   instead of «אומרים אותו בקופה ומשלמים X ₪».
2. The business's «נשמר סל» email says the money was asked for ahead.
3. The business is told what to return when a group-buy member leaves, when
   a group buy that had been funded is cancelled (by the business, the admin
   or the daily close), and when the business cancels a bag itself.
"""

# ruff: noqa: F811 — fixtures reused from test_rescue.py are injected by name.

from datetime import timedelta

import pytest
from sqlalchemy import text

import app.services.prepay_refunds as refunds
from app.models.models import GroupBuyCommit, Producer
from app.services.group_buy_expiry import expire_unfunded_group_buys
from app.services.prepay_copy import prepay_from_info
from app.services.rescue_business_emails import (
    BusinessReservation,
    send_business_reservation_email,
)
from app.services.rescue_emails import ReservationEmail, render_reservation_email
from app.utils.clock import utc_now
from tests.conftest import auth_header, make_user
from tests.test_group_buys_api import _make_group_buy, _producer_user
from tests.test_rescue import _seed_offer, rescue_on, shop  # noqa: F401

BIT = "https://www.bitpay.co.il/app/me/ABCD-1234"
ADVANCE = {"methods": ["bit"], "timing": "advance", "note": None, "link": BIT}
DEPOSIT = {**ADVANCE, "timing": "deposit"}


def _card(prepay=None):
    return ReservationEmail(
        producer_name="מאפיית ההצלה",
        producer_id="p-1",
        pickup_code="4821",
        total_agorot=3000,
        pickup_from="18:00",
        pickup_until="19:00",
        address="הנביאים 10, חיפה",
        cancel_until="17:00",
        prepay=prepay,
    )


# --- 1. the buyer's code email ------------------------------------------------


def test_the_buyer_email_carries_the_link_when_paying_ahead():
    _s, body, html = render_reservation_email(_card(prepay_from_info(ADVANCE)))
    assert "בית העסק מבקש לשלם מראש 30 ₪. לתשלום: " + BIT in body
    assert "דרך bitpay.co.il" in body
    assert "בהערה לתשלום כתבו את הקוד 4821" in body
    assert "ומשלמים" not in body
    assert f'href="{BIT}"' in html and "לתשלום</a>" in html
    assert "ומשלמים" not in html


def test_a_deposit_asks_for_a_deposit_and_the_rest_at_the_counter():
    _s, body, html = render_reservation_email(_card(prepay_from_info(DEPOSIT)))
    assert "הסל עולה 30 ₪. בית העסק מבקש מקדמה. לתשלום: " in body
    assert "בקופה אומרים את הקוד ומשלמים את היתרה." in body
    assert "משלמים את היתרה" in html


def test_paying_at_the_counter_is_unchanged():
    _s, body, html = render_reservation_email(_card(None))
    assert "הקוד שלכם: 4821. אומרים אותו בקופה ומשלמים 30 ₪." in body
    assert "לתשלום" not in body and "לתשלום" not in html
    assert prepay_from_info({**ADVANCE, "timing": "on_pickup"}) is None


def _pay(db, producer_id, info):
    p = db.get(Producer, producer_id)
    p.payment_info = info
    db.commit()


@pytest.fixture
def outbox(monkeypatch):
    """Every send_email of the bag and refund paths: (to, subject, body)."""
    sent = []

    def capture(to, subject, body, **_kw):
        sent.append((to, subject, body))

    for mod in (
        "app.services.rescue_emails",
        "app.services.rescue_business_emails",
        "app.services.prepay_refunds",
    ):
        monkeypatch.setattr(f"{mod}.send_email", capture)
    return sent


def test_a_real_reservation_sends_both_emails_with_the_prepay_lines(
    client, db, shop, rescue_on, outbox
):
    _pay(db, shop["producer"].id, ADVANCE)
    offer = _seed_offer(db, shop["location"])
    buyer = make_user(db, email="buyer3897@example.com")
    r = client.post(
        "/rescue/orders",
        json={"offer_id": str(offer.id), "qty": 2},
        headers=auth_header(buyer),
    )
    assert r.status_code == 201, r.text
    code = r.json()["pickup_code"]
    (mine,) = [b for to, _s, b in outbox if to == "buyer3897@example.com"]
    assert f"בית העסק מבקש לשלם מראש 30 ₪. לתשלום: {BIT}" in mine
    assert f"כתבו את הקוד {code}" in mine
    (theirs,) = [b for to, _s, b in outbox if to == "owner@example.com"]
    assert f"קוד האיסוף: {code}. ביקשנו לשלם מראש 30 ₪ בקישור התשלום שלכם" in theirs
    assert "בקופה אומרים את הקוד ומשלמים" not in theirs


# --- 2. the business's reservation email ---------------------------------------


def _business(prepay):
    sent = []
    import app.services.rescue_business_emails as mod

    orig = mod.send_email
    mod.send_email = lambda to, s, b, **kw: sent.append(b)
    try:
        send_business_reservation_email(
            "o@example.com",
            BusinessReservation("ב", 1, "1234", 1500, "18:00", "19:00", prepay=prepay),
        )
    finally:
        mod.send_email = orig
    return sent[0]


def test_the_business_email_drops_the_counter_line_when_paid_ahead():
    assert "בקופה אומרים את הקוד ומשלמים 15 ₪." in _business(None)
    deposit = _business(prepay_from_info(DEPOSIT))
    assert "ביקשנו לשלם מקדמה בקישור התשלום שלכם" in deposit
    assert "את היתרה גובים בקופה." in deposit


# --- 3a. the business cancels a bag ----------------------------------------------


def test_a_business_cancel_of_a_prepaid_bag_lists_what_to_return(
    client, db, shop, rescue_on, outbox
):
    _pay(db, shop["producer"].id, ADVANCE)
    offer = _seed_offer(db, shop["location"])
    codes = []
    for i, qty in enumerate((1, 2)):
        buyer = make_user(db, email=f"b{i}-3897@example.com")
        r = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": qty},
            headers=auth_header(buyer),
        )
        assert r.status_code == 201, r.text
        codes.append(r.json()["pickup_code"])
    outbox.clear()
    r = client.post(
        f"/rescue/offers/{offer.id}/cancel", headers=auth_header(shop["owner"])
    )
    assert r.status_code == 200, r.text
    notes = [(s, b) for to, s, b in outbox if to == "owner@example.com"]
    assert [s for s, _b in notes] == ["בוטל סל הפתעה במאפיית ההצלה: מה להחזיר"]
    body = notes[0][1]
    assert "ביטלתם את סל ההפתעה, ואיתו בוטלו השריונים האלה, שלא סימנתם «שולם»." in body
    by_code = dict(zip(codes, ("15", "30")))
    for code in sorted(codes):
        assert f"• קוד {code}: {by_code[code]} ₪" in body


def test_a_business_cancel_without_a_link_sends_no_note(
    client, db, shop, rescue_on, outbox
):
    offer = _seed_offer(db, shop["location"])
    buyer = make_user(db, email="b-nolink@example.com")
    client.post(
        "/rescue/orders",
        json={"offer_id": str(offer.id), "qty": 1},
        headers=auth_header(buyer),
    )
    client.post(f"/rescue/offers/{offer.id}/cancel", headers=auth_header(shop["owner"]))
    assert not [s for _to, s, _b in outbox if "מה להחזיר" in s]


# --- 3b. group buys ----------------------------------------------------------------


@pytest.fixture
def notes(monkeypatch):
    sent = []
    monkeypatch.setattr(
        refunds,
        "send_email",
        lambda to, s, b, **kw: sent.append((to, s, b)),
    )
    return sent


def _group(db, *, funded=True, info=ADVANCE, members=2, min_participants=2):
    producer, owner = _producer_user(db, email="gbowner3897@example.com")
    producer.payment_info = info
    gb = _make_group_buy(
        db,
        producer,
        status="funded" if funded else "open",
        min_participants=min_participants,
    )
    gb.funded_notified_at = utc_now() if funded else None
    users = []
    for i in range(members):
        u = make_user(db, email=f"m{i}-3897@example.com")
        db.add(
            GroupBuyCommit(
                group_buy_id=gb.id,
                user_id=u.id,
                quantity=i + 1,
                pickup_code=f"10{i:02d}",
            )
        )
        users.append(u)
    db.commit()
    return gb, owner, users


def test_a_leave_from_a_funded_group_tells_the_business_what_to_return(
    client, db, notes
):
    gb, _owner, (_a, b) = _group(db, members=2, min_participants=1)
    r = client.delete(f"/group-buys/{gb.id}/commit", headers=auth_header(b))
    assert r.status_code == 200, r.text
    ((to, subject, body),) = notes
    assert to == "gbowner3897@example.com"
    assert subject == 'בוטלה הצטרפות לקבוצה "רכש קמח מלא"'
    assert "(קוד האיסוף 1001)" in body
    assert "• קוד 1001: 180 ₪" in body  # 2 × 90 ₪


def test_a_leave_from_a_group_never_funded_sends_nothing(client, db, notes):
    gb, _owner, (a, _b) = _group(db, funded=False)
    assert (
        client.delete(f"/group-buys/{gb.id}/commit", headers=auth_header(a)).status_code
        == 200
    )
    assert notes == []


def test_the_owner_cancel_of_a_funded_group_lists_every_member(client, db, notes):
    gb, owner, _users = _group(db, info=DEPOSIT)
    r = client.patch(
        f"/group-buys/{gb.id}/status",
        json={"status": "cancelled", "expected_status": "funded"},
        headers=auth_header(owner),
    )
    assert r.status_code == 200, r.text
    ((_to, subject, body),) = notes
    assert subject == 'הקבוצה "רכש קמח מלא" בוטלה: מה להחזיר'
    assert 'ביטלתם את הקבוצה "רכש קמח מלא".' in body
    assert "אם המקדמה כבר התקבלה" in body
    assert "• קוד 1000\n• קוד 1001" in body
    assert "₪" not in body  # a deposit's size is the business's


def test_the_daily_close_of_a_group_that_fell_back_tells_the_business(db, notes):
    gb, _owner, _users = _group(db)
    gb.status = "open"  # funded once, then someone left
    gb.deadline = utc_now() - timedelta(hours=1)
    db.commit()
    assert expire_unfunded_group_buys(db) == 1
    ((_to, _subject, body),) = notes
    assert 'הקבוצה "רכש קמח מלא" נסגרה בלי להגיע למינימום.' in body
    assert "• קוד 1000: 90 ₪\n• קוד 1001: 180 ₪" in body


def test_the_daily_close_of_a_group_never_funded_sends_nothing(db, notes):
    gb, _owner, _users = _group(db, funded=False)
    gb.deadline = utc_now() - timedelta(hours=1)
    db.commit()
    assert expire_unfunded_group_buys(db) == 1
    assert notes == []


def test_a_broken_note_never_fails_the_leave(client, db, notes, monkeypatch):
    gb, _owner, (_a, b) = _group(db, members=2, min_participants=1)
    # Fails in SQL, not in Python: without the savepoint the caller's
    # transaction is left aborted and its own commit 500s.
    monkeypatch.setattr(
        refunds, "owner_emails", lambda d, *_a: d.execute(text("select 1/0"))
    )
    assert (
        client.delete(f"/group-buys/{gb.id}/commit", headers=auth_header(b)).status_code
        == 200
    )
    assert notes == []
    db.expire_all()
    assert (
        db.query(GroupBuyCommit).filter_by(group_buy_id=gb.id, user_id=b.id).count()
        == 0
    )


# --- review round 1 ------------------------------------------------------------


def _reserve(client, db, offer, email, qty=1):
    buyer = make_user(db, email=email)
    r = client.post(
        "/rescue/orders",
        json={"offer_id": str(offer.id), "qty": qty},
        headers=auth_header(buyer),
    )
    assert r.status_code == 201, r.text
    return buyer, r.json()


def test_the_reminder_card_carries_the_link(client, db, shop, rescue_on, outbox):
    from app.models.models import RescueOrder
    from app.services.rescue_reminders import _reminder_card

    _pay(db, shop["producer"].id, ADVANCE)
    offer = _seed_offer(db, shop["location"])
    _buyer, out = _reserve(client, db, offer, "rem3897@example.com")
    order = db.get(RescueOrder, out["id"])
    _s, body, _h = render_reservation_email(
        _reminder_card(order, utc_now()), subject="תזכורת"
    )
    assert f"לתשלום: {BIT}" in body
    assert "ומשלמים 15" not in body


def test_a_link_with_an_ampersand_is_escaped_in_the_html():
    info = {**ADVANCE, "link": "https://pay.example.co.il/x?a=1&b=2"}
    _s, _b, html = render_reservation_email(_card(prepay_from_info(info)))
    assert 'href="https://pay.example.co.il/x?a=1&amp;b=2"' in html


def test_a_buyer_who_cancelled_first_is_not_listed_again(
    client, db, shop, rescue_on, outbox
):
    _pay(db, shop["producer"].id, DEPOSIT)
    offer = _seed_offer(db, shop["location"])
    early, first = _reserve(client, db, offer, "early3897@example.com")
    assert (
        client.post(
            f"/rescue/orders/{first['id']}/cancel", headers=auth_header(early)
        ).status_code
        == 200
    )
    _late, second = _reserve(client, db, offer, "late3897@example.com")
    outbox.clear()
    client.post(f"/rescue/offers/{offer.id}/cancel", headers=auth_header(shop["owner"]))
    ((_s, body),) = [(s, b) for to, s, b in outbox if "מה להחזיר" in s]
    assert f"• קוד {second['pickup_code']}" in body
    assert first["pickup_code"] not in body  # her own cancel was told about already
    assert "₪" not in body  # a deposit


def test_no_cancelled_reservation_means_no_note(db, shop):
    _pay(db, shop["producer"].id, ADVANCE)
    offer = _seed_offer(db, shop["location"])
    assert refunds.bag_business_cancel_mails(db, offer, set()) == []


def test_a_deposit_leave_names_no_amount(client, db, notes):
    gb, _owner, (_a, b) = _group(db, info=DEPOSIT, members=2, min_participants=1)
    client.delete(f"/group-buys/{gb.id}/commit", headers=auth_header(b))
    ((_to, _s, body),) = notes
    assert "• קוד 1001" in body and "₪" not in body


def test_a_test_business_marks_its_notes_as_test(db):
    gb, _owner, _users = _group(db)
    gb.producer.is_test = True
    db.commit()
    mails = refunds.group_buy_cancel_mails(db, gb, "owner")
    assert mails and all(test_cause for *_rest, test_cause in mails)


def test_a_reservation_marked_paid_is_not_listed_twice(
    client, db, shop, rescue_on, outbox
):
    # MEH-3897 «סמן כשולם» (#5385) sends its own refund email for a marked
    # reservation; the list holds only the unmarked ones.
    _pay(db, shop["producer"].id, ADVANCE)
    offer = _seed_offer(db, shop["location"])
    _a, marked = _reserve(client, db, offer, "marked3897@example.com")
    _b, plain = _reserve(client, db, offer, "plain3897@example.com")
    r = client.post(
        f"/rescue/orders/{marked['id']}/paid",
        json={"paid": True},
        headers=auth_header(shop["owner"]),
    )
    assert r.status_code == 200, r.text
    outbox.clear()
    client.post(f"/rescue/offers/{offer.id}/cancel", headers=auth_header(shop["owner"]))
    ((_s, body),) = [(s, b) for to, s, b in outbox if "מה להחזיר" in s]
    assert f"• קוד {plain['pickup_code']}: 15 ₪" in body
    assert marked["pickup_code"] not in body
    certain = [b for _to, s, b in outbox if s.startswith("בוטל שריון")]
    assert len(certain) == 1 and marked["pickup_code"] in certain[0]


# --- follow-up (Sapir 27/11: «כל מה שחסר») -----------------------------------------


def test_suspending_a_business_tells_it_what_to_return_on_a_funded_group(
    client, db, notes
):
    gb, _owner, _users = _group(db)
    admin = make_user(db, role="admin", email="admin3897@example.com")
    r = client.post(
        f"/admin/producers/{gb.producer_id}/toggle-status", headers=auth_header(admin)
    )
    assert r.status_code == 200, r.text
    db.refresh(gb)
    assert gb.status == "cancelled"
    ((to, _s, body),) = notes
    assert to == "gbowner3897@example.com"
    assert 'בית העסק כבר לא מופיע במהמקור, ולכן הקבוצה "רכש קמח מלא" בוטלה.' in body
    assert "• קוד 1000: 90 ₪\n• קוד 1001: 180 ₪" in body


def test_a_reminder_for_a_reservation_marked_paid_stops_asking(
    client, db, shop, rescue_on, outbox
):
    from app.models.models import RescueOrder
    from app.services.rescue_reminders import _reminder_card

    _pay(db, shop["producer"].id, ADVANCE)
    offer = _seed_offer(db, shop["location"])
    _buyer, out = _reserve(client, db, offer, "paidrem3897@example.com")
    r = client.post(
        f"/rescue/orders/{out['id']}/paid",
        json={"paid": True},
        headers=auth_header(shop["owner"]),
    )
    assert r.status_code == 200, r.text
    order = db.get(RescueOrder, out["id"])
    db.refresh(order)
    _s, body, html = render_reservation_email(
        _reminder_card(order, utc_now()), subject="תזכורת"
    )
    assert "בית העסק אישר שהתשלום התקבל, ובקופה רק אומרים את הקוד." in body
    assert "לתשלום" not in body and "לתשלום" not in html
    assert "ומשלמים" not in body


# --- 4. the terms are kept on the reservation (prepay_timing) ------------------


def _order(db, oid):
    from app.models.models import RescueOrder

    db.expire_all()
    return db.get(RescueOrder, oid)


def test_a_reservation_keeps_the_terms_it_was_made_under(
    client, db, shop, rescue_on, outbox
):
    offer = _seed_offer(db, shop["location"])
    _u, counter = _reserve(client, db, offer, "t-counter@example.com")
    _pay(db, shop["producer"].id, DEPOSIT)
    _u, deposit = _reserve(client, db, offer, "t-deposit@example.com")
    assert _order(db, counter["id"]).prepay_timing == "counter"
    assert _order(db, deposit["id"]).prepay_timing == "deposit"


def test_a_link_removed_after_reserving_still_gets_the_refund_note(
    client, db, shop, rescue_on, outbox
):
    _pay(db, shop["producer"].id, ADVANCE)
    offer = _seed_offer(db, shop["location"])
    buyer, order = _reserve(client, db, offer, "t-removed@example.com")
    _pay(db, shop["producer"].id, None)  # the business took its link down
    outbox.clear()
    r = client.post(f"/rescue/orders/{order['id']}/cancel", headers=auth_header(buyer))
    assert r.status_code == 200, r.text
    ((_s, body),) = [(s, b) for to, s, b in outbox if to == "owner@example.com"]
    assert "אם התשלום מראש כבר התקבל, צריך להחזיר 15 ₪" in body


def test_a_link_added_after_reserving_still_counts(client, db, shop, rescue_on, outbox):
    # Her page and reminders show the live link, so she may have paid
    # through it although she reserved at the counter.
    offer = _seed_offer(db, shop["location"])
    _reserve(client, db, offer, "t-added@example.com")
    _pay(db, shop["producer"].id, ADVANCE)
    outbox.clear()
    client.post(f"/rescue/offers/{offer.id}/cancel", headers=auth_header(shop["owner"]))
    assert [s for _to, s, _b in outbox if "מה להחזיר" in s]


def test_a_counter_reservation_with_no_link_today_gets_no_note(
    client, db, shop, rescue_on, outbox
):
    _pay(db, shop["producer"].id, ADVANCE)
    offer = _seed_offer(db, shop["location"])
    _u, order = _reserve(client, db, offer, "t-stored-counter@example.com")
    _order(db, order["id"]).prepay_timing = "counter"
    db.commit()
    _pay(db, shop["producer"].id, None)
    outbox.clear()
    client.post(f"/rescue/offers/{offer.id}/cancel", headers=auth_header(shop["owner"]))
    assert not [s for _to, s, _b in outbox if "מה להחזיר" in s]


def test_a_group_note_reads_each_members_own_terms(client, db, notes):
    gb, owner, _users = _group(db, info=None)  # no link today
    c0, c1 = sorted(gb.commits, key=lambda c: c.pickup_code)
    c0.prepay_timing, c1.prepay_timing = "deposit", "advance"
    db.commit()
    r = client.patch(
        f"/group-buys/{gb.id}/status",
        json={"status": "cancelled", "expected_status": "funded"},
        headers=auth_header(owner),
    )
    assert r.status_code == 200, r.text
    ((_to, _subject, body),) = notes
    assert "• קוד 1000: מקדמה\n• קוד 1001: 180 ₪" in body
    assert "אם התשלום מראש כבר התקבל" in body


def test_a_member_who_joined_at_the_counter_is_left_out_once_the_link_is_gone(
    client, db, notes
):
    gb, _owner, (_a, b) = _group(db)
    for c in gb.commits:
        c.prepay_timing = "counter"
    gb.producer.payment_info = None
    db.commit()
    assert (
        client.delete(f"/group-buys/{gb.id}/commit", headers=auth_header(b)).status_code
        == 200
    )
    assert notes == []


def test_a_member_who_joined_before_the_link_is_still_listed(client, db, notes):
    # Members see «לתשלום» only once the group is funded, from the live link.
    gb, _owner, (_a, b) = _group(db, min_participants=1)
    for c in gb.commits:
        c.prepay_timing = "counter"
    db.commit()
    assert (
        client.delete(f"/group-buys/{gb.id}/commit", headers=auth_header(b)).status_code
        == 200
    )
    ((_to, _s, body),) = notes
    assert "• קוד 1001: 180 ₪" in body


def test_joining_a_group_keeps_the_terms(client, db, notes):
    gb, _owner, _users = _group(db, info=DEPOSIT, members=0, min_participants=5)
    gb.status, gb.funded_notified_at = "open", None
    db.commit()
    buyer = make_user(db, email="t-joiner@example.com")
    r = client.post(
        f"/group-buys/{gb.id}/commit", json={"quantity": 1}, headers=auth_header(buyer)
    )
    assert r.status_code == 201, r.text
    db.expire_all()
    (c,) = db.query(GroupBuyCommit).filter_by(group_buy_id=gb.id).all()
    assert c.prepay_timing == "deposit"


def test_the_column_refuses_an_unknown_terms_value(db, shop):
    from sqlalchemy.exc import IntegrityError

    _pay(db, shop["producer"].id, ADVANCE)
    offer = _seed_offer(db, shop["location"])
    buyer = make_user(db, email="t-check@example.com")
    from app.models.models import RescueOrder

    db.add(
        RescueOrder(
            offer_id=offer.id,
            user_id=buyer.id,
            qty=1,
            pickup_code="9999",
            status="reserved",
            prepay_timing="on_pickup",
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
