"""MEH-2763 — «איך נרשמים?» + on-site sign-ups for events and experiences.

Covers the server half (chunk 1):
  - registration_method on create / update, and its prerequisites;
  - POST sign-up: stored, emails queued, capacity, duplicate, closed states;
  - the owner list (owner / admin only — registrant PII);
  - cancel by token (info, cancel, idempotent, frees the spot);
  - the 30-day purge the form promises.

Emails are captured by patching the send functions on the router module —
the names BackgroundTasks resolves at call time.
"""

from datetime import date, timedelta

import pytest

from app.models.models import Event, Experience, Registration, User
from app.services.retention_purge import run_purge
from app.utils.clock import israel_today
from conftest import auth_header, make_producer, make_user

MOBILE = "050-1234567"
LANDLINE = "03-6123456"


# ---------- fixtures / helpers ----------


@pytest.fixture
def sent(monkeypatch):
    """Every email the router queued, as (kind, to, payload)."""
    calls = []
    import app.routers.registrations as r

    monkeypatch.setattr(
        r, "send_visitor_confirmation", lambda to, m: calls.append(("visitor", to, m))
    )
    monkeypatch.setattr(
        r,
        "send_owner_new_registration",
        lambda to, m: calls.append(("owner_new", to, m)),
    )
    monkeypatch.setattr(
        r,
        "send_owner_cancellation",
        lambda to, m: calls.append(("owner_cancel", to, m)),
    )
    return calls


def _owner(db, *, phone=MOBILE, status="approved", email=None) -> User:
    producer = make_producer(db, status=status)
    producer.phone = phone
    user = make_user(db, role="producer", email=email, email_verified=True)
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return user


