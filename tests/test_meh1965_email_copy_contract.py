"""
Module:   test_meh1965_email_copy_contract
Purpose:  Contract over the copy of every user-facing transactional email —
          absolute links, no masculine address to the reader, RTL markup on
          every HTML part, and a real plain-text fallback beside it.
Touches:  Nothing. Every sender is rendered with `send_email` monkeypatched,
          so no Resend call and no DB row is involved.
Does NOT: assert delivery, triggers, or which email fires when — that is
          MEH-1806's surface (`tests/test_meh1806_welcome_single_owner.py`).
          It also does not police ADMIN-facing bodies (auth_notifications.py):
          those go to settings.admin_email, are not a brand touchpoint, and
          the plural/impersonal register there is deliberate.

          HOW A GAP HAPPENED ONCE, because the method matters more than the
          miss: the corpus was originally assembled from
          `grep -rn "send_email("`, which silently omitted the three
          PRODUCER-facing bodies in `admin.py` — they call
          `_send_notification_email(`, a wrapper whose name does not contain
          the substring `send_email(`, while
          `experience_notifications`/`group_buy_notifications` wrap it as
          `_send_email`, which does. The probe reported a completely
          plausible number and looked like a full inventory. Found by the
          different-model adversarial reviewer, not by the author; closed in
          MEH-2027, which extracted those three into the body builders the
          corpus now renders.

          The general lesson, kept because the next corpus addition will face
          it: an inventory of call sites is not built from a grep on one
          function name. Chase the wrappers (`grep -rn "def .*email"`, then
          grep each name found) or work from the call tree.

          CLOSED by MEH-2041: the two senders this paragraph used to list as
          STILL NOT COVERED — the newsletter welcome (`routers/marketing.py`,
          which carries an HTML part) and the pending-producer nudge
          (`services/pending_nudge.py`) — are in `_CORPUS` now. Both called
          `send_email(` directly, so unlike the admin.py three they were
          visible to the original grep: the miss happened when the corpus was
          assembled, not when it was searched, which is why the MEH-2027
          wrapper-chasing fix did not close it. Two different causes, two
          different fixes; the lesson above is still the one that generalises.

          "Every" above therefore still means "every sender in `_CORPUS`" —
          not because a gap is known, but because that is the only claim this
          file can make about itself. The next sender added anywhere in the
          codebase is outside it until someone adds the entry, and nothing
          here detects that.
Related:  docs/BRAND.md §4 (voice), docs/decisions/ADR-024-voice-surface-function.md
History:  MEH-1965 (creation) — the transactional-email audit.
          MEH-2027 — the three admin.py producer-facing bodies joined the
          corpus once they were extracted into pure module-level builders.
          MEH-2151 — the producer-approval body gained CTA links and an HTML
          twin, so it is the first admin.py entry rendered with an HTML part
          and the first entered twice to cover both of its argument states.

WHY THIS IS RENDERED RATHER THAN GREPPED
----------------------------------------
An earlier pass over these modules used a regex across the source. It found
4 real issues and 13 false positives (adjectives agreeing with masculine
nouns: "החשבון שלך בטוח", "מדריך מלא", "שם זה שמור"). A static scan cannot
tell an imperative from an adjective, so it cannot be a gate. Rendering the
actual body and asserting over the delivered string can be.

WHAT THE VOICE ASSERTION DOES *NOT* CLAIM
-----------------------------------------
It does not enforce feminine-vs-plural. docs/BRAND.md §4 makes that a
SURFACE-FUNCTION choice, not a global one — functional UI strings are plural
("גלו" is BRAND.md's own example of a *correct* button) while brand-voice
prose may be feminine. A guard that forced one of them would fail correct
copy. What BRAND.md forbids unconditionally, on every surface, is *pure
masculine address to the reader* — and that is the only thing asserted here.
"""

import re

import pytest

from app.config import settings
from app.routers import admin, marketing
from app.services import auth_emails, experience_notifications
from app.services import group_buy_notifications as gb
from app.services import pending_nudge

# --- the corpus -------------------------------------------------------------
#
# (label, module-holding-the-send_email-symbol, callable)
#
# The module is named explicitly because each of these does
# `from app.services.email import send_email` at import time, so the symbol
# has to be patched in the CALLER's namespace — patching app.services.email
# would not be seen by any of them.

