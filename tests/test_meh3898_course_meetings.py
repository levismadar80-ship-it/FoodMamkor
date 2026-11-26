"""MEH-3898: a course — one experience that meets several times, with ONE
sign-up for all of its meetings (a 5-meeting cheese-making course).

Before: an experience had one date, or (recurring) alternative dates that each
signed up on their own. Now an owner lists a course's meetings; the course
signs up once, against its first meeting, and closes when that one starts.
"""

from datetime import datetime, time, timedelta

import pytest

import app.routers.registrations as reg_router
from app.models.models import Experience, Registration
from app.utils.clock import israel_today

from tests.conftest import auth_header
from test_meh2763_registrations import _experience, _owner, _signup
from _test_experiences__common import _mock_moderation, _payload

D1 = israel_today() + timedelta(days=7)
D2 = israel_today() + timedelta(days=14)
D3 = israel_today() + timedelta(days=21)


@pytest.fixture
def mail(monkeypatch):
    from _queued_mail import route_queued_mail_to_senders  # MEH-3535

    route_queued_mail_to_senders(monkeypatch)
    for name in (
        "send_visitor_confirmation",
        "send_owner_new_registration",
        "send_owner_cancellation",
        "send_waitlist_confirmation",
    ):
        monkeypatch.setattr(reg_router, name, lambda *a, **kw: None)


def _m(day, at="18:00"):
    return {"date": day.isoformat(), "time": at}


def _create(client, host, **kw):
    return client.post("/experiences", json=_payload(**kw), headers=auth_header(host))


def _course(db, host, meetings, **kw):
    first = meetings[0]
    return _experience(
        db,
        host,
        event_date=datetime.fromisoformat(first["date"]).date(),
        event_time=time.fromisoformat(first["time"]),
        course_meetings=meetings,
        **kw,
    )


# ---------- the owner saves a course ----------


class TestOwnerSavesCourse:
    def test_meetings_are_stored_sorted_and_the_first_is_the_date(
        self, client, db, monkeypatch
    ):
        _mock_moderation(monkeypatch)
        host = _owner(db, email="host@example.com")
        res = _create(client, host, course_meetings=[_m(D3), _m(D1), _m(D2)])
        assert res.status_code == 201, res.text
        body = res.json()
        assert body["course_meetings"] == [_m(D1), _m(D2), _m(D3)]
        assert body["event_date"] == D1.isoformat()
        assert body["event_time"].startswith("18:00")
        got = db.get(Experience, body["id"])
        assert got.course_meetings == [_m(D1), _m(D2), _m(D3)]

    def test_without_meetings_it_is_not_a_course(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch)
        host = _owner(db, email="host@example.com")
        res = _create(client, host)
        assert res.status_code == 201, res.text
        assert res.json()["course_meetings"] == []
        assert db.get(Experience, res.json()["id"]).course_meetings is None

    @pytest.mark.parametrize(
        ("meetings", "detail"),
        [
            ([_m(D1)], "בקורס יש לפחות 2 מפגשים."),
            ([_m(D1), _m(D1)], "המפגש הזה כבר ברשימה."),
            ([_m(israel_today() - timedelta(days=1)), _m(D1)], "בחרו תאריך עתידי."),
        ],
        ids=["one_meeting", "a_meeting_twice", "a_past_meeting"],
    )
    def test_a_bad_list_is_refused(self, client, db, monkeypatch, meetings, detail):
        _mock_moderation(monkeypatch)
        host = _owner(db, email="host@example.com")
        res = _create(client, host, course_meetings=meetings)
        assert res.status_code == 422, res.text
        assert res.json()["detail"] == detail
        assert db.query(Experience).count() == 0

    def test_more_than_twenty_meetings_are_refused(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch)
        host = _owner(db, email="host@example.com")
        many = [_m(D1 + timedelta(days=i)) for i in range(21)]
        res = _create(client, host, course_meetings=many)
        assert res.status_code == 422, res.text
        assert res.json()["detail"] == "אפשר להוסיף עד 20 מפגשים לקורס."

    def test_a_course_cannot_also_be_recurring(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch)
        host = _owner(db, email="host@example.com")
        res = _create(
            client, host, is_recurring=True, course_meetings=[_m(D1), _m(D2)]
        )
        assert res.status_code == 422, res.text
        assert res.json()["detail"] == "קורס לא יכול להיות גם חוויה חוזרת."


