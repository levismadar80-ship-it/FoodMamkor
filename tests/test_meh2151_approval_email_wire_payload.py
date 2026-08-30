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
`charset=`, and this file does not claim to. What it CAN establish — and what
actually protects the two characters the ticket names — is that the strings
reach the transport intact and round-trip through the UTF-8 JSON encoding the
HTTP client applies to them. A mojibake introduced anywhere upstream of
`resend.Emails.send` fails here; one introduced by Resend's own MTA is not
observable from this process and is named as such rather than assumed away.
"""

import json

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
def test_the_locked_punctuation_survives_the_utf8_json_round_trip(wire, part, char, label):
    """Present AND intact after the encoding the client applies.

    Two separate failures wear the same face in an inbox — a character that was
    never rendered, and one that was rendered and then mangled — so both are
    asserted, in that order.
    """
    _send_approval()
    value = wire[0][part]
    assert char in value, f"{label} absent from the {part} part at the transport"

    round_tripped = json.loads(json.dumps({part: value}).encode("utf-8").decode("utf-8"))
    assert round_tripped[part] == value, f"{part} part mutated by UTF-8 JSON encoding"
    assert char in round_tripped[part], f"{label} lost in the {part} part round trip"


def test_encoding_probe_discriminates():
    """The round-trip assertion above must be able to go RED.

    A probe that cannot fail is decoration. This constructs a payload mangled
    exactly the way a latin-1 transport mangles an em-dash and requires the
    same membership test to reject it — so the greens above are a measurement
    of the real payload, not a property of `json` being lossless for all input.
    """
    mojibake = EM_DASH.encode("utf-8").decode("latin-1")
    assert EM_DASH not in mojibake, (
        "the synthetic mangled payload still contains a real em-dash — "
        "this control proves nothing as constructed"
    )
    assert len(mojibake) == 3, "expected the classic three-byte latin-1 rendering"


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
