"""
Module:   test_meh2151_approval_email_wire_payload
Purpose:  Assert the producer-approval email at the ONE boundary no other test
          reaches — the outbound Resend payload — so the em-dash and the pipe
          in the locked copy are proven to survive the wire, and the MEH-331
          `Content-Transfer-Encoding: base64` header is proven to still ride
          along with the HTML part.
Touches:  Nothing. `resend.Emails.send` is monkeypatched; no network, no DB.
Does NOT: re-assert the block ORDER, the link destinations, the RTL markup or
          the escaping — `tests/test_meh2151_approval_email_cta.py` owns all of
          those against the builders. This file asserts only what changes when
          you move the observation point from the builder to the transport.
Related:  backend/app/services/email.py (`send_email` — the `params` dict, the
          `html` key, the MEH-331 CTE header), backend/app/routers/admin.py
          (`_send_notification_email`, `_producer_approved_body/_html`).
History:  MEH-2151 close-out under MEH-2221 chunk 1 item 2b (2026-08-30).

WHY THE OBSERVATION POINT IS THE POINT
--------------------------------------
Every assertion in the sibling file stops at `_producer_approved_*` or at
`_send_notification_email`. Both are UPSTREAM of `app/services/email.py`, so
the whole of `send_email`'s payload assembly is unobserved: the suite is green
in a world where `params["html"]` is never set and where the MEH-331 CTE header
was deleted. That is the sibling file's own stated failure class ("a census that
never called the endpoint it censused") one layer further out, and this file is
the layer.

WHAT "SURVIVES DECODING" MEANS HERE, AND WHAT IT DOES NOT
---------------------------------------------------------
There is NO MIME construction in this repository. `send_email` hands Resend a
dict over HTTPS (`app/services/email.py`, `resend.Emails.send(params)`) and
Resend's MTA builds the MIME. So a test cannot open a MIME part and read a
`charset=`, and this file does not claim to.

What it CAN establish — and all it claims — is that the two characters are
PRESENT in both parts at the transport, and that the strings carrying them are
`str` and are UTF-8-encodable. A mojibake introduced anywhere upstream of
`resend.Emails.send` fails the first check; a lone surrogate left by a bad
decode upstream fails the second.

What it CANNOT establish, stated so no reader infers otherwise: the encoding
performed by the HTTP client and by Resend's MTA happens outside this process
and is not observable here. An earlier version of this file asserted a
`json.dumps(...).encode().decode()` "round trip" as if it covered that layer.
It did not and could not — that expression is the identity on any valid `str`.
Caught by the CI reviewer on #3180 and removed rather than reworded.
"""

import pytest

import app.routers.admin as admin_module
import app.services.email as email_module

# The two characters the MEH-2134 locked copy depends on. `—` is the separator
# in the dashboard line, `|` the one in the founder signature. Both are the
# shapes that historically come back as mojibake when a latin-1 assumption
# creeps into a transport, which is why they are the named canaries rather than
# a generic "some Hebrew".
EM_DASH = "—"
PIPE = "|"


@pytest.fixture
def wire(monkeypatch):
    """Capture the exact dict handed to `resend.Emails.send`.

    Patched at the transport, not at `send_email`: patching `send_email` is what
    every existing test does, and it is precisely the layer whose behaviour is
    in question here.
    """
    resend = pytest.importorskip("resend", reason="resend client not installed")
    captured: list[dict] = []
    monkeypatch.setattr(resend.Emails, "send", staticmethod(lambda params: captured.append(params)))
    monkeypatch.setattr(email_module.settings, "resend_api_key", "test-key-not-real")
    return captured


def _send_approval(slug="teva-pure"):
    admin_module._send_notification_email(
        "owner@example.com",
        "ברוכים הבאים",
        admin_module._producer_approved_body("טעם הבית", slug),
        html=admin_module._producer_approved_html("טעם הבית", slug),
    )


def test_control_the_transport_is_actually_reached(wire):
    """Without this, every assertion below is a vacuous pass on an empty list.

    `send_email` is fail-open on four paths (empty recipient, missing API key,
    lazy-import failure, Resend raising) and every one of them returns None
    silently. Read this failure FIRST: if the transport was never reached, then
    nothing else in this file measured anything.
    """
    _send_approval()
    assert len(wire) == 1, (
        "send_email did not reach resend.Emails.send — it fail-opened. "
        "Every other assertion in this module is void for this run."
    )
    assert wire[0].get("text"), "no text part reached the transport"
    assert len(wire[0].get("html") or "") > 500, "html part is missing or trivial"


