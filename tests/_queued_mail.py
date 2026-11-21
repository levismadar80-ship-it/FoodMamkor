"""MEH-3535: the sign-up emails are queued (registrations._queue_mail →
email_outbox) instead of sent through BackgroundTasks. The older tests
capture them by patching `send_<kind>` on the router module; this routes each
queued email to that patched sender, so those captures keep asserting which
email the router chose, for whom and with what payload. The queue itself is
covered by tests/test_meh3535_email_outbox.py."""

import app.routers.registrations as r

SENDERS = (
    "send_visitor_confirmation",
    "send_owner_new_registration",
    "send_waitlist_confirmation",
)


def route_queued_mail_to_senders(monkeypatch) -> None:
    for name in SENDERS:
        if not hasattr(r, name):
            monkeypatch.setattr(r, name, None, raising=False)
    monkeypatch.setattr(
        r,
        "_queue_mail",
        lambda db, kind, to, m, test_cause=False: getattr(r, f"send_{kind}")(
            to, m, test_cause=test_cause
        ),
    )
