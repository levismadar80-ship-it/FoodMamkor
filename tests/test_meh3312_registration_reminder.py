"""MEH-3312 — the evening before, each on-site registrant gets one reminder.

The clock is passed in (`today=`), never read from the runner (testing.md,
MEH-2290): "tomorrow" is an Israel date.
"""

from datetime import date, time, timedelta

import pytest

import app.services.registration_reminders as mod
from app.models.models import Registration
from tests.test_meh3227_delist_cascade import _business, _event, _experience, _signup

TODAY = date(2026, 11, 16)
TOMORROW = TODAY + timedelta(days=1)


@pytest.fixture
def sent(monkeypatch):
    calls = []
    monkeypatch.setattr(
        mod,
        "send_registration_reminder",
        lambda to, m, test_cause=False: calls.append((to, m, test_cause)),
    )
    return calls


def _on(db, item, when):
    item.event_date = when
    db.commit()
    return item


def test_tomorrows_event_reminds_each_registrant_once(db, sent):
    producer, _ = _business(db)
    ev = _on(db, _event(db, producer, event_time=time(10, 0)), TOMORROW)
    _signup(db, ev, "a@example.com")
    _signup(db, ev, "b@example.com")
    assert mod.send_registration_reminders(db, today=TODAY) == 2
    assert sorted(to for to, _, _ in sent) == ["a@example.com", "b@example.com"]
    m = sent[0][1]
    assert m.date_text == "17.11.2026" and m.time_text == "10:00"
    assert m.cancel_url.endswith("/registration/tok-" + sent[0][0])
    # a second run the same evening sends nothing
    assert mod.send_registration_reminders(db, today=TODAY) == 0
    assert len(sent) == 2


def test_the_day_after_tomorrow_and_today_send_nothing(db, sent):
    producer, _ = _business(db)
    _signup(
        db, _on(db, _event(db, producer), TOMORROW + timedelta(days=1)), "a@example.com"
    )
    _signup(db, _on(db, _event(db, producer), TODAY), "b@example.com")
    assert mod.send_registration_reminders(db, today=TODAY) == 0


def test_cancelled_signup_or_cancelled_event_is_skipped(db, sent):
    producer, _ = _business(db)
    ev = _on(db, _event(db, producer), TOMORROW)
    gone = _signup(db, ev, "gone@example.com")
    gone.status = "cancelled"
    off = _on(db, _event(db, producer), TOMORROW)
    _signup(db, off, "off@example.com")
    off.is_active = False
    db.commit()
    assert mod.send_registration_reminders(db, today=TODAY) == 0


def test_one_off_workshop_is_reminded_recurring_is_not(db, sent):
    _, owner = _business(db)
    once = _on(db, _experience(db, owner), TOMORROW)
    _signup(db, once, "once@example.com")
    weekly = _on(db, _experience(db, owner, is_recurring=True), TOMORROW)
    _signup(db, weekly, "weekly@example.com")
    assert mod.send_registration_reminders(db, today=TODAY) == 1
    assert [to for to, _, _ in sent] == ["once@example.com"]
    assert sent[0][1].place == "בנימינה"  # a home address stays private


def test_rows_are_stamped(db, sent):
    producer, _ = _business(db)
    ev = _on(db, _event(db, producer), TOMORROW)
    reg = _signup(db, ev, "a@example.com")
    mod.send_registration_reminders(db, today=TODAY)
    db.expire_all()
    assert db.get(Registration, reg.id).reminder_sent_at is not None


def test_reminder_copy(monkeypatch):
    from app.services import registration_emails as re_mod
    from app.services.registration_emails import RegistrantEmail

    out = []
    monkeypatch.setattr(re_mod, "send_email", lambda *a, **k: out.append(a))
    re_mod.send_registration_reminder(
        "a@example.com",
        RegistrantEmail(
            title="יום פתוח",
            date_text="17.11.2026",
            time_text="10:00",
            place="חדרה",
            host_name="מאפיית הגליל",
            cancel_url="https://mehamakor.co.il/registration/t",
        ),
    )
    _to, subject, body = out[0][:3]
    assert subject == 'תזכורת: "יום פתוח" מחר'
    assert 'מחכים לכם מחר ב"יום פתוח".' in body
    assert "מתי: 17.11.2026, 10:00" in body
    assert "לא תוכלו להגיע? כדאי לבטל" in body
    assert "ביטול ההרשמה: https://mehamakor.co.il/registration/t" in body