_CORPUS = [
    ("reset-password", auth_emails, lambda: auth_emails.send_reset_email(
        "her@example.com", "רות", "https://mehamakor.co.il/reset?token=t")),
    ("verify-email", auth_emails, lambda: auth_emails.send_verify_email(
        "her@example.com", "רות", "tok")),
    ("welcome-consumer", auth_emails, lambda: auth_emails.send_welcome_email(
        "her@example.com", "רות לוי", "consumer")),
    ("welcome-producer", auth_emails, lambda: auth_emails.send_welcome_email(
        "her@example.com", "רות לוי", "producer")),
    ("duplicate-consumer-password", auth_emails,
     lambda: auth_emails.send_duplicate_attempt_email(
         "her@example.com", "רות", "password", "consumer")),
    ("duplicate-consumer-google", auth_emails,
     lambda: auth_emails.send_duplicate_attempt_email(
         "her@example.com", "רות", "google", "consumer")),
    ("duplicate-producer-password", auth_emails,
     lambda: auth_emails.send_duplicate_attempt_email(
         "her@example.com", "רות", "password", "producer")),
    ("duplicate-producer-google", auth_emails,
     lambda: auth_emails.send_duplicate_attempt_email(
         "her@example.com", "רות", "google", "producer")),
    ("account-deleted", auth_emails, lambda: auth_emails.send_deletion_email(
        "her@example.com", "רות")),
    ("experience-approved", experience_notifications,
     lambda: experience_notifications.notify_host_approved(
         "her@example.com", "סדנת לחם", "exp-1")),
    ("experience-changes-requested", experience_notifications,
     lambda: experience_notifications.notify_host_changes_requested(
         "her@example.com", "סדנת לחם", "exp-1", "נא להוסיף תמונה")),
    ("experience-rejected", experience_notifications,
     lambda: experience_notifications.notify_host_rejected(
         "her@example.com", "סדנת לחם", "לא עומד בקריטריונים")),
    ("group-buy-funded-producer", gb, lambda: gb.notify_producer_funded(
        "her@example.com", "קמח מלא", 12, "gb-1")),
    ("group-buy-funded-participant", gb, lambda: gb.notify_participant_funded(
        "her@example.com", "קמח מלא", "מאפיית הדגן", "gb-1")),

    # MEH-2027 — the three admin -> producer bodies. They reach the corpus via
    # `admin._send_notification_email`, which calls the `send_email` symbol
    # imported into `app.routers.admin`, so the same patch-the-caller rule
    # above applies unchanged.
    #
    # The SUBJECT passed here is scaffolding, not the shipped subject line: the
    # contract asserts over the body parts only, and duplicating the handlers'
    # subject f-strings into this file would create a second owner for copy
    # with no gate keeping the two in step (workflow.md Smell #1).
    #
    # `rejected` is entered TWICE on purpose. The reason argument selects
    # between two different rendered bodies via `_rejection_reason_suffix`, and
    # a corpus carrying only the with-reason case would leave the empty-reason
    # body — the one an admin sends by clicking reject without typing anything
    # — unasserted while the file list said "rejected is covered".
    #
    # MEH-226 (14.08.2026) rewrote `_producer_rejected_body` to Sapir's
    # approved copy and relabelled the reason tail "סיבת הדחייה" → "הסיבה".
    # Both entries below render the NEW body with no edit here, which is the
    # design: the corpus calls the shipping function rather than duplicating
    # its strings, so approved-copy changes are covered the moment they land.
    # The two MEH-226-specific claims that this contract does NOT make — that
    # the retired resubmit promise stays out, and that the recovery line it
    # replaced is actually true — are held by
    # tests/test_meh226_rejection_reason.py.
    # MEH-2151 — the approval body gained a `slug` argument and an HTML twin,
    # so this entry now renders BOTH parts through the same wrapper the handler
    # uses. Entered TWICE, for the same reason `rejected` is: the slug selects
    # between two different rendered bodies (with and without the view-page
    # block), and a corpus carrying only the happy case would leave the
    # no-slug body — the one a producer without a minted slug receives —
    # unasserted while the file list said "approved is covered".
    ("producer-approved", admin, lambda: admin._send_notification_email(
        "her@example.com", "subject-not-asserted",
        admin._producer_approved_body("חוות הבר", "havat-habar"),
        html=admin._producer_approved_html("חוות הבר", "havat-habar"))),
    ("producer-approved-no-slug", admin, lambda: admin._send_notification_email(
        "her@example.com", "subject-not-asserted",
        admin._producer_approved_body("חוות הבר", None),
        html=admin._producer_approved_html("חוות הבר", None))),
    ("producer-rejected-with-reason", admin, lambda: admin._send_notification_email(
        "her@example.com", "subject-not-asserted",
        admin._producer_rejected_body("מאפיית הדגן", "חסר רישיון עסק"))),
    ("producer-rejected-no-reason", admin, lambda: admin._send_notification_email(
        "her@example.com", "subject-not-asserted",
        admin._producer_rejected_body("מאפיית הדגן", ""))),
    ("producer-changes-requested", admin, lambda: admin._send_notification_email(
        "her@example.com", "subject-not-asserted",
        admin._producer_changes_requested_body(
            "משק הזית", "נא להוסיף תמונה של הרישיון",
            f"{settings.frontend_url}/producer/dashboard"))),

    # MEH-2041 — the two senders the MEH-1965 docstring listed as STILL NOT
    # COVERED. Both were visible to the original grep (each calls `send_email(`
    # directly); the gap was in how the corpus was assembled, not in how it was
    # searched, which is why the MEH-2027 wrapper-chasing fix did not close it.
    #
    # newsletter-welcome is CONSUMER-facing and is the fourth sender in the
    # corpus that ships an HTML part, so it is entered in `_EXPECT_HTML` below
    # and the RTL + plain-text-fallback assertions run on it for real.
    # `_send_newsletter_welcome` mints a signed unsubscribe token, so this
    # renders the same absolute URL the subscriber clicks — the href assertion
    # is exercised against a real token URL, not a placeholder.
    ("newsletter-welcome", marketing,
     lambda: marketing._send_newsletter_welcome("her@example.com")),

    # pending-nudge is BUSINESS-OWNER-facing. Unlike every other entry its
    # module does not expose a function that both renders and sends: the send
    # lives inside `run_pending_nudge`, behind a DB query. So the corpus calls
    # the real builder and hands its output to the patched symbol with exactly
    # the arguments the production line uses (`send_email(user.email, subject,
    # body)`, pending_nudge.py:443) — the same shape the admin.py entries above
    # use, and the reason the body under assertion is the shipped one rather
    # than a copy.
    #
    # All three approved item lines are passed, so the assertions see the
    # longest body the sender can produce; `mark=1` because `_BODY` is shared
    # by all three day-marks and only the SUBJECT varies, and subjects are not
    # part of this contract (see the admin.py note above).
    ("pending-nudge", pending_nudge, lambda: pending_nudge.send_email(
        "her@example.com",
        *pending_nudge._build_email("רות", list(pending_nudge._ITEM_COPY.values()), 1))),
]


