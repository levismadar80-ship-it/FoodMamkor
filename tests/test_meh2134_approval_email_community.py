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
          MEH-2151 (2026-08-21) — the body gained a `slug` argument and two
          link blocks ABOVE the community block, so every full-string
          assertion below was re-derived from the new layout. What MEH-2134
          owns is unchanged and still asserted verbatim: the community
          paragraph's text, the founder signature, and the invite-absent
          degradation. Only this file's copy of the SURROUNDING body moved.
          It is updated here rather than in a new file because a byte-exact
          expectation is a description of one layout — two files each holding
          a stale half is the drift a single owner exists to prevent.

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

# MEH-2151: the body now interpolates two absolute links. Both are built from
# `settings.frontend_url`, so the expectations below read it rather than
# hardcoding a host — otherwise these tests would assert the dev default and go
# red the moment anything set FRONTEND_URL.
SLUG = "maafiat-shaked"
PAGE_URL = f"{settings.frontend_url}/p/{SLUG}"
DASHBOARD_URL = f"{settings.frontend_url}/producer/dashboard"

# The two MEH-2151 link blocks, in their shipped order. Spelled out here once
# so each full-string expectation below stays readable and the three states
# differ only in what they omit.
_LINKS = (
    "\n"
    "ככה העמוד שלך נראה ללקוחות:\n"
    f"{PAGE_URL}\n"
    "\n"
    "לעדכון פרטים, תמונות ומוצרים — לוח הבקרה:\n"
    f"{DASHBOARD_URL}\n"
)

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

    assert _producer_approved_body("מאפיית שקד", SLUG) == (
        "היי,\n"
        "\n"
        'העסק שלך "מאפיית שקד" אושר במהמקור! '
        "הפרופיל שלך כעת גלוי לכל המשתמשים באתר.\n"
        f"{_LINKS}"
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

    body = _producer_approved_body("מאפיית שקד", SLUG)

    assert body == (
        "היי,\n"
        "\n"
        'העסק שלך "מאפיית שקד" אושר במהמקור! '
        "הפרופיל שלך כעת גלוי לכל המשתמשים באתר.\n"
        f"{_LINKS}"
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


def test_whitespace_only_url_is_treated_as_unset(invite_url):
    """A spaces-only Railway value must degrade like an empty one.

    `"  "` is truthy, so an unstripped read would print the paragraph above a
    blank line — the dangling label the empty case is written to prevent,
    reached by the one input nobody sets deliberately. Asserted as full-string
    equality against the empty-variable body so the two states cannot drift.
    """
    invite_url("   ")
    spaces = _producer_approved_body("מאפיית שקד", SLUG)

    invite_url("")
    empty = _producer_approved_body("מאפיית שקד", SLUG)

    assert spaces == empty
    assert "וואטסאפ" not in spaces
    assert "\n\n\n" not in spaces


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


# The four tracked files MEH-2134 owns. The community invite can only be
# leaked by being written into one of them, so this is the corpus the gate
# scans — see the docstring below for why it is not the whole repo.
#
# `.env.example` joined the set when the variable was documented there for the
# Env-drift gate. It is the highest-risk member: it is the one file whose whole
# purpose is to name this variable, so it is where a future hand is most likely
# to "helpfully" paste the real link.
_OWNED_FILES = (
    ".env.example",
    "backend/app/config.py",
    "backend/app/routers/admin.py",
    "tests/test_meh2134_approval_email_community.py",
)

# `.env.example` is a short template, not a source file, so it cannot clear the
# same non-triviality floor as the others.
_MIN_BYTES = {".env.example": 100}
_DEFAULT_MIN_BYTES = 500


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
        floor = _MIN_BYTES.get(rel, _DEFAULT_MIN_BYTES)
        assert len(text) > floor, (
            f"{rel} is missing or truncated; its leak scan is void."
        )
        assert needle not in text, (
            f"WhatsApp invite link committed to a public repo in {rel}. "
            "The URL belongs in WHATSAPP_COMMUNITY_INVITE_URL on Railway, "
            "never in a tracked file."
        )

    # The default must stay empty: a populated default IS the leak, even
    # without the literal host string above (a shortened or proxied link).
    assert type(settings).model_fields["whatsapp_community_invite_url"].default == ""


def _invite_declaration_lines(text: str) -> list[str]:
    """Every `WHATSAPP_COMMUNITY_INVITE_URL=` declaration line in an env file.

    Extracted so the assertion below can be exercised against inputs whose
    answer is known, without writing a fake link into the real `.env.example`
    (it is a tracked file in a public repo — the exact thing this guards).
    The self-test and the real-file test call THIS function, never a copy.
    """
    return [
        line
        for line in text.splitlines()
        if line.strip().startswith("WHATSAPP_COMMUNITY_INVITE_URL=")
    ]


def test_invite_declaration_parser_discriminates():
    """Self-test: run the classifier FIRST, on cases whose answers are known.

    If it cannot tell a clean declaration from a leaked one, nothing it reports
    about the real file afterwards is worth reading.
    """
    clean = "FOO=1\nWHATSAPP_COMMUNITY_INVITE_URL=\nBAR=2"
    leaked = "FOO=1\nWHATSAPP_COMMUNITY_INVITE_URL=https://chat.example/AbCd\nBAR=2"
    duplicated = "WHATSAPP_COMMUNITY_INVITE_URL=\nWHATSAPP_COMMUNITY_INVITE_URL="
    absent = "FOO=1\n# WHATSAPP_COMMUNITY_INVITE_URL is documented elsewhere\nBAR=2"

    assert _invite_declaration_lines(clean) == ["WHATSAPP_COMMUNITY_INVITE_URL="]
    assert _invite_declaration_lines(leaked) != ["WHATSAPP_COMMUNITY_INVITE_URL="]
    assert len(_invite_declaration_lines(duplicated)) == 2
    # A commented-out mention is not a declaration — it must not satisfy the
    # Env-drift half of the real assertion.
    assert _invite_declaration_lines(absent) == []


def test_env_example_documents_the_variable_with_an_empty_value():
    """`.env.example` must NAME the variable and must never carry a value.

    Two properties, and the second is the one with teeth. Naming it is what the
    Env-drift gate wants. Leaving it empty is the leak gate for the one file
    whose entire job is to advertise this variable to whoever sets up the app —
    which makes it the likeliest place for a future hand to paste the real link
    "so it's documented". A host-string scan would not catch a shortened or
    proxied invite; requiring the value to be empty catches every form.
    """
    text = (REPO_ROOT / ".env.example").read_text(encoding="utf-8")

    matches = _invite_declaration_lines(text)

    # Exactly one: a second copy is its own bug (the Env-drift gate would still
    # pass, and whichever line lost the race would silently stop mattering).
    assert len(matches) == 1, f"expected exactly 1 declaration, found {matches}"
    assert matches[0].strip() == "WHATSAPP_COMMUNITY_INVITE_URL=", (
        "the invite URL must never be committed — the repo is public. "
        f"Found: {matches[0]!r}"
    )