class TestOwnerEditsCourse:
    def test_moving_the_first_meeting_moves_the_date_and_goes_to_moderation(
        self, client, db, monkeypatch
    ):
        _mock_moderation(monkeypatch)
        host = _owner(db, email="host@example.com")
        ex = _course(db, host, [_m(D1), _m(D2)])
        res = client.put(
            f"/experiences/{ex.id}",
            json={"course_meetings": [_m(D2), _m(D3)]},
            headers=auth_header(host),
        )
        assert res.status_code == 200, res.text
        db.expire_all()
        got = db.get(Experience, ex.id)
        assert got.course_meetings == [_m(D2), _m(D3)]
        assert got.event_date == D2
        assert got.status == "pending"  # meetings are content

    def test_a_date_sent_with_an_unchanged_course_is_ignored(
        self, client, db, monkeypatch
    ):
        _mock_moderation(monkeypatch)
        host = _owner(db, email="host@example.com")
        ex = _course(db, host, [_m(D1), _m(D2)])
        res = client.put(
            f"/experiences/{ex.id}",
            json={"event_date": D3.isoformat()},
            headers=auth_header(host),
        )
        assert res.status_code == 200, res.text
        db.expire_all()
        assert db.get(Experience, ex.id).event_date == D1

    def test_turning_a_course_recurring_is_refused(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch)
        host = _owner(db, email="host@example.com")
        ex = _course(db, host, [_m(D1), _m(D2)])
        res = client.put(
            f"/experiences/{ex.id}",
            json={"is_recurring": True},
            headers=auth_header(host),
        )
        assert res.status_code == 422, res.text
        assert res.json()["detail"] == "קורס לא יכול להיות גם חוויה חוזרת."

    def test_an_empty_list_makes_it_a_one_off_again(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch)
        host = _owner(db, email="host@example.com")
        ex = _course(db, host, [_m(D1), _m(D2)])
        res = client.put(
            f"/experiences/{ex.id}",
            json={"course_meetings": []},
            headers=auth_header(host),
        )
        assert res.status_code == 200, res.text
        db.expire_all()
        got = db.get(Experience, ex.id)
        assert got.course_meetings is None
        assert got.event_date == D1


class TestRunningCourse:
    """A course whose first meeting is past and later ones are not."""

    PAST = israel_today() - timedelta(days=7)

    def test_a_started_meeting_cannot_be_removed(self, client, db, monkeypatch):
        # Dropping it would move the date to meeting 2 and reopen sign-ups.
        _mock_moderation(monkeypatch)
        host = _owner(db, email="host@example.com")
        ex = _course(db, host, [_m(self.PAST), _m(D1), _m(D2)])
        res = client.put(
            f"/experiences/{ex.id}",
            json={"course_meetings": [_m(D1), _m(D2)]},
            headers=auth_header(host),
        )
        assert res.status_code == 422, res.text
        assert "שכבר התקיים" in res.json()["detail"]
        db.expire_all()
        assert db.get(Experience, ex.id).event_date == self.PAST

    def test_a_running_course_cannot_stop_being_a_course(
        self, client, db, monkeypatch
    ):
        _mock_moderation(monkeypatch)
        host = _owner(db, email="host@example.com")
        ex = _course(db, host, [_m(self.PAST), _m(D1)])
        res = client.put(
            f"/experiences/{ex.id}",
            json={"course_meetings": []},
            headers=auth_header(host),
        )
        assert res.status_code == 422, res.text

    def test_a_started_meeting_kept_saves_and_a_later_one_changes(
        self, client, db, monkeypatch
    ):
        _mock_moderation(monkeypatch)
        host = _owner(db, email="host@example.com")
        ex = _course(db, host, [_m(self.PAST), _m(D1)])
        res = client.put(
            f"/experiences/{ex.id}",
            json={"course_meetings": [_m(self.PAST), _m(D2)]},
            headers=auth_header(host),
        )
        assert res.status_code == 200, res.text
        db.expire_all()
        got = db.get(Experience, ex.id)
        assert got.course_meetings == [_m(self.PAST), _m(D2)]
        assert got.event_date == self.PAST

    def test_a_new_past_meeting_is_refused(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch)
        host = _owner(db, email="host@example.com")
        ex = _course(db, host, [_m(D1), _m(D2)])
        res = client.put(
            f"/experiences/{ex.id}",
            json={"course_meetings": [_m(self.PAST), _m(D1), _m(D2)]},
            headers=auth_header(host),
        )
        assert res.status_code == 422, res.text
        assert res.json()["detail"] == "בחרו תאריך עתידי."