# Which senders are EXPECTED to ship an HTML part. This is an expectation, not
# a description — the RTL and fallback assertions below could have been written
# `if not html: skip`, but that is a guard consulting its own subject
# (.claude/rules/testing.md): delete the HTML body from a template and the RTL
# test would report *skipped*, which is the one condition it exists to catch.
# Declared here, that deletion is a red instead.
_EXPECT_HTML = {
    "reset-password",
    "verify-email",
    "welcome-consumer",
    "welcome-producer",
    # MEH-2151. Both slug states are listed: the HTML part is unconditional —
    # a missing slug drops the primary BUTTON, never the part itself — and
    # listing only the happy case would turn a regression that silently
    # dropped the whole HTML twin for slug-less producers into a green.
    "producer-approved",
    "producer-approved-no-slug",
    # MEH-2041. The newsletter welcome is the only CONSUMER-facing sender
    # outside auth_emails that ships an HTML twin, and listing it here is what
    # makes the RTL + fallback assertions RUN on it rather than return early —
    # the whole point of declaring the expectation instead of branching on
    # `if not html`.
    "newsletter-welcome",
}


@pytest.fixture
def rendered(monkeypatch):
    """Render every sender in the corpus, returning {label: (subject, text, html)}.

    `resend_api_key` is set because send_verify_email / send_welcome_email
    early-return before building a body when it is empty — an unset key would
    silently shrink the corpus, which the size control below would then catch.
    """
    monkeypatch.setattr(settings, "resend_api_key", "test-key", raising=False)
    out = {}
    for label, module, call in _CORPUS:
        captured = {}

        def _capture(to, subject, body, html=None, _c=captured):
            _c["subject"], _c["text"], _c["html"] = subject, body, html

        monkeypatch.setattr(module, "send_email", _capture)
        call()
        assert captured, f"{label}: sender did not call send_email at all"
        out[label] = (captured["subject"], captured["text"], captured["html"])
    return out