def test_both_parts_reach_the_transport_not_just_the_builder(wire):
    _send_approval()
    assert {"from", "to", "subject", "text", "html"} <= set(wire[0])


@pytest.mark.parametrize("part", ["text", "html"])
@pytest.mark.parametrize("char, label", [(EM_DASH, "em-dash"), (PIPE, "pipe")])
def test_the_locked_punctuation_reaches_the_transport_utf8_encodable(wire, part, char, label):
    """The character is present, and the string it sits in can actually be encoded.

    WHAT THIS DELIBERATELY NO LONGER DOES, AND WHY (CI reviewer, #3180)
    -------------------------------------------------------------------
    The first version of this test round-tripped the value through
    `json.dumps(...).encode("utf-8").decode("utf-8")` and asserted equality.
    That is a Python **no-op**: `json.dumps` returns `str`, and encode/decode
    is the identity on any valid `str`, so the equality could not fail and the
    membership re-check was entailed by the assertion above it. It read as an
    encoding guard while being decoration — the exact "an assertion entailed by
    the lines above it is not a check" failure in `.claude/rules/testing.md`,
    committed in a file that cites that rule. Removed rather than reworded.

    What replaces it is a check that CAN fail: `.encode("utf-8")` raises
    `UnicodeEncodeError` on a lone surrogate, which is what a bad decode
    upstream (a latin-1 read of UTF-8 bytes, a `surrogateescape` round trip)
    actually leaves in a Python string. That is the one in-process corruption
    mode this boundary can still see.

    The wire encoding itself happens inside the HTTP client and inside Resend's
    MTA — outside this process, and NOT observable here. Named, not asserted.
    """
    _send_approval()
    value = wire[0][part]
    assert char in value, f"{label} absent from the {part} part at the transport"
    assert isinstance(value, str), f"{part} part reached the transport as {type(value).__name__}"
    value.encode("utf-8")  # raises UnicodeEncodeError on a lone surrogate


def test_both_assertions_above_can_actually_go_red():
    """Each of the two surviving assertions is shown rejecting a real bad input.

    A probe that cannot fail is decoration, so both halves get a case with a
    known answer rather than a claim that they work.
    """
    # (1) the membership half: a latin-1 read of the UTF-8 bytes, which is
    #     exactly what mojibake in an inbox is.
    mojibake = EM_DASH.encode("utf-8").decode("latin-1")
    assert EM_DASH not in mojibake, (
        "the synthetic mangled payload still contains a real em-dash — "
        "this control proves nothing as constructed"
    )
    assert len(mojibake) == 3, "expected the classic three-byte latin-1 rendering"

    # (2) the encodability half: a lone surrogate is a valid Python `str` that
    #     CANNOT be encoded to UTF-8. This is what makes the bare
    #     `value.encode("utf-8")` above a check and not a no-op.
    with pytest.raises(UnicodeEncodeError):
        "\ud800 broken".encode("utf-8")


def test_the_meh331_base64_header_rides_with_the_html_part(wire):
    """MEH-331: quoted-printable wraps at 76 chars and truncates hrefs mid-URL.

    The header is the whole fix, it lives in `send_email`, and nothing else
    asserts it. A silent deletion restores a bug whose only symptom is a dead
    link in a mail no CI job ever opens.
    """
    _send_approval()
    assert wire[0].get("headers", {}).get("Content-Transfer-Encoding") == "base64"


def test_a_text_only_send_carries_no_html_and_no_cte_header(wire):
    """The other half of the MEH-2151 byte-identical claim, measured.

    `_send_notification_email`'s docstring states that omitting `html` leaves
    the three pre-existing callers' payloads exactly as they were. That is a
    claim about the payload, so it is checked against the payload.
    """
    admin_module._send_notification_email(
        "owner@example.com", "נושא", "גוף"
    )
    assert len(wire) == 1
    assert "html" not in wire[0]
    assert "headers" not in wire[0]


def test_the_view_page_url_reaches_the_transport_unsplit(wire):
    """A URL broken across lines is the MEH-331 symptom, observed at the source end."""
    _send_approval()
    for part in ("text", "html"):
        assert "/p/teva-pure" in wire[0][part]
        assert "/p/teva-\n" not in wire[0][part]
