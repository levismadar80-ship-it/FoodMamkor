"""MEH-3597 — a group buy's pickup window (date + hours), optional, beside the
free-text pickup note. Before: only free text, so the card and page could not
say «איסוף: שישי 5.12, 9:00–13:00» the way a rescue bag does."""

from datetime import timedelta

from conftest import auth_header
from test_group_buys_api import _make_group_buy, _producer_user
from app.utils.clock import utc_now


def _payload(**over):
    deadline = utc_now() + timedelta(days=5)
    body = {
        "title": "קמח כוסמין מלא",
        "product_name": "שק קמח",
        "price_per_unit_regular": "18",
        "price_per_unit_group": "13",
        "min_participants": 2,
        "deadline": deadline.isoformat(),
        "pickup_note": "איסוף מהטחנה",
    }
    body.update(over)
    return body


def test_create_with_a_window_stores_it_naive_utc_and_returns_it(client, db):
    _, owner = _producer_user(db, email="pw1@example.com")
    r = client.post(
        "/group-buys",
        json=_payload(pickup_starts_at="2099-12-05T09:00:00+02:00", pickup_ends_at="2099-12-05T13:00:00+02:00"),
        headers=auth_header(owner),
    )
    assert r.status_code == 201, r.text
    gb_id = r.json()["id"]
    detail = client.get(f"/group-buys/{gb_id}").json()
    assert detail["pickup_starts_at"].startswith("2099-12-05T07:00:00")
    assert detail["pickup_ends_at"].startswith("2099-12-05T11:00:00")


def test_without_a_window_nothing_changes(client, db):
    _, owner = _producer_user(db, email="pw2@example.com")
    r = client.post("/group-buys", json=_payload(), headers=auth_header(owner))
    assert r.status_code == 201
    assert client.get(f"/group-buys/{r.json()['id']}").json()["pickup_starts_at"] is None


def test_half_a_window_or_a_reversed_one_is_refused(client, db):
    _, owner = _producer_user(db, email="pw3@example.com")
    h = auth_header(owner)
    assert client.post("/group-buys", json=_payload(pickup_starts_at="2099-12-05T09:00:00Z"), headers=h).status_code == 422
    assert client.post(
        "/group-buys",
        json=_payload(pickup_starts_at="2099-12-05T13:00:00Z", pickup_ends_at="2099-12-05T09:00:00Z"),
        headers=h,
    ).status_code == 422
    assert client.post(
        "/group-buys",
        json=_payload(pickup_starts_at="2099-12-01T09:00:00Z", pickup_ends_at="2099-12-09T09:00:00Z"),
        headers=h,
    ).status_code == 422


def test_owner_sets_and_clears_the_window_in_settings(client, db):
    producer, owner = _producer_user(db, email="pw4@example.com")
    gb = _make_group_buy(db, producer)
    h = auth_header(owner)
    r = client.patch(
        f"/group-buys/{gb.id}/settings",
        json={"pickup_starts_at": "2099-12-05T07:00:00Z", "pickup_ends_at": "2099-12-05T11:00:00Z"},
        headers=h,
    )
    assert r.status_code == 200, r.text
    db.refresh(gb)
    assert gb.pickup_starts_at.hour == 7 and gb.pickup_ends_at.hour == 11
    assert client.patch(f"/group-buys/{gb.id}/settings", json={"pickup_starts_at": "2099-12-05T07:00:00Z"}, headers=h).status_code == 422
    cleared = client.patch(f"/group-buys/{gb.id}/settings", json={"pickup_starts_at": None, "pickup_ends_at": None}, headers=h)
    assert cleared.status_code == 200, cleared.text
    db.refresh(gb)
    assert gb.pickup_starts_at is None and gb.pickup_ends_at is None


# MEH-3597 review round 1.
def test_exactly_a_week_is_accepted(client, db):
    _, owner = _producer_user(db, email="pw5@example.com")
    r = client.post(
        "/group-buys",
        json=_payload(pickup_starts_at="2099-12-01T09:00:00Z", pickup_ends_at="2099-12-08T09:00:00Z"),
        headers=auth_header(owner),
    )
    assert r.status_code == 201, r.text


def test_pickup_before_the_deadline_is_refused_on_create(client, db):
    _, owner = _producer_user(db, email="pw6@example.com")
    soon = utc_now() + timedelta(days=1)
    r = client.post(
        "/group-buys",
        json=_payload(pickup_starts_at=soon.isoformat(), pickup_ends_at=(soon + timedelta(hours=2)).isoformat()),
        headers=auth_header(owner),
    )
    assert r.status_code == 422
    assert "המועד האחרון" in r.text


