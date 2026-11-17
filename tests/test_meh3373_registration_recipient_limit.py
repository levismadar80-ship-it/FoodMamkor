# ruff: noqa: F811 — `sent` is a pytest fixture imported from the MEH-2763 suite and requested by name.
"""MEH-3373 — a sign-up without an account emails whatever address was typed.
The per-IP limit (10/hour) does not stop one address being mailed from many
IPs, so the recipient gets its own ceiling: 3 an hour and 10 a day, shared by
the event route and the experience route (rulings 17/11 §א5, option ב).

Every request comes from its own IP (X-Real-IP behind TRUSTED_PROXY), so the
per-IP bucket cannot be what answers 429.

The second half pins what the confirmation carries: nothing the sender typed.
"""

import json
from types import SimpleNamespace

import pytest

from app.rate_limit import email_from_body
from app.services import registration_emails
from test_meh2763_registrations import _event, _experience, _owner, _signup, sent  # noqa: F401

VICTIM = "victim@example.com"


@pytest.fixture
def rotating_ip(monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY", "1")
    monkeypatch.delenv("EDGE_PROXY_SECRET", raising=False)
    counter = iter(range(1, 250))
    return lambda: {"X-Real-IP": f"203.0.113.{next(counter)}"}


def _key(email):
    """The bucket key for a body carrying this address, via the public key
    function (it exists before and after the fix)."""
    body = json.dumps({"email": email}).encode()
    return email_from_body(SimpleNamespace(_body=body, url=SimpleNamespace(path="/t")))


def _post(client, headers, path, email=VICTIM, **kw):
    return client.post(path, json=_signup(email=email, **kw), headers=headers())


def _events(db, n):
    owner = _owner(db)
    return [_event(db, owner, title=f"יום פתוח {i}") for i in range(n)]


def test_control_many_recipients_many_ips_are_not_limited(
    client, db, sent, rotating_ip
):
    """Control: 12 sign-ups to one event, 12 addresses, 12 IPs. If this is
    limited, the rotation is broken and the tests below prove nothing."""
    (ev,) = _events(db, 1)
    statuses = [
        _post(
            client,
            rotating_ip,
            f"/events/{ev.id}/registrations",
            email=f"p{i}@example.com",
        ).status_code
        for i in range(12)
    ]
    assert statuses == [201] * 12


def test_fourth_signup_in_an_hour_to_one_address_is_429(client, db, sent, rotating_ip):
    events = _events(db, 4)
    statuses = [
        _post(client, rotating_ip, f"/events/{ev.id}/registrations").status_code
        for ev in events
    ]
    assert statuses == [201, 201, 201, 429]
    assert [to for kind, to, _ in sent if kind == "visitor"] == [VICTIM] * 3


def test_events_and_experiences_share_the_recipient_bucket(
    client, db, sent, rotating_ip
):
    owner = _owner(db)
    ev1, ev2 = _event(db, owner, title="א"), _event(db, owner, title="ב")
    ex1, ex2 = (
        _experience(db, owner, title="סדנה א"),
        _experience(db, owner, title="סדנה ב"),
    )
    statuses = [
        _post(client, rotating_ip, f"/events/{ev1.id}/registrations").status_code,
        _post(client, rotating_ip, f"/experiences/{ex1.id}/registrations").status_code,
        _post(client, rotating_ip, f"/events/{ev2.id}/registrations").status_code,
        _post(client, rotating_ip, f"/experiences/{ex2.id}/registrations").status_code,
    ]
    assert statuses == [201, 201, 201, 429]


def test_case_of_the_address_does_not_open_a_new_bucket(client, db, sent, rotating_ip):
    events = _events(db, 4)
    variants = [
        VICTIM,
        "Victim@example.com",
        "VICTIM@EXAMPLE.COM",
        " victim@example.com ",
    ]
    statuses = [
        _post(
            client, rotating_ip, f"/events/{ev.id}/registrations", email=variants[i]
        ).status_code
        for i, ev in enumerate(events)
    ]
    assert statuses[3] == 429


@pytest.mark.parametrize(
    "spelling",
    [
        "A <victim@example.com>",  # display name
        "victim@ｅxample.com",  # fullwidth letter in the domain
        "victim@example。com",  # ideographic full stop
    ],
)
def test_another_spelling_of_the_same_address_is_the_same_bucket(spelling):
    """Every spelling pydantic resolves to one address must be one key.
    Asserted on the public key function (it exists before and after the fix)
    with the REAL parser deciding what counts as the same address."""
    from pydantic import validate_email

    try:
        resolved = validate_email(spelling)[1]
    except Exception:
        pytest.skip("this pydantic rejects the spelling, so it never reaches a handler")
    assert resolved.lower() == "victim@example.com", (
        "control: the spelling is the same address"
    )
    assert _key(spelling) == _key("victim@example.com")


@pytest.mark.parametrize(
    "spelling",
    [
        "victim+1@gmail.com",
        "victim+promo@gmail.com",
        "v.i.c.tim@gmail.com",
        "victim@googlemail.com",
    ],
)
def test_plus_tags_and_gmail_dots_are_one_mailbox(spelling):
    assert _key(spelling) == _key("victim@gmail.com")


def test_one_mailbox_merging_stops_at_what_is_one_inbox():
    """Controls: dots matter outside Gmail, and another person is another key."""
    assert _key("a.b@example.com") != _key("ab@example.com")
    assert _key("a+x@example.com") == _key("a@example.com")
    assert _key("victim@gmail.com") != _key("victim2@gmail.com")
    assert _key("+tag@example.com") == "+tag@example.com"  # never an empty local part


def test_tenth_a_day_passes_and_the_eleventh_is_429(client, db, sent, rotating_ip):
    """The hourly window is cleared between rounds (standing in for an hour
    passing) by expiring only the hourly keys; the daily counter keeps counting."""
    from app.rate_limit import limiter

    events = _events(db, 11)
    statuses = []
    for i, ev in enumerate(events):
        if i and i % 3 == 0:
            _expire_hourly(limiter)
        statuses.append(
            _post(client, rotating_ip, f"/events/{ev.id}/registrations").status_code
        )
    assert statuses[:10] == [201] * 10
    assert statuses[10] == 429


def _expire_hourly(limiter):
    storage = limiter._storage
    hourly = [k for k in list(storage.storage) if k.endswith("/3/1/hour")]
    assert hourly, "no hourly recipient key found — the key format changed"
    for k in hourly:
        storage.clear(k)


def test_another_recipient_is_not_affected(client, db, sent, rotating_ip):
    events = _events(db, 4)
    for ev in events:
        _post(client, rotating_ip, f"/events/{ev.id}/registrations")
    resp = _post(
        client,
        rotating_ip,
        f"/events/{events[0].id}/registrations",
        email="other@example.com",
    )
    assert resp.status_code == 201


# ---------- what the confirmation carries ----------


def test_visitor_mail_has_no_field_for_sender_text():
    """The confirmation goes to an address nobody verified. This pins the
    dataclass: a new field has to answer whether the SENDER typed it. (Title,
    place and host name are the item owner's text.) The rendered mail is
    checked by the test below."""
    fields = set(registration_emails.VisitorEmail.__dataclass_fields__)
    expected = {
        "title",
        "date_text",
        "time_text",
        "place",
        "host_name",
        "item_url",
        "cancel_url",
    }
    assert fields == expected, (
        "a new field on the visitor email: did the SENDER type it? (MEH-3373)"
    )


def test_signup_name_and_phone_do_not_reach_the_visitor_mail(
    client, db, monkeypatch, rotating_ip
):
    mails = []
    monkeypatch.setattr(
        registration_emails,
        "send_email",
        lambda to, subject, body, html=None, test_cause=False: mails.append(
            (to, subject, body, html or "")
        ),
    )
    owner = _owner(db, email="owner-x@example.com")
    ev = _event(db, owner)
    marker = "קנו עכשיו בזול"
    resp = _post(
        client,
        rotating_ip,
        f"/events/{ev.id}/registrations",
        name=marker,
        phone="052-7654321",
    )
    assert resp.status_code == 201
    to_victim = [m for m in mails if m[0] == VICTIM]
    assert len(to_victim) == 1, mails
    _, subject, body, html = to_victim[0]
    for part in (subject, body, html):
        assert marker not in part
        assert "7654321" not in part
    # Control: the same marker does reach the owner's mail, so the search works.
    to_owner = [m for m in mails if m[0] == "owner-x@example.com"]
    assert to_owner and marker in to_owner[0][2]