class TestRegistrantsTold:
    """A later meeting changing is news to everyone signed up for the course;
    the first meeting moving is mailed by the existing «moved» email."""

    def _signed_up_course(self, client, db, mail, monkeypatch):
        import app.services.booking_cancellations as bc

        sent = {"course": [], "moved": []}
        monkeypatch.setattr(
            bc,
            "send_registrant_course_changed",
            lambda to, m, test_cause=False, meetings=(): sent["course"].append(
                (to, meetings)
            ),
        )
        monkeypatch.setattr(
            bc,
            "send_registrant_moved",
            lambda to, m, test_cause=False: sent["moved"].append(to),
        )
        _mock_moderation(monkeypatch)
        host = _owner(db, email="host@example.com")
        ex = _course(db, host, [_m(D1), _m(D2)])
        res = client.post(f"/experiences/{ex.id}/registrations", json=_signup())
        assert res.status_code == 201, res.text
        return host, ex, sent

    def test_a_later_meeting_moving_mails_the_new_list(
        self, client, db, mail, monkeypatch
    ):
        host, ex, sent = self._signed_up_course(client, db, mail, monkeypatch)
        res = client.put(
            f"/experiences/{ex.id}",
            json={"course_meetings": [_m(D1), _m(D3, "19:30")]},
            headers=auth_header(host),
        )
        assert res.status_code == 200, res.text
        assert sent["course"] == [
            (
                "dana@example.com",
                (f"{D1:%d.%m.%Y}, 18:00", f"{D3:%d.%m.%Y}, 19:30"),
            )
        ]
        assert sent["moved"] == []

    def test_the_first_meeting_moving_sends_one_email_not_two(
        self, client, db, mail, monkeypatch
    ):
        host, ex, sent = self._signed_up_course(client, db, mail, monkeypatch)
        res = client.put(
            f"/experiences/{ex.id}",
            json={"course_meetings": [_m(D2), _m(D3)]},
            headers=auth_header(host),
        )
        assert res.status_code == 200, res.text
        assert sent["moved"] == ["dana@example.com"]
        assert sent["course"] == []

    def test_an_edit_that_keeps_the_meetings_mails_nobody(
        self, client, db, mail, monkeypatch
    ):
        host, ex, sent = self._signed_up_course(client, db, mail, monkeypatch)
        res = client.put(
            f"/experiences/{ex.id}",
            json={"course_meetings": [_m(D1), _m(D2)], "title": "קורס גבינות"},
            headers=auth_header(host),
        )
        assert res.status_code == 200, res.text
        assert sent == {"course": [], "moved": []}


class TestOddInput:
    def test_null_leaves_the_course_as_it_is(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch)
        host = _owner(db, email="host@example.com")
        ex = _course(db, host, [_m(D1), _m(D2)])
        res = client.put(
            f"/experiences/{ex.id}",
            json={"course_meetings": None, "title": "קורס גבינות למתחילים"},
            headers=auth_header(host),
        )
        assert res.status_code == 200, res.text
        db.expire_all()
        assert db.get(Experience, ex.id).course_meetings == [_m(D1), _m(D2)]

    def test_a_time_with_an_offset_is_read_as_wall_clock(
        self, client, db, monkeypatch
    ):
        # An aware time beside a naive one on the same day used to 500.
        _mock_moderation(monkeypatch)
        host = _owner(db, email="host@example.com")
        res = _create(
            client,
            host,
            course_meetings=[_m(D1, "18:00"), _m(D1, "10:00+02:00")],
        )
        assert res.status_code == 201, res.text
        assert res.json()["course_meetings"] == [_m(D1, "10:00"), _m(D1, "18:00")]

    def test_the_same_minute_twice_is_a_duplicate(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch)
        host = _owner(db, email="host@example.com")
        res = _create(
            client,
            host,
            course_meetings=[_m(D1, "18:00"), _m(D1, "18:00:30"), _m(D2)],
        )
        assert res.status_code == 422, res.text
        assert res.json()["detail"] == "המפגש הזה כבר ברשימה."