def _event(db, owner: User, **kw) -> Event:
    ev = Event(
        producer_id=owner.producer_id,
        title=kw.pop("title", "יום פתוח במאפייה"),
        event_date=kw.pop("event_date", israel_today() + timedelta(days=7)),
        category="שוק",
        city="חדרה",
        is_active=kw.pop("is_active", True),
        registration_method=kw.pop("registration_method", "site_form"),
        **kw,
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


def _experience(db, host: User, **kw) -> Experience:
    ex = Experience(
        title=kw.pop("title", "סדנת בישול טבעוני"),
        description="סדנה מעשית לבישול טבעוני ביתי עם ירקות העונה",
        host_user_id=host.id,
        event_date=kw.pop("event_date", israel_today() + timedelta(days=7)),
        location_type=kw.pop("location_type", "home"),
        city="בנימינה",
        status=kw.pop("status", "approved"),
        is_active=True,
        participants_count=kw.pop("participants_count", 0),
        registration_method=kw.pop("registration_method", "site_form"),
        **kw,
    )
    db.add(ex)
    db.commit()
    db.refresh(ex)
    return ex


def _signup(name="דנה כהן", phone="052-7654321", email="dana@example.com"):
    return {"name": name, "phone": phone, "email": email}


# ---------- sign-up: event ----------


class TestEventSignup:
    def test_signup_is_stored_and_both_emails_queued(self, client, db, sent):
        owner = _owner(db, email="owner-ev@example.com")
        ev = _event(db, owner, max_participants=10)

        r = client.post(f"/events/{ev.id}/registrations", json=_signup())
        assert r.status_code == 201, r.text
        assert r.json() == {"status": "registered"}  # no token, no PII back

        rows = db.query(Registration).filter_by(event_id=ev.id).all()
        assert [(x.name, x.phone, x.email, x.status) for x in rows] == [
            ("דנה כהן", "0527654321", "dana@example.com", "registered")
        ]
        kinds = [(k, to) for k, to, _ in sent]
        assert kinds == [
            ("visitor", "dana@example.com"),
            ("owner_new", "owner-ev@example.com"),
        ]
        visitor = sent[0][2]
        assert visitor.cancel_url.endswith(f"/registration/{rows[0].cancel_token}")
        assert sent[1][2].spots_left == 9

        out = client.get(f"/events/{ev.id}").json()
        assert out["registration_method"] == "site_form"
        assert out["registered_count"] == 1
        assert out["spots_left"] == 9

    def test_same_email_twice_is_one_row_and_one_set_of_emails(self, client, db, sent):
        ev = _event(db, _owner(db))
        assert (
            client.post(f"/events/{ev.id}/registrations", json=_signup()).status_code
            == 201
        )
        again = client.post(
            f"/events/{ev.id}/registrations", json=_signup(email="DANA@example.com")
        )
        assert again.status_code == 201
        assert db.query(Registration).filter_by(event_id=ev.id).count() == 1
        assert len(sent) == 2

    def test_full_event_refuses_the_next_signup(self, client, db, sent):
        ev = _event(db, _owner(db), max_participants=1)
        assert (
            client.post(f"/events/{ev.id}/registrations", json=_signup()).status_code
            == 201
        )
        r = client.post(
            f"/events/{ev.id}/registrations", json=_signup(email="noa@example.com")
        )
        assert r.status_code == 409
        assert r.json()["detail"]["code"] == "registration_full"

    @pytest.mark.parametrize("method", ["whatsapp", "phone", "external_url"])
    def test_other_methods_take_no_site_signups(self, client, db, sent, method):
        ev = _event(
            db,
            _owner(db),
            registration_method=method,
            registration_url="https://example.com/form",
        )
        r = client.post(f"/events/{ev.id}/registrations", json=_signup())
        assert r.status_code == 409
        assert r.json()["detail"]["code"] == "registration_closed"
        assert db.query(Registration).count() == 0

    def test_past_and_cancelled_events_are_closed(self, client, db, sent):
        owner = _owner(db)
        past = _event(db, owner, event_date=israel_today() - timedelta(days=1))
        off = _event(db, owner, is_active=False)
        for ev in (past, off):
            r = client.post(f"/events/{ev.id}/registrations", json=_signup())
            assert r.status_code == 409, ev.id

    def test_pending_business_event_is_404(self, client, db, sent):
        ev = _event(db, _owner(db, status="pending"))
        assert (
            client.post(f"/events/{ev.id}/registrations", json=_signup()).status_code
            == 404
        )

    @pytest.mark.parametrize(
        "bad",
        [
            {"name": "ד"},  # one letter
            {"phone": "12"},
            {"email": "not-an-email"},
            {"email": ""},
        ],
    )
    def test_invalid_form_is_422(self, client, db, sent, bad):
        ev = _event(db, _owner(db))
        r = client.post(f"/events/{ev.id}/registrations", json=_signup() | bad)
        assert r.status_code == 422
        assert db.query(Registration).count() == 0

    def test_full_event_answers_409_even_for_an_email_already_on_the_list(
        self, client, db, sent
    ):
        # 201-for-a-listed-email vs 409-for-a-new-one would tell a stranger
        # who is signed up (adversarial review, PR #4078).
        ev = _event(db, _owner(db), max_participants=1)
        client.post(f"/events/{ev.id}/registrations", json=_signup())
        listed = client.post(f"/events/{ev.id}/registrations", json=_signup())
        new = client.post(
            f"/events/{ev.id}/registrations", json=_signup(email="noa@example.com")
        )
        assert (listed.status_code, new.status_code) == (409, 409)
        assert listed.json() == new.json()


# ---------- sign-up: experience ----------


class TestExperienceSignup:
    def test_signup_counts_with_the_hosts_own_tally(self, client, db, sent):
        host = _owner(db, email="host-ex@example.com")
        ex = _experience(db, host, max_participants=3, participants_count=1)

        assert (
            client.post(
                f"/experiences/{ex.id}/registrations", json=_signup()
            ).status_code
            == 201
        )
        assert sent[1][2].spots_left == 1

        out = client.get(f"/experiences/{ex.id}").json()
        assert out["registered_count"] == 1
        assert out["participants_count"] == 1  # the host's tally is untouched
        assert out["spots_left"] == 1

        assert (
            client.post(
                f"/experiences/{ex.id}/registrations",
                json=_signup(email="b@example.com"),
            ).status_code
            == 201
        )
        r = client.post(
            f"/experiences/{ex.id}/registrations", json=_signup(email="c@example.com")
        )
        assert r.status_code == 409
        assert r.json()["detail"]["code"] == "registration_full"

    def test_home_address_never_reaches_the_visitor_email(self, client, db, sent):
        ex = _experience(db, _owner(db), address="רחוב הדקל 5")
        client.post(f"/experiences/{ex.id}/registrations", json=_signup())
        assert sent[0][2].place == "בנימינה"

    def test_unapproved_experience_is_404(self, client, db, sent):
        ex = _experience(db, _owner(db), status="pending")
        assert (
            client.post(
                f"/experiences/{ex.id}/registrations", json=_signup()
            ).status_code
            == 404
        )

    def test_whatsapp_experience_takes_no_site_signups(self, client, db, sent):
        ex = _experience(db, _owner(db), registration_method="whatsapp")
        assert (
            client.post(
                f"/experiences/{ex.id}/registrations", json=_signup()
            ).status_code
            == 409
        )

    def test_past_and_cancelled_experiences_are_409_not_404(self, client, db, sent):
        # Same contract as events: the detail page still shows them by link.
        host = _owner(db)
        past = _experience(db, host, event_date=israel_today() - timedelta(days=1))
        off = _experience(db, host)
        off.is_active = False
        db.commit()
        for ex in (past, off):
            r = client.post(f"/experiences/{ex.id}/registrations", json=_signup())
            assert r.status_code == 409, ex.id
            assert r.json()["detail"]["code"] == "registration_closed"

    def test_full_experience_answers_409_even_for_a_listed_email(
        self, client, db, sent
    ):
        ex = _experience(db, _owner(db), max_participants=1)
        client.post(f"/experiences/{ex.id}/registrations", json=_signup())
        r = client.post(f"/experiences/{ex.id}/registrations", json=_signup())
        assert r.status_code == 409
        assert r.json()["detail"]["code"] == "registration_full"


# ---------- owner list ----------


class TestOwnerList:
    def test_owner_and_admin_see_the_list_strangers_do_not(self, client, db, sent):
        owner = _owner(db)
        ev = _event(db, owner)
        client.post(f"/events/{ev.id}/registrations", json=_signup())

        mine = client.get(f"/events/{ev.id}/registrations", headers=auth_header(owner))
        assert mine.status_code == 200
        assert [(x["name"], x["phone"], x["email"]) for x in mine.json()] == [
            ("דנה כהן", "0527654321", "dana@example.com")
        ]
        admin = make_user(db, role="admin")
        assert (
            client.get(
                f"/events/{ev.id}/registrations", headers=auth_header(admin)
            ).status_code
            == 200
        )

        other = _owner(db)
        assert (
            client.get(
                f"/events/{ev.id}/registrations", headers=auth_header(other)
            ).status_code
            == 404
        )
        assert client.get(f"/events/{ev.id}/registrations").status_code == 401

    def test_experience_list_is_the_hosts_only(self, client, db, sent):
        host = _owner(db)
        ex = _experience(db, host)
        client.post(f"/experiences/{ex.id}/registrations", json=_signup())
        assert (
            len(
                client.get(
                    f"/experiences/{ex.id}/registrations", headers=auth_header(host)
                ).json()
            )
            == 1
        )
        assert (
            client.get(
                f"/experiences/{ex.id}/registrations", headers=auth_header(_owner(db))
            ).status_code
            == 404
        )


# ---------- cancel ----------


class TestCancel:
    def test_cancel_frees_the_spot_and_tells_the_owner_once(self, client, db, sent):
        owner = _owner(db, email="owner-c@example.com")
        ev = _event(db, owner, max_participants=1)
        client.post(f"/events/{ev.id}/registrations", json=_signup())
        token = db.query(Registration).one().cancel_token

        info = client.get(f"/registrations/{token}").json()
        assert info["kind"] == "event" and info["status"] == "registered"
        assert info["title"] == "יום פתוח במאפייה"

        r = client.post(f"/registrations/{token}/cancel")
        assert r.status_code == 200 and r.json()["status"] == "cancelled"
        assert (
            client.post(f"/registrations/{token}/cancel").json()["status"]
            == "cancelled"
        )
        cancels = [x for x in sent if x[0] == "owner_cancel"]
        assert [(to, m.name) for _, to, m in cancels] == [
            ("owner-c@example.com", "דנה כהן")
        ]

        # the seat is free again
        assert client.get(f"/events/{ev.id}").json()["spots_left"] == 1
        assert (
            client.post(
                f"/events/{ev.id}/registrations", json=_signup(email="noa@example.com")
            ).status_code
            == 201
        )

    def test_unknown_token_is_404(self, client):
        assert client.get("/registrations/nope").status_code == 404
        assert client.post("/registrations/nope/cancel").status_code == 404

    def test_cancel_after_the_date_sends_the_owner_nothing(self, client, db, sent):
        owner = _owner(db, email="owner-late@example.com")
        ev = _event(db, owner)
        client.post(f"/events/{ev.id}/registrations", json=_signup())
        token = db.query(Registration).one().cancel_token
        ev.event_date = israel_today() - timedelta(days=2)
        db.commit()
        r = client.post(f"/registrations/{token}/cancel")
        assert r.status_code == 200 and r.json()["status"] == "cancelled"
        assert [x for x in sent if x[0] == "owner_cancel"] == []


# ---------- registration_method on create / update ----------


def _event_payload(**kw):
    return {
        "title": "יום פתוח במאפייה",
        "event_date": date(2099, 1, 1).isoformat(),
        "category": "שוק",
        "city": "חדרה",
    } | kw


class TestMethodPrerequisites:
    def test_default_is_site_form(self, client, db):
        owner = _owner(db)
        r = client.post("/events", json=_event_payload(), headers=auth_header(owner))
        assert r.status_code == 201
        assert r.json()["registration_method"] == "site_form"

    def test_whatsapp_needs_a_mobile(self, client, db):
        landline = _owner(db, phone=LANDLINE)
        r = client.post(
            "/events",
            json=_event_payload(registration_method="whatsapp"),
            headers=auth_header(landline),
        )
        assert r.status_code == 422
        assert r.json()["detail"]["code"] == "registration_whatsapp_needs_mobile"

        mobile = _owner(db, phone=MOBILE)
        r = client.post(
            "/events",
            json=_event_payload(registration_method="whatsapp"),
            headers=auth_header(mobile),
        )
        assert r.status_code == 201

    def test_phone_needs_a_phone(self, client, db):
        none = _owner(db, phone=None)
        r = client.post(
            "/events",
            json=_event_payload(registration_method="phone"),
            headers=auth_header(none),
        )
        assert r.json()["detail"]["code"] == "registration_phone_needs_phone"

    def test_external_needs_a_url(self, client, db):
        owner = _owner(db)
        r = client.post(
            "/events",
            json=_event_payload(registration_method="external_url"),
            headers=auth_header(owner),
        )
        assert r.json()["detail"]["code"] == "registration_external_needs_url"
        ok = client.post(
            "/events",
            json=_event_payload(
                registration_method="external_url",
                registration_url="https://forms.example.com/x",
            ),
            headers=auth_header(owner),
        )
        assert ok.status_code == 201

    def test_unknown_method_is_422(self, client, db):
        r = client.post(
            "/events",
            json=_event_payload(registration_method="carrier_pigeon"),
            headers=auth_header(_owner(db)),
        )
        assert r.status_code == 422

    def test_update_checks_only_when_the_method_is_touched(self, client, db):
        # A legacy whatsapp row whose business has since lost its mobile must
        # still accept an unrelated edit.
        owner = _owner(db, phone=LANDLINE)
        ev = _event(db, owner, registration_method="whatsapp")
        h = auth_header(owner)
        assert (
            client.put(
                f"/events/{ev.id}", json={"title": "יום פתוח חדש"}, headers=h
            ).status_code
            == 200
        )
        assert (
            client.put(
                f"/events/{ev.id}", json={"registration_method": "site_form"}, headers=h
            ).json()["registration_method"]
            == "site_form"
        )
        # switching (back) to whatsapp is a change, and a landline can't take it
        r = client.put(
            f"/events/{ev.id}", json={"registration_method": "whatsapp"}, headers=h
        )
        assert r.status_code == 422

    def test_experience_method_change_skips_moderation(self, client, db):
        host = _owner(db)
        ex = _experience(db, host, registration_method="whatsapp")
        r = client.put(
            f"/experiences/{ex.id}",
            json={"registration_method": "site_form"},
            headers=auth_header(host),
        )
        assert r.status_code == 200
        body = r.json()
        assert body["registration_method"] == "site_form"
        assert body["status"] == "approved"

    def test_resending_a_stored_method_never_blocks_an_edit(self, client, db):
        # Every legacy experience was backfilled to whatsapp, and the form
        # re-sends the method on every save. A host whose business has only a
        # landline must still be able to fix a typo.
        host = _owner(db, phone=LANDLINE)
        ex = _experience(db, host, registration_method="whatsapp")
        r = client.put(
            f"/experiences/{ex.id}",
            json={
                "title": "סדנת בישול טבעוני מעודכנת",
                "registration_method": "whatsapp",
                "registration_url": None,
            },
            headers=auth_header(host),
        )
        assert r.status_code == 200, r.text
        ev = _event(db, host, registration_method="whatsapp")
        r = client.put(
            f"/events/{ev.id}",
            json={"title": "יום פתוח מעודכן", "registration_method": "whatsapp"},
            headers=auth_header(host),
        )
        assert r.status_code == 200, r.text
        # an actual switch to whatsapp is still refused for a landline
        r = client.put(
            f"/events/{ev.id}",
            json={"registration_method": "phone"},
            headers=auth_header(host),
        )
        assert r.status_code == 200
        r = client.put(
            f"/events/{ev.id}",
            json={"registration_method": "whatsapp"},
            headers=auth_header(host),
        )
        assert r.status_code == 422

    def test_experience_link_over_500_chars_is_422_not_500(self, client, db):
        host = _owner(db)
        ex = _experience(db, host)
        r = client.put(
            f"/experiences/{ex.id}",
            json={
                "registration_method": "external_url",
                "registration_url": "https://example.com/" + "a" * 500,
            },
            headers=auth_header(host),
        )
        assert r.status_code == 422


# ---------- purge ----------


class TestPurge:
    def test_signups_go_30_days_after_the_date(self, db):
        owner = _owner(db)
        today = israel_today()
        old = _event(db, owner, event_date=today - timedelta(days=31))
        edge = _event(db, owner, event_date=today - timedelta(days=30))
        ex_old = _experience(db, owner, event_date=today - timedelta(days=40))
        for item_kw in (
            {"event_id": old.id},
            {"event_id": edge.id},
            {"experience_id": ex_old.id},
        ):
            db.add(
                Registration(
                    name="דנה",
                    phone="0527654321",
                    email="d@example.com",
                    cancel_token=str(item_kw),
                    **item_kw,
                )
            )
        db.commit()

        result = run_purge(db, today=today)

        assert result.registrations_deleted == 2
        left = db.query(Registration).all()
        assert [r.event_id for r in left] == [edge.id]


# ---------- MEH-2768: the public page dials the business ----------


def test_event_out_carries_the_business_phone_for_the_cta(client, db):
    """The event page's WhatsApp / phone CTA (and «או שאלה למארחת») needs the
    business number; EventOut had none, so the page could only offer a
    recipient-less link."""
    owner = _owner(db, phone=MOBILE)
    ev = _event(db, owner, registration_method="whatsapp")
    r = client.get(f"/events/{ev.id}")
    assert r.status_code == 200, r.text
    assert r.json()["producer_phone"] == MOBILE
    listed = {e["id"]: e for e in client.get("/events").json()}
    assert listed[str(ev.id)]["producer_phone"] == MOBILE