# --- controls ---------------------------------------------------------------
#
# ORDERS §3.0 / testing.md: a null result and a dead probe print the same
# thing. These run first and state plainly that the assertions below are void
# if they fail.


def test_control_corpus_is_fully_rendered(rendered):
    """Guards the one way the corpus can silently shrink: a DUPLICATE LABEL.

    `rendered` is a dict keyed by label, so two entries sharing a label collapse
    into one and the second silently replaces the first — every parametrised
    assertion below then runs one case short, with nothing anywhere reporting it.
    The count is DERIVED (`len(_CORPUS)`), never stated, so adding a case moves
    it automatically.

    It does NOT guard "the harness caught nothing" — the adversarial reviewer
    was right that that case cannot reach here, because the fixture's own
    `assert captured` fails during setup first. The original docstring claimed
    otherwise and was wrong; this is the failure mode that actually survives to
    this assertion. Proven by construction: duplicating a corpus label makes
    this test, and only this test, go red.
    """
    assert len(rendered) == len(_CORPUS)
    assert all(text.strip() for _, text, _ in rendered.values())


def test_control_corpus_actually_contains_links_and_html(rendered):
    """The link assertion is vacuous on a body with no URLs, and the RTL
    assertion is vacuous with no HTML part. Prove both paths are exercised."""
    with_links = [name for name, (_, t, h) in rendered.items()
                  if "://" in t or "://" in (h or "")]
    with_html = [name for name, (_, _, h) in rendered.items() if h]
    assert with_links, "no rendered body carried a URL — link check is vacuous"
    assert with_html, "no rendered body carried HTML — RTL check is vacuous"


# --- the contract -----------------------------------------------------------

_ABSOLUTE_URL = re.compile(r"https?://\S+")
_HTML_TAG = re.compile(r"<[^>]+>")
# Both quote styles. Single-quoted was a genuine blind spot: `_HTML_TAG` strips
# the whole tag including its attributes, so an `href='/about'` was invisible to
# the prose check AND to the href check at once. No current template uses single
# quotes, which is exactly why it would have gone unnoticed.
_HREF = re.compile(r"""href=["']([^"']*)["']""")
# A path segment that survives after every absolute URL is removed is, by
# definition, not attached to a host. `[a-z]` only: Hebrew slash forms
# ("PDF / תמונה") and dual-gender notation ("לקוח/ה") are not paths.
# `{1,}` rather than `{2,}` so a short locale prefix (`/he`, `/en`) cannot slip
# through — the repo routes under `[locale]`, so those are the likeliest future
# relative paths to appear in a body.
_ORPHAN_PATH = re.compile(r"/[a-z][a-z0-9-]{1,}")


def _visible(part: str) -> str:
    """Prose as the reader sees it: markup removed.

    Stripping tags is REQUIRED, not tidiness — a first version of this test
    scanned the raw HTML and reported `/head`, `/div`, `/table`, `/body`,
    `/html` as relative links on four correct templates. Closing tags are
    the shape a naive path regex cannot tell from a URL path. Links are not
    lost by stripping: they are asserted separately, from the href values.
    """
    return _HTML_TAG.sub(" ", part)


@pytest.mark.parametrize("label", [c[0] for c in _CORPUS])
def test_every_link_is_absolute(rendered, label):
    """A relative path in an email is unclickable text — an email has no base
    URL. MEH-1965: experience_notifications' rejection body carried a bare
    "ב-/about", the one email where the contact route matters most."""
    _, text, html = rendered[label]

    # 1. Prose, in both parts: no bare path left once real URLs are removed.
    for part_name, part in (("text", text), ("html", _visible(html or ""))):
        if not part:
            continue
        orphans = _ORPHAN_PATH.findall(_ABSOLUTE_URL.sub(" ", part))
        assert not orphans, (
            f"{label} ({part_name} prose): relative path(s) {orphans} — an "
            f"email has no base URL. Interpolate settings.frontend_url."
        )

    # 2. Every href the reader can click resolves without a base URL.
    for href in _HREF.findall(html or ""):
        assert href.startswith(("http://", "https://", "mailto:")), (
            f"{label}: href={href!r} is not absolute — a mail client has no "
            f"base URL to resolve it against."
        )