# ---------- a visitor signs up once ----------


class TestCourseSignup:
    def test_one_signup_with_no_date_choice_takes_one_place(self, client, db, mail):
        host = _owner(db, email="host@example.com")
        ex = _course(db, host, [_m(D1), _m(D2), _m(D3)], max_participants=1)
        res = client.post(f"/experiences/{ex.id}/registrations", json=_signup())
        assert res.status_code == 201, res.text
        rows = db.query(Registration).filter_by(experience_id=ex.id).all()
        assert [(r.status, r.session_date) for r in rows] == [("registered", None)]
        # The one place is the whole course's: the next visitor is full.
        res2 = client.post(
            f"/experiences/{ex.id}/registrations",
            json=_signup(email="other@example.com", phone="052-1112233"),
        )
        assert res2.status_code == 409, res2.text

    def test_signup_closes_once_the_first_meeting_started(
        self, client, db, mail, monkeypatch
    ):
        host = _owner(db, email="host@example.com")
        ex = _course(db, host, [_m(D1, "10:00"), _m(D2, "10:00")])
        monkeypatch.setattr(reg_router, "israel_today", lambda: D1)
        monkeypatch.setattr(
            reg_router, "israel_now", lambda: datetime.combine(D1, time(10, 30))
        )
        res = client.post(f"/experiences/{ex.id}/registrations", json=_signup())
        assert res.status_code == 409, res.text

    def test_a_course_saved_by_its_owner_takes_one_signup(
        self, client, db, mail, monkeypatch
    ):
        # End to end: the owner's POST sets the date from the meetings, and
        # the sign-up path reads it (the cases above seed the row directly).
        _mock_moderation(monkeypatch)
        host = _owner(db, email="host@example.com")
        res = _create(
            client,
            host,
            event_date=D3.isoformat(),
            course_meetings=[_m(D2), _m(D1)],
            max_participants=1,
            registration_method="site_form",
        )
        assert res.status_code == 201, res.text
        ex_id = res.json()["id"]
        db.query(Experience).filter_by(id=ex_id).update({"status": "approved"})
        db.commit()
        assert db.get(Experience, ex_id).event_date == D1
        first = client.post(f"/experiences/{ex_id}/registrations", json=_signup())
        assert first.status_code == 201, first.text
        second = client.post(
            f"/experiences/{ex_id}/registrations",
            json=_signup(email="other@example.com", phone="052-1112233"),
        )
        assert second.status_code == 409, second.text

    def test_the_public_page_lists_every_meeting(self, client, db):
        host = _owner(db, email="host@example.com")
        ex = _course(db, host, [_m(D1), _m(D2), _m(D3)])
        res = client.get(f"/experiences/{ex.id}")
        assert res.status_code == 200, res.text
        assert res.json()["course_meetings"] == [_m(D1), _m(D2), _m(D3)]


def test_the_course_email_lists_every_meeting_and_the_cancel_link(monkeypatch):
    import app.services.registration_emails as re_mod

    got = {}
    monkeypatch.setattr(
        re_mod,
        "send_email",
        lambda to, subject, body, html=None, test_cause=False: got.update(
            subject=subject, body=body, html=html
        ),
    )
    m = re_mod.RegistrantEmail(
        title="קורס גבנות",
        date_text="",
        time_text="",
        place="לוטם",
        host_name="מחלבת לוטם",
        cancel_url="https://example.com/registration/abc",
    )
    re_mod.send_registrant_course_changed(
        "dana@example.com", m, meetings=("06.12.2026, 18:00", "13.12.2026, 19:30")
    )
    assert got["subject"] == 'המפגשים של "קורס גבנות" השתנו'
    assert "מפגש 1: 06.12.2026, 18:00\nמפגש 2: 13.12.2026, 19:30" in got["body"]
    assert "https://example.com/registration/abc" in got["html"]