def test_pickup_before_the_deadline_is_refused_in_settings(client, db):
    producer, owner = _producer_user(db, email="pw7@example.com")
    gb = _make_group_buy(db, producer)
    start = gb.deadline - timedelta(hours=1)
    r = client.patch(
        f"/group-buys/{gb.id}/settings",
        json={"pickup_starts_at": start.isoformat(), "pickup_ends_at": (start + timedelta(hours=3)).isoformat()},
        headers=auth_header(owner),
    )
    assert r.status_code == 400
    db.refresh(gb)
    assert gb.pickup_starts_at is None


def test_an_out_of_range_aware_date_is_a_422_not_a_500(client, db):
    _, owner = _producer_user(db, email="pw8@example.com")
    r = client.post(
        "/group-buys",
        json=_payload(pickup_starts_at="9999-12-31T23:00:00-10:00", pickup_ends_at="9999-12-31T23:30:00-10:00"),
        headers=auth_header(owner),
    )
    assert r.status_code == 422


def test_a_stranger_cannot_set_the_window(client, db):
    producer, _ = _producer_user(db, email="pw9@example.com")
    _, other = _producer_user(db, email="pw10@example.com")
    gb = _make_group_buy(db, producer)
    r = client.patch(
        f"/group-buys/{gb.id}/settings",
        json={"pickup_starts_at": "2099-12-05T07:00:00Z", "pickup_ends_at": "2099-12-05T11:00:00Z"},
        headers=auth_header(other),
    )
    assert r.status_code in (403, 404)
    db.refresh(gb)
    assert gb.pickup_starts_at is None


# MEH-3597 (Sapir 21/11, «תבדוק מה עוד חסר»): the emails carry the pickup.
from datetime import datetime  # noqa: E402

from app.routers import group_buy_capacity as capacity_router  # noqa: E402
from app.services import group_buy_notifications as notes  # noqa: E402
from app.services.group_buy_pickup_text import pickup_lines, pickup_window_he  # noqa: E402
from conftest import make_user  # noqa: E402


def test_pickup_text_in_israel_time_winter_summer_and_across_days():
    assert pickup_window_he(datetime(2099, 12, 4, 7), datetime(2099, 12, 4, 11)) == "יום שישי 4.12, 09:00–13:00"
    assert pickup_window_he(datetime(2099, 7, 3, 6), datetime(2099, 7, 3, 10)) == "יום שישי 3.7, 09:00–13:00"
    assert pickup_window_he(datetime(2099, 12, 4, 7), datetime(2099, 12, 5, 11)) == "יום שישי 4.12, 09:00 – יום שבת 5.12, 13:00"
    assert pickup_window_he(None, None) == ""
    assert pickup_lines(None, None, None, None) == ""
    assert pickup_lines(datetime(2099, 12, 4, 7), datetime(2099, 12, 4, 11), "מהמאפייה", None) == (
        "מועד איסוף: יום שישי 4.12, 09:00–13:00\nאיסוף: מהמאפייה\n"
    )


def test_the_funded_email_says_when_and_where(monkeypatch):
    sent = []
    monkeypatch.setattr(notes, "_send_email", lambda to, subject, body, test_cause=False: sent.append(body))
    notes.notify_participant_funded("a@example.com", "קמח", "טחנה", "gb-1", "p-1", pickup="מועד איסוף: יום שישי 4.12, 09:00–13:00\n")
    assert "מועד איסוף: יום שישי 4.12, 09:00–13:00" in sent[0]
    notes.notify_participant_funded("a@example.com", "קמח", "טחנה", "gb-1", "p-1")
    assert "מועד איסוף" not in sent[1]


def _changed_sends(monkeypatch):
    calls = []
    monkeypatch.setattr(
        capacity_router,
        "send_pickup_changed",
        lambda emails, title, gid, window, notes, **kw: calls.append((list(emails), window, notes, kw)),
    )
    return calls


def _joined(client, db, gb, email):
    member = make_user(db, email=email)
    assert client.post(f"/group-buys/{gb.id}/commit", json={"quantity": 1}, headers=auth_header(member)).status_code == 201


WINDOW = {"pickup_starts_at": "2099-12-05T07:00:00Z", "pickup_ends_at": "2099-12-05T11:00:00Z"}


