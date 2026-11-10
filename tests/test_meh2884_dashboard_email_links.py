"""MEH-2884 (dashboard placement audit items 10 + 11) — the owner emails link
to the tool that holds the thing the email is about, not the dashboard home.

- New registration / cancellation for an EVENT → /producer/dashboard/events
- ... for an EXPERIENCE → /producer/dashboard/experiences
- Kashrut certificate rejected → /producer/dashboard/edit#kashrut (the anchor
  resolves to the edit tab's "trust" group, lib/dashboard-edit-anchors.js)
"""

from app.models import Registration
from app.services import content_notifications
from test_meh2763_registrations import (  # noqa: F401 — `sent` is a fixture
    _event,
    _experience,
    _owner,
    _signup,
    sent,
)


def _manage_urls(calls, kind):
    return [m.manage_url for k, _, m in calls if k == kind]


def test_event_signup_email_links_to_the_events_tab(client, db, sent):  # noqa: F811 — the imported fixture
    ev = _event(db, _owner(db, email="o-ev@example.com"), max_participants=5)
    assert (
        client.post(f"/events/{ev.id}/registrations", json=_signup()).status_code == 201
    )
    urls = _manage_urls(sent, "owner_new")
    assert len(urls) == 1, "no owner email queued — nothing measured"
    assert urls[0].endswith("/producer/dashboard/events")


def test_experience_signup_email_links_to_the_experiences_tab(client, db, sent):  # noqa: F811 — the imported fixture
    ex = _experience(db, _owner(db, email="o-ex@example.com"), max_participants=5)
    assert (
        client.post(f"/experiences/{ex.id}/registrations", json=_signup()).status_code
        == 201
    )
    urls = _manage_urls(sent, "owner_new")
    assert len(urls) == 1, "no owner email queued — nothing measured"
    assert urls[0].endswith("/producer/dashboard/experiences")


def test_cancel_email_links_to_the_tab_of_its_kind(client, db, sent):  # noqa: F811 — the imported fixture
    ev = _event(db, _owner(db, email="o-c1@example.com"), max_participants=5)
    ex = _experience(db, _owner(db, email="o-c2@example.com"), max_participants=5)
    client.post(f"/events/{ev.id}/registrations", json=_signup(email="a@example.com"))
    client.post(
        f"/experiences/{ex.id}/registrations", json=_signup(email="b@example.com")
    )
    tokens = {
        ("event" if r.event_id else "experience"): r.cancel_token
        for r in db.query(Registration).all()
    }
    assert set(tokens) == {"event", "experience"}
    for kind in ("event", "experience"):
        assert client.post(f"/registrations/{tokens[kind]}/cancel").status_code == 200

    urls = _manage_urls(sent, "owner_cancel")
    assert len(urls) == 2, f"expected 2 owner cancellation emails, got {urls}"
    assert sorted(u.rsplit("/", 1)[-1] for u in urls) == ["events", "experiences"]


def test_kashrut_rejected_email_opens_the_kashrut_card(monkeypatch):
    bodies = []
    monkeypatch.setattr(
        content_notifications,
        "send_email",
        lambda to, subject, body, *a, **k: bodies.append(body),
    )
    content_notifications.notify_kashrut_rejected("o@example.com", "מאפיית הכפר", None)
    assert len(bodies) == 1, "notify_kashrut_rejected sent nothing"
    assert "/producer/dashboard/edit#kashrut" in bodies[0]
