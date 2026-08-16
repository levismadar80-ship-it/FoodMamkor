"""MEH-1815: the producer-collision duplicate-attempt email.

The collision branch of POST /auth/register/producer performs no DB write —
the Producer, its categories and its delivery areas are all discarded — while
returning the same RegisterAck bytes as a success (MEH-328 anti-enumeration).
The consumer copy said only "you already have an account", so the owner had no
way to learn her business was never registered. This module pins the producer
variant's copy and, critically, pins that the consumer variant did NOT change.

These assert BEHAVIOUR (what lands in the sent email), not that a particular
edit was applied — ADR-032 §3.6. A no-op "fix" cannot pass them.
"""

import pytest

from app.services import auth_emails


@pytest.fixture
def sent(monkeypatch):
    """Capture (to, subject, body) instead of hitting Resend."""
    captured = {}

    def _fake_send_email(to, subject, body, html=None):
        captured.update(to=to, subject=subject, body=body, html=html)

    monkeypatch.setattr(auth_emails, "send_email", _fake_send_email)
    return captured


class TestProducerVariant:
    def test_password_producer_states_details_not_saved(self, sent):
        auth_emails.send_duplicate_attempt_email(
            "dana@example.com", "דנה", "password", flow="producer"
        )
        assert sent["to"] == "dana@example.com"
        assert sent["subject"] == "ניסיון רישום עסק במהמקור — יש לך כבר חשבון"
        body = sent["body"]
        # The whole point of the ticket: say the details were NOT saved.
        assert "פרטי העסק שמולאו בטופס לא נשמרו" in body
        # And give the exact next step, not a bare login link.
        assert "היכנסי לחשבון ומלאי את הטופס" in body
        assert "/login?redirect=/register/producer" in body
        assert "את כבר רשומה אצלנו עם סיסמה" in body
        assert "סיסמתך לא נחשפה ולא דרושה פעולה" in body

    @pytest.mark.parametrize(
        "provider,label",
        [("google", "Google"), ("apple", "Apple")],
    )
    def test_oauth_producer_swaps_identity_line_only(self, sent, provider, label):
        auth_emails.send_duplicate_attempt_email(
            "galya@example.com", "גליה", provider, flow="producer"
        )
        body = sent["body"]
        assert f"את כבר רשומה אצלנו דרך {label}" in body
        # Same body as the password variant apart from the identity line
        # and the closing reassurance.
        assert "פרטי העסק שמולאו בטופס לא נשמרו" in body
        assert "/login?redirect=/register/producer" in body
        assert "חשבונך לא נפגע ולא דרושה פעולה" in body
        # The password-specific reassurance must NOT leak into the OAuth copy.
        assert "סיסמתך לא נחשפה" not in body

    def test_producer_subject_differs_from_consumer(self, sent):
        auth_emails.send_duplicate_attempt_email(
            "x@example.com", "נועה", "password", flow="producer"
        )
        producer_subject = sent["subject"]
        auth_emails.send_duplicate_attempt_email(
            "x@example.com", "נועה", "password"
        )
        assert sent["subject"] != producer_subject


class TestConsumerVariantUnchanged:
    """MEH-328 regression guard. `flow` defaults to "consumer", so every
    pre-existing call site keeps its exact copy. If this class goes red, a
    MEH-1815 edit leaked into the consumer path — which is out of scope."""

    def test_default_flow_is_consumer_copy(self, sent):
        auth_emails.send_duplicate_attempt_email(
            "noa@example.com", "נועה", "password"
        )
        assert sent["subject"] == "ניסיון רישום במהמקור — את כבר רשומה"
        body = sent["body"]
        assert "מישהו ניסה להירשם למהמקור עם הכתובת שלך" in body
        assert "את כבר רשומה אצלנו עם סיסמה — אם זו את, היכנסי כאן" in body
        # The consumer flow must never mention a business at all.
        assert "עסק" not in body
        assert "redirect=/register/producer" not in body

    def test_explicit_consumer_flow_matches_default(self, sent):
        auth_emails.send_duplicate_attempt_email(
            "noa@example.com", "נועה", "google", flow="consumer"
        )
        default_body = sent["body"]
        auth_emails.send_duplicate_attempt_email(
            "noa@example.com", "נועה", "google"
        )
        assert sent["body"] == default_body