def test_setting_then_changing_then_clearing_tells_who_joined(client, db, monkeypatch):
    calls = _changed_sends(monkeypatch)
    producer, owner = _producer_user(db, email="pw11@example.com")
    gb = _make_group_buy(db, producer)
    gb.pickup_note, gb.delivery_note, gb.fulfillment_note = "מהמאפייה", None, None
    db.commit()
    _joined(client, db, gb, "joined@example.com")
    h = auth_header(owner)
    assert client.patch(f"/group-buys/{gb.id}/settings", json=WINDOW, headers=h).status_code == 200
    assert calls[0][:3] == (["joined@example.com"], "יום שבת 5.12, 09:00–13:00", "איסוף: מהמאפייה\n")
    assert calls[0][3]["first"] is True
    # the same window again: nobody is mailed twice
    assert client.patch(f"/group-buys/{gb.id}/settings", json=WINDOW, headers=h).status_code == 200
    assert len(calls) == 1
    later = {"pickup_starts_at": "2099-12-05T08:00:00Z", "pickup_ends_at": "2099-12-05T11:00:00Z"}
    assert client.patch(f"/group-buys/{gb.id}/settings", json=later, headers=h).status_code == 200
    assert calls[1][1] == "יום שבת 5.12, 10:00–13:00" and calls[1][3]["first"] is False
    assert client.patch(f"/group-buys/{gb.id}/settings", json={"pickup_starts_at": None, "pickup_ends_at": None}, headers=h).status_code == 200
    assert calls[2][1] == ""


def test_a_cap_only_save_leaves_the_window_and_mails_nobody(client, db, monkeypatch):
    calls = _changed_sends(monkeypatch)
    producer, owner = _producer_user(db, email="pw13@example.com")
    gb = _make_group_buy(db, producer)
    _joined(client, db, gb, "j13@example.com")
    h = auth_header(owner)
    assert client.patch(f"/group-buys/{gb.id}/settings", json=WINDOW, headers=h).status_code == 200
    assert client.patch(f"/group-buys/{gb.id}/settings", json={"max_units": 50}, headers=h).status_code == 200
    db.refresh(gb)
    assert gb.pickup_starts_at.hour == 7 and len(calls) == 1


def test_delivery_only_group_mails_no_pickup_time(client, db, monkeypatch):
    calls = _changed_sends(monkeypatch)
    producer, owner = _producer_user(db, email="pw14@example.com")
    gb = _make_group_buy(db, producer)
    gb.pickup_note, gb.delivery_note, gb.fulfillment_note = None, "משלוח לחדרה", None
    db.commit()
    _joined(client, db, gb, "j14@example.com")
    assert client.patch(f"/group-buys/{gb.id}/settings", json=WINDOW, headers=auth_header(owner)).status_code == 200
    assert calls == []
    assert pickup_lines(datetime(2099, 12, 4, 7), datetime(2099, 12, 4, 11), None, "משלוח לחדרה") == "משלוח: משלוח לחדרה\n"


def test_after_the_deadline_only_the_pickup_time_can_change(client, db, monkeypatch):
    _changed_sends(monkeypatch)
    producer, owner = _producer_user(db, email="pw15@example.com")
    gb = _make_group_buy(db, producer)
    gb.deadline = utc_now() - timedelta(hours=1)
    db.commit()
    h = auth_header(owner)
    assert client.patch(f"/group-buys/{gb.id}/settings", json=WINDOW, headers=h).status_code == 200
    assert client.patch(f"/group-buys/{gb.id}/settings", json={"max_units": 50}, headers=h).status_code == 400


def test_the_change_email_says_set_changed_or_removed(monkeypatch):
    sent = []
    monkeypatch.setattr(notes, "_send_email", lambda to, subject, body, test_cause=False: sent.append((body, test_cause)))
    notes.notify_pickup_changed("a@example.com", "קמח", "gb-1", "יום שישי 4.12, 09:00–13:00", "איסוף: מהטחנה\n", first=True)
    notes.notify_pickup_changed("a@example.com", "קמח", "gb-1", "יום שישי 4.12, 10:00–13:00", "")
    notes.notify_pickup_changed("a@example.com", "קמח", "gb-1", "", "איסוף: מהטחנה\n", test_cause=True)
    assert "קבע מועד איסוף" in sent[0][0] and "איסוף: מהטחנה" in sent[0][0]
    assert "המועד החדש: יום שישי 4.12, 10:00–13:00" in sent[1][0]
    assert "הסיר את מועד האיסוף" in sent[2][0] and sent[2][1] is True


def test_the_funded_send_carries_the_pickup(client, db, monkeypatch):
    from app.routers import group_buys as gb_router

    queued = []
    monkeypatch.setattr(gb_router, "send_funded_notifications", lambda *a, **kw: queued.append(kw.get("pickup")))
    producer, _ = _producer_user(db, email="pw16@example.com")
    gb = _make_group_buy(db, producer, min_participants=1)
    gb.pickup_note, gb.delivery_note, gb.fulfillment_note = "מהמאפייה", None, None
    gb.pickup_starts_at, gb.pickup_ends_at = datetime(2099, 12, 5, 7), datetime(2099, 12, 5, 11)
    db.commit()
    _joined(client, db, gb, "j16@example.com")
    assert queued == ["מועד איסוף: יום שבת 5.12, 09:00–13:00\nאיסוף: מהמאפייה\n"]
