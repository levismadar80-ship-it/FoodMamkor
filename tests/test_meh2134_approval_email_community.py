"""
Module:   test_meh2134_approval_email_community
Purpose:  Lock the MEH-2134 producer-approval email body — founder signature,
          and a WhatsApp-community block that appears only when
          `settings.whatsapp_community_invite_url` is set.
Does NOT: exercise the approval endpoint or the WhatsApp template
          (`notify_producer_approved` is untouched by MEH-2134); these are
          pure body-rendering assertions on the helper.
Related:  backend/app/routers/admin.py (_producer_approved_body),
          backend/app/config.py (whatsapp_community_invite_url).
History:  MEH-2134 (creation, 2026-08-20).

The full body is asserted as ONE exact string in both states rather than by
substring presence. A presence-only assertion cannot see a dangling label or a
stray blank line — which is precisely the failure the empty-variable case
exists to rule out (.claude/rules/testing.md, "presence-only" family).
"""

from pathlib import Path

import pytest

from app.config import settings
from app.routers.admin import (
    _producer_approved_body,
    _producer_changes_requested_body,
    _producer_rejected_body,
)
from app.services.onboarding_followup import SITE_DOMAIN

# NOT a real invite. The repo is public, so the live
# WHATSAPP_COMMUNITY_INVITE_URL never enters a tracked file — including this
# one. `.invalid` is reserved by RFC 2606 and can never resolve.
FAKE_INVITE_URL = "https://example.invalid/meh2134-fake-invite-not-a-real-link"

REPO_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def invite_url(monkeypatch):
    """Point the setting at FAKE_INVITE_URL for the duration of one test."""

    def _set(value: str) -> str:
        monkeypatch.setattr(settings, "whatsapp_community_invite_url", value)
        return value

    return _set


def test_body_carries_community_block_and_link_when_url_is_set(invite_url):
    invite_url(FAKE_INVITE_URL)

    assert _producer_approved_body("מאפיית שקד") == (
        "היי,\n"
        "\n"
        'העסק שלך "מאפיית שקד" אושר במהמקור! '
        "הפרופיל שלך כעת גלוי לכל המשתמשים באתר.\n"
        "\n"
        "פתחנו קבוצת עדכונים בוואטסאפ לבתי עסק שאושרו במהמקור — שווקים ואירועים "
        "לפני כולם, ומה חדש באתר. פעם-פעמיים בחודש, רק אנחנו כותבות שם, ואפשר "
        "לצאת בכל רגע:\n"
        f"{FAKE_INVITE_URL}\n"
        "\n"
        "ספיר שנפ\n"
        "מייסדת | מהמקור\n"
        f"{SITE_DOMAIN}"
    )


def test_body_omits_the_whole_block_when_url_is_empty(invite_url):
    """Phase C has not run yet — the block must vanish without a trace.

    No dangling label, no double blank line, and the mail still closes on the
    founder signature. This is the state that ships on merge.
    """
    invite_url("")

    body = _producer_approved_body("מאפיית שקד")

    assert body == (
        "היי,\n"
        "\n"
        'העסק שלך "מאפיית שקד" אושר במהמקור! '
        "הפרופיל שלך כעת גלוי לכל המשתמשים באתר.\n"
        "\n"
        "ספיר שנפ\n"
        "מייסדת | מהמקור\n"
        f"{SITE_DOMAIN}"
    )
    # Named separately from the equality above so a failure says WHICH
    # property broke, rather than dumping two near-identical Hebrew blobs.
    assert "וואטסאפ" not in body
    assert "\n\n\n" not in body
    assert body.endswith(f"ספיר שנפ\nמייסדת | מהמקור\n{SITE_DOMAIN}")
    assert "צוות מהמקור" not in body


def test_sibling_bodies_never_carry_the_invite(invite_url):
    """The invite belongs to the approval moment only.

    Rejection and changes-requested are byte-identical to their pre-MEH-2134
    state, including the institutional `צוות מהמקור` sign-off that the
    approval body deliberately drops.
    """
    invite_url(FAKE_INVITE_URL)

    rejected = _producer_rejected_body("מאפיית שקד", "חסר רישיון")
    changes = _producer_changes_requested_body(
        "מאפיית שקד", "חסרה תמונה", "https://example.invalid/dashboard"
    )

    for body in (rejected, changes):
        assert FAKE_INVITE_URL not in body
        assert "וואטסאפ" not in body
        assert body.endswith("בברכה,\nצוות מהמקור")


# The three tracked files MEH-2134 owns. The community invite can only be
# leaked by being written into one of them, so this is the corpus the gate
# scans — see the docstring below for why it is not the whole repo.
_OWNED_FILES = (
    "backend/app/config.py",
    "backend/app/routers/admin.py",
    "tests/test_meh2134_approval_email_community.py",
)


def test_community_invite_is_never_committed_to_the_files_this_ticket_owns():
    """Leak gate (MEH-2134 verification step 4), enforced rather than grepped once.

    The repo has been public since June 2026: an invite link in a tracked file
    is a link anyone can use to join the community without ever being approved
    as a business. A one-off grep protects the PR that ran it; a test protects
    every PR after it.

    SCOPE CORRECTION — the ticket specified a repo-wide grep for the WhatsApp
    group-invite host, expecting 0. That expectation is refuted on clean
    `origin/staging`, where the string appears in 15 tracked files. Every one
    of them belongs to MEH-1537's `whatsapp_group` feature — the link a
    PRODUCER publishes for her own customers — not to Mehamakor's community:
    `backend/app/schemas/schemas.py:242` is the host check itself, `:243` its
    Hebrew error message, plus placeholders (`frontend/messages/{he,en}.json`),
    fixtures, and docs. A repo-wide zero would require deleting a shipped
    validator, so the whole-repo form could never have passed and is not the
    gate that was wanted.

    What IS wanted is that the invite never lands in the surface this ticket
    touches, which is what this asserts. The setting default stays empty
    (`config.py`), the body reads it at runtime (`admin.py`), and the tests use
    `FAKE_INVITE_URL`.
    """
    needle = "chat." + "whatsapp.com"  # split so this file is not its own hit

    for rel in _OWNED_FILES:
        path = REPO_ROOT / rel
        text = path.read_text(encoding="utf-8")
        # Control: a renamed or moved file would make the check below
        # vacuously green — the reassuring answer from a probe aimed at
        # nothing. Require the file to exist and be non-trivial first.
        assert len(text) > 500, f"{rel} is missing or truncated; its leak scan is void."
        assert needle not in text, (
            f"WhatsApp invite link committed to a public repo in {rel}. "
            "The URL belongs in WHATSAPP_COMMUNITY_INVITE_URL on Railway, "
            "never in a tracked file."
        )

    # The default must stay empty: a populated default IS the leak, even
    # without the literal host string above (a shortened or proxied link).
    assert type(settings).model_fields["whatsapp_community_invite_url"].default == ""