# Pure-masculine 2nd-person address. Deliberately NARROW: every word here is a
# verb form that cannot also be an adjective agreeing with a masculine noun.
#
# Excluded on purpose, each measured as a false positive in this repo's own
# copy: בטוח ("החשבון שלך בטוח"), שמור ("שם זה שמור"), מלא ("מדריך מלא"),
# העתק ("העתק של הרישיון"), צריך (impersonal "לא צריך מצלמה"), רשום.
# A guard that reds on correct copy gets disabled, so precision beats recall.
#
# KNOWN RECALL HOLE, stated so nobody discovers it as a surprise: the word
# boundary is `(?<![֐-׿])X(?![֐-׿])`, and a Hebrew prefix letter (ו/ה/ב/ל/כ/מ/ש)
# is itself in that block. So `ולחץ` does NOT match `לחץ`. That is the price of
# not matching inside longer words, and it is the right trade for a gate — but
# it means a prefixed masculine imperative passes. Rendering catches what this
# list catches; it does not catch what this list misses.
_MASCULINE_ADDRESS = [
    "צור", "לחץ", "היכנס", "הירשם", "בחר", "עדכן", "אמת", "השב",
    "תוכל", "תקבל", "תמצא", "תיהנה", "אתה",
]
_MASC_RE = [
    (w, re.compile(r"(?<![֐-׿])" + w + r"(?![֐-׿])"))
    for w in _MASCULINE_ADDRESS
]


@pytest.mark.parametrize("label", [c[0] for c in _CORPUS])
def test_no_pure_masculine_address_to_the_reader(rendered, label):
    """docs/BRAND.md §4: pure masculine is forbidden on EVERY surface
    (ADR-024: "פנייה זכרית לקוראת"). This says nothing about feminine vs
    plural — that split is by surface-function and both are legitimate."""
    _, text, html = rendered[label]
    for part_name, part in (("text", text), ("html", html)):
        if not part:
            continue
        hits = [w for w, rx in _MASC_RE if rx.search(part)]
        assert not hits, (
            f"{label} ({part_name}): masculine address {hits} to the reader — "
            f"forbidden by BRAND.md §4 on every surface."
        )


@pytest.mark.parametrize("label", [c[0] for c in _CORPUS])
def test_html_part_declares_rtl(rendered, label):
    """Gmail does not infer direction from content. Both the attribute and the
    CSS property are asserted: `dir` alone leaves inline BiDi runs (a Latin
    business name mid-sentence) to the client's guess."""
    _, _, html = rendered[label]
    assert bool(html) == (label in _EXPECT_HTML), (
        f"{label}: HTML part is {'missing' if not html else 'unexpected'}. "
        f"If this is intentional, update _EXPECT_HTML — do not let it skip."
    )
    if label not in _EXPECT_HTML:
        return
    assert 'dir="rtl"' in html, f"{label}: HTML part has no dir=\"rtl\""
    assert "direction:rtl" in html, f"{label}: HTML part has no direction:rtl"


@pytest.mark.parametrize("label", [c[0] for c in _CORPUS])
def test_html_send_carries_a_real_plain_text_fallback(rendered, label):
    """Every HTML send must pass a text body too. A client that renders the
    text part (or a screen reader preferring it) must not get an empty mail."""
    _, text, html = rendered[label]
    assert bool(html) == (label in _EXPECT_HTML), (
        f"{label}: HTML part is {'missing' if not html else 'unexpected'}. "
        f"If this is intentional, update _EXPECT_HTML — do not let it skip."
    )
    if label not in _EXPECT_HTML:
        return
    assert text and text.strip(), f"{label}: HTML sent with an empty text part"
    assert re.search("[֐-׿]", text), (
        f"{label}: text fallback carries no Hebrew — it is not a real body"
    )
