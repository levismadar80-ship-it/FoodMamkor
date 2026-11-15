"""
Module:    admin_producer_emails
Purpose:   Text and HTML bodies of the emails an admin decision sends to a
           business owner: approved, rejected, changes requested.
Does NOT:  Send anything (the wrappers in routers/admin_decisions.py do, via
           services/email.py) or decide the outcome.
Split out of routers/admin.py (MEH-3267); the code is moved verbatim.
"""

import logging
from html import escape as _html_escape

from app.config import settings
from app.services.email_branding import email_logo_html
from app.services.onboarding_followup import SITE_DOMAIN

logger = logging.getLogger(__name__)


# MEH-2027: the three PRODUCER-facing bodies below were inline f-strings inside
# their route handlers, which put them out of reach of the copy contract in
# tests/test_meh1965_email_copy_contract.py — rendering one meant standing up a
# request, a DB row and an authenticated admin. They are pure functions of their
# arguments so the contract can render them directly. Behaviour is unchanged:
# the strings are byte-identical to the f-strings they replace.
#
# These go to producer_user.email — the business owner, NOT an admin — so they
# are brand touchpoints and the contract's four axes (absolute links, no
# masculine address to the reader, RTL on any HTML part, real text fallback)
# apply to them in full.


def _rejection_reason_suffix(reason: str) -> str:
    """The optional reason tail, shared by the email body and the admin
    WhatsApp line so the two cannot drift apart (workflow.md Smell #1).

    MEH-226: the label was "סיבת הדחייה" and is now "הסיבה", per the approved
    email copy. The admin WhatsApp line changes with it BY DESIGN — one owner
    is the whole point of this helper, and splitting it to keep the WhatsApp
    wording frozen would rebuild exactly the drift it exists to prevent.

    Still returns "" for an empty reason, so the rejected-without-a-reason
    email omits the line rather than shipping a dangling "הסיבה:".
    """
    return f"\nהסיבה: {reason}" if reason else ""


# MEH-2134: LOCKED copy, approved by Sapir 20/08/2026, shipped verbatim.
_APPROVED_COMMUNITY_BLOCK = (
    "פתחנו קבוצת עדכונים בוואטסאפ לבתי עסק שאושרו במהמקור — שווקים ואירועים "
    "לפני כולם, ומה חדש באתר. פעם-פעמיים בחודש, רק אנחנו כותבות שם, ואפשר "
    "לצאת בכל רגע:"
)

# MEH-2151: LOCKED copy, approved by Sapir 21/08/2026, shipped verbatim.
# Labels only — the URL is appended on its own line beneath each, mirroring
# the community block's `label:\n{url}` shape so all three read alike.
_APPROVED_VIEW_PAGE_LABEL = "ככה העמוד שלך נראה ללקוחות:"
_APPROVED_DASHBOARD_LABEL = "לעדכון פרטים, תמונות ומוצרים — לוח הבקרה:"
_APPROVED_HTML_BUTTON_LABEL = "לצפייה בעמוד העסק"
_APPROVED_HTML_DASHBOARD_LABEL = "לוח הבקרה — עדכון פרטים ומוצרים"


def _approval_links(slug: str | None) -> tuple[str, str]:
    """The two absolute URLs the approval email carries: (page, dashboard).

    Shared by the text and HTML builders deliberately. MEH-2151 requires BOTH
    parts to carry BOTH links, so composing the URLs twice would create two
    owners for one fact — the drift `workflow.md` Smell #1 names — and the
    failure would be silent: an email whose button and whose text line point at
    different places still renders, still sends, and still looks correct in a
    diff. This is not a shared layout module (the over-engineering guard's
    target); it returns two strings and knows nothing about either part's
    markup.

    The page URL is "" for a falsy or whitespace-only slug, which is what lets
    each caller drop its view-page block whole. `.strip()` before the guard,
    not after — same reasoning as the community invite below: a whitespace-only
    value is truthy, so an unstripped read would emit a label above a URL of
    "/p/   ". Mirrors the falsy-guard pattern already used for
    `whatsapp_community_invite_url`.

    Env-aware host (mirrors the changes-requested body's `dashboard_link`):
    staging emails must point at staging, not production.
    """
    clean_slug = (slug or "").strip()
    page_url = f"{settings.frontend_url}/p/{clean_slug}" if clean_slug else ""
    dashboard_url = f"{settings.frontend_url}/producer/dashboard"
    return page_url, dashboard_url


def _producer_approved_body(name: str, slug: str | None) -> str:
    """MEH-2134: copy approved by Sapir 20/08/2026, shipped verbatim.

    Signed `ספיר שנפ | מייסדת` in the first person, matching
    `pending_nudge.py:149` and all four `onboarding_followup.py` steps —
    one mailbox, one sender. `_producer_rejected_body` deliberately keeps the
    institutional sign-off: an institutional "no" is kinder than a personal
    one, and that asymmetry is a decision, not an oversight. (The literal is
    spelled out nowhere in this docstring so that the sign-off census below
    counts signatures, not prose.)

    Census of the institutional sign-off in this file: **2** — the rejection
    body and the changes-requested body, both untouched here. MEH-2134's DoD
    predicted 2 → 1, which is wrong twice over: the pre-change count was 3
    (this body plus those two, verified on `origin/staging`), and 1 is
    unreachable because the same ticket requires `_producer_changes_requested_body`
    byte-identical. This function is the only one MEH-2134 moves off it.

    The community invite rides in THIS email rather than the registration
    form (just-in-time beats upfront, and the group is for *approved*
    businesses) and rather than the `producer_approved_v1` WhatsApp template
    (Meta approved it with one parameter and no buttons; adding a URL button
    means re-approval — MEH-509 PR1 got a 400 for exactly that).

    An unset `whatsapp_community_invite_url` drops the paragraph AND the URL
    line together, with no dangling label and no blank-line artifact. That is
    what lets this merge before the link exists in Railway (Phase C).
    Falsy-guard pattern mirrors `settings.admin_whatsapp_to` in routers/admin_decisions.py.

    MEH-2151 added the two link blocks and the `slug` parameter. Order is
    greeting → approval → view-page → dashboard → community → signature: the
    community block moved BELOW the links because it is the secondary action,
    and its text is byte-identical (MEH-2134 LOCKED — the census above is why
    that matters). The mail previously announced "הפרופיל שלך כעת גלוי" and
    then offered no way to look at it; the view-page link is that proof.

    THREE optional blocks now share one shape, and the degradation is the
    reason to keep it that way: with no slug AND no invite the body is
    greeting → approval → dashboard → signature, still with no dangling label.
    Only the dashboard block is unconditional — its URL needs no input beyond
    `settings.frontend_url`, so there is no state in which it cannot be built.
    """
    # `.strip()` before the guard, not after: a Railway value of "  " is
    # truthy, so the raw read would emit the paragraph above an empty line —
    # the dangling-label failure this function exists to avoid, reached by the
    # one input nobody types deliberately.
    invite_url = settings.whatsapp_community_invite_url.strip()
    community = f"\n{_APPROVED_COMMUNITY_BLOCK}\n{invite_url}\n" if invite_url else ""
    page_url, dashboard_url = _approval_links(slug)
    # Same `\n{label}\n{url}\n` shape as `community`, so each block that is
    # present contributes exactly one blank line before it and the signature's
    # own leading "\n" closes the last one — which is why an omitted block
    # leaves no double blank line and no dangling label.
    view_page = f"\n{_APPROVED_VIEW_PAGE_LABEL}\n{page_url}\n" if page_url else ""
    dashboard = f"\n{_APPROVED_DASHBOARD_LABEL}\n{dashboard_url}\n"
    return (
        f'היי,\n\nהעסק שלך "{name}" אושר במהמקור! '
        f"הפרופיל שלך כעת גלוי לכל המשתמשים באתר.\n"
        f"{view_page}"
        f"{dashboard}"
        f"{community}"
        f"\nספיר שנפ\nמייסדת | מהמקור\n{SITE_DOMAIN}"
    )


def _producer_approved_html(name: str, slug: str | None) -> str:
    """MEH-2151: the HTML twin of `_producer_approved_body` — same copy, same order.

    WHY AN HTML PART EXISTS AT ALL, since the text body was already readable:
    Gmail does not infer direction from content, so a plain-text Hebrew line
    ending in a period renders that period at the START of the line — observed
    21/08 on a real approval mail (".גלוי"). `dir="rtl"` on the document plus
    `direction:rtl` on the containing elements is the fix, and the copy contract
    (`tests/test_meh1965_email_copy_contract.py`) asserts BOTH: the attribute
    alone still leaves an inline BiDi run (a Latin business name mid-sentence)
    to the client's guess.

    Structure and palette follow `routers/marketing.py:_send_newsletter_welcome`
    — table layout, inline CSS only, no <style> block and no external sheet,
    because Gmail strips both. No emoji, unlike that precedent: the text twin
    carries none and the two parts must read alike.

    THE CARD IS `width="100%"` CAPPED BY `max-width`, NEVER `width="560"`. The
    HTML width ATTRIBUTE beats the CSS `max-width` beside it, so the two
    together are not belt-and-braces — the attribute simply wins and the card
    is 560px wide on a 375px screen. Measured with Playwright on staging
    `88e9717f`: `scrollWidth=560` against `innerWidth=375`, the button label
    clipped to «עסק». The second-order cost is the one that matters: a client
    that shrink-to-fits instead of scrolling (Gmail's common behaviour) scales
    560→375, and the 46px button lands at ~31px physical — under the 44px
    minimum tap target it passes at CSS scale. `margin:0 auto` keeps it centred
    once the width is fluid.

    KNOWN LIMIT, stated rather than papered over: Outlook's Word engine ignores
    `max-width`, so there the card renders full-width instead of capped. The
    bulletproof fix is an `<!--[if mso]>` fixed-width wrapper, which this
    ticket did not authorise and which the newsletter precedent does not carry
    either. Gmail and Apple Mail — the ticket's smoke targets — honour it.

    The primary button centres with `align="center"` on its own table: an HTML
    attribute, chosen over `margin:auto` because Outlook ignores auto margins
    on a table box. It sits inside a `text-align:right` cell, which does not
    move a block-level table on its own.

    EVERY interpolated value goes through `escape()` — all 11 sites, including
    the LOCKED copy constants and `SITE_DOMAIN`, none of which carries an HTML
    metacharacter today (measured). That is exactly why escaping them is not
    optional: a guarantee that holds only because of a property of the current
    value is not a guarantee, and the next approved copy edit is where it stops
    holding.

    That sentence was FALSE when first written — it claimed "every" while three
    constants were interpolated raw, and the CI reviewer caught it on PR #3054.
    A docstring asserting a property is the artifact least likely to be
    re-checked (`.claude/rules/testing.md`), so the claim is no longer left on
    its own: `test_meh2151_approval_email_cta.py` parses this function's source
    and fails on any interpolation site that is not wrapped, which is what makes
    the sentence above checkable instead of merely stated. `name` is
    owner-supplied free text that reaches this function unfiltered, so a
    business name containing `<` or `"` would break out of the markup it lands
    in — harmless in the text part, an injection in this one. `slug` is
    system-minted (MEH-1817) and already URL-safe, but it is escaped on the same
    line rather than trusted, so the guarantee lives here instead of depending
    on a property enforced two modules away.

    A falsy slug drops the primary button whole, exactly as the text twin drops
    its view-page block: the mail then leads with the dashboard link rather than
    showing a button that goes nowhere.
    """
    page_url, dashboard_url = _approval_links(slug)
    safe_name = _html_escape(name)
    invite_url = settings.whatsapp_community_invite_url.strip()

    button = (
        f'<table align="center" cellpadding="0" cellspacing="0" '
        f'style="margin:0 auto 24px;">'
        f'<tr><td style="background:#2e6853;border-radius:8px;">'
        f'<a href="{_html_escape(page_url)}" style="display:inline-block;'
        f"padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;"
        f'text-decoration:none;direction:rtl;">'
        f"{_html_escape(_APPROVED_HTML_BUTTON_LABEL)}</a></td></tr></table>"
        if page_url
        else ""
    )
    community = (
        f'<p style="color:#3a3a3a;font-size:15px;line-height:1.8;'
        f'margin:0 0 24px;direction:rtl;">'
        f"{_html_escape(_APPROVED_COMMUNITY_BLOCK)}<br>"
        f'<a href="{_html_escape(invite_url)}" '
        f'style="color:#2e6853;word-break:break-all;">'
        f"{_html_escape(invite_url)}</a></p>"
        if invite_url
        else ""
    )

    # MEH-2834: the shared brand header; email_logo_html() escapes its URL itself.
    logo = email_logo_html()
    return (
        "<!DOCTYPE html>\n"
        '<html dir="rtl" lang="he">\n'
        '<head><meta charset="UTF-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        "</head>\n"
        '<body style="margin:0;padding:0;background:#F5F0E8;'
        'font-family:Arial,Helvetica,sans-serif;direction:rtl;">\n'
        '<table width="100%" cellpadding="0" cellspacing="0" '
        'style="background:#F5F0E8;padding:32px 0;"><tr><td align="center">\n'
        '<table width="100%" cellpadding="40" cellspacing="0" '
        'style="background:#ffffff;border-radius:12px;text-align:right;'
        'direction:rtl;max-width:560px;margin:0 auto;"><tr>\n'
        '<td style="text-align:right;direction:rtl;">\n'
        f"{logo}\n"
        '<p style="color:#3a3a3a;font-size:15px;line-height:1.8;'
        'margin:0 0 16px;direction:rtl;">היי,</p>\n'
        '<p style="color:#1C1A17;font-size:17px;line-height:1.8;'
        'margin:0 0 24px;direction:rtl;">'
        f'העסק שלך "{safe_name}" אושר במהמקור! '
        "הפרופיל שלך כעת גלוי לכל המשתמשים באתר.</p>\n"
        f"{button}\n"
        '<p style="margin:0 0 24px;direction:rtl;">'
        f'<a href="{_html_escape(dashboard_url)}" style="color:#2e6853;'
        'font-size:15px;text-decoration:underline;direction:rtl;">'
        f"{_html_escape(_APPROVED_HTML_DASHBOARD_LABEL)}</a></p>\n"
        f"{community}\n"
        '<hr style="border:none;border-top:1px solid #e5e0d8;margin:0 0 20px;">\n'
        '<p style="color:#3a3a3a;font-size:15px;line-height:1.8;'
        'margin:0;direction:rtl;">'
        f"ספיר שנפ<br>מייסדת | מהמקור<br>{_html_escape(SITE_DOMAIN)}</p>\n"
        "</td></tr></table>\n"
        "</td></tr></table>\n"
        "</body>\n"
        "</html>"
    )


def _rejected_dashboard_link(dashboard_link: str | None) -> str:
    """MEH-2210: the owner dashboard is where the resubmit CTA lives. Computed
    lazily so the MEH-1965 copy corpus can keep calling the body builders with
    two arguments; the handler passes the explicit value it already builds for
    the changes-requested mail (`admin_decisions.py` request_producer_changes)."""
    return dashboard_link or f"{settings.frontend_url}/producer/dashboard"


def _single_line(value: str) -> str:
    """Collapse any newline in an owner-supplied value to a single space.

    `sanitize_text` (services/sanitization.py:14) runs bleach with `tags=[]`
    and then `.strip()` — bleach removes markup, `.strip()` trims the ends,
    and neither touches an interior `\n`. So a business name really can carry
    line breaks into a plain-text mail body, where the HTML twin's
    `_html_escape` gives no protection because the text part is not markup.

    In the rejection mail the greeting is the first line and the signature the
    last, so an embedded newline lets the name open lines of its own beneath
    the greeting — a self-addressed mail, hence Minor and not a security fix,
    but the body should render as the copy Sapir approved regardless.

    Reported by the reviewer on the MEH-2210 chunk-C PR against this function.
    The same interpolation exists in `_producer_approved_body` and
    `_producer_changes_requested_body`; both are OUTSIDE this PR's
    diff and are deliberately left alone here rather than widening it — this
    helper is what makes each of them a one-line change.
    """
    return " ".join(value.split())


def _producer_rejected_body(
    name: str, reason: str, dashboard_link: str | None = None
) -> str:
    """MEH-226: copy approved by Sapir 14.08.2026 — greeting, decision and the
    "הסיבה:" tail are shipped verbatim.

    MEH-2210 replaced the recovery line. The MEH-226 sentence ("אפשר לתקן את
    הפרטים בלוח הבקרה ולהשיב למייל הזה — ונבחן את הבקשה מחדש") was the
    conditional half of that ruling: it said "reply to this email" BECAUSE the
    resubmit flow did not exist — `request_producer_review` answered a rejected
    owner with 409. Chunk A of MEH-2210 opened that door (rejected → pending,
    three times), so the line now points at the flow that exists, with the
    card's own copy and the dashboard link the changes-requested mail already
    carries. `tests/test_meh226_rejection_reason.py` holds both halves: the
    owner can still edit, and the retired "הגישי שוב מהדף האישי" stays out.

    The reason tail is the COMPOSED text (`_compose_rejection_reason`) — the
    preset label plus the admin's free text — so the "reason line by code" the
    card asks for is already in it; a second line keyed on the code would print
    the same label twice.
    """
    link = _rejected_dashboard_link(dashboard_link)
    return (
        f"שלום {_single_line(name)},\n\n"
        f"תודה על הבקשה להצטרף למהמקור. בשלב זה לא אישרנו אותה."
        f"{_rejection_reason_suffix(reason)}\n\n"
        f"אפשר לתקן ולשלוח שוב מלוח הבקרה: {link}\n\n"
        f"בברכה,\nצוות מהמקור"
    )


def _producer_rejected_html(
    name: str, reason: str, dashboard_link: str | None = None
) -> str:
    """MEH-2210: the HTML twin of `_producer_rejected_body` — same copy, same
    order, same reason. Mirrors `_producer_approved_html` (MEH-2151): Gmail
    does not infer direction from content, so the plain-text Hebrew body
    renders its trailing period at the START of the line; `dir="rtl"` on the
    document plus `direction:rtl` on every containing element is the fix.
    Every producer-controlled value is escaped; the reason is the admin's
    composed text and is escaped too — it is rendered, never trusted.
    """
    # MEH-2210: _single_line first, so the two twins agree on what an
    # owner-supplied name may do. Reviewer's finding, and their own
    # caveat is right — a newline is invisible here because HTML
    # collapses whitespace, so this buys symmetry rather than a fix.
    # That is worth one call: the text twin's guarantee is only
    # readable as a rule if both paths carry it.
    safe_name = _html_escape(_single_line(name))
    link = _rejected_dashboard_link(dashboard_link)
    reason_block = (
        (
            '<p style="color:#3a3a3a;font-size:15px;line-height:1.8;'
            'margin:0 0 24px;direction:rtl;">'
            f"הסיבה: {_html_escape(reason)}</p>\n"
        )
        if reason
        else ""
    )
    # MEH-2834: the shared brand header; email_logo_html() escapes its URL itself.
    logo = email_logo_html()
    return (
        "<!DOCTYPE html>\n"
        '<html dir="rtl" lang="he">\n'
        '<head><meta charset="UTF-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        "</head>\n"
        '<body style="margin:0;padding:0;background:#F5F0E8;'
        'font-family:Arial,Helvetica,sans-serif;direction:rtl;">\n'
        '<table width="100%" cellpadding="0" cellspacing="0" '
        'style="background:#F5F0E8;padding:32px 0;"><tr><td align="center">\n'
        '<table width="100%" cellpadding="40" cellspacing="0" '
        'style="background:#ffffff;border-radius:12px;text-align:right;'
        'direction:rtl;max-width:560px;margin:0 auto;"><tr>\n'
        '<td style="text-align:right;direction:rtl;">\n'
        f"{logo}\n"
        '<p style="color:#3a3a3a;font-size:15px;line-height:1.8;'
        f'margin:0 0 16px;direction:rtl;">שלום {safe_name},</p>\n'
        '<p style="color:#1C1A17;font-size:17px;line-height:1.8;'
        'margin:0 0 24px;direction:rtl;">'
        "תודה על הבקשה להצטרף למהמקור. בשלב זה לא אישרנו אותה.</p>\n"
        f"{reason_block}"
        '<p style="margin:0 0 24px;direction:rtl;">'
        "אפשר לתקן ולשלוח שוב מלוח הבקרה: "
        f'<a href="{_html_escape(link)}" style="color:#2e6853;'
        'font-size:15px;text-decoration:underline;direction:rtl;">'
        f"{_html_escape(link)}</a></p>\n"
        '<hr style="border:none;border-top:1px solid #e5e0d8;margin:0 0 20px;">\n'
        '<p style="color:#3a3a3a;font-size:15px;line-height:1.8;'
        'margin:0;direction:rtl;">'
        f"בברכה,<br>צוות מהמקור<br>{_html_escape(SITE_DOMAIN)}</p>\n"
        "</td></tr></table>\n"
        "</td></tr></table>\n"
        "</body>\n"
        "</html>"
    )


def _producer_changes_requested_body(
    name: str, feedback: str, dashboard_link: str
) -> str:
    return (
        f"שלום,\n\n"
        f'הבקשה לרישום "{name}" במהמקור נבדקה. כדי שנוכל לאשר ולפרסם את '
        f"בית העסק, נשאר להשלים:\n\n"
        f"{feedback}\n\n"
        f"אפשר להשלים את הפרטים בלוח הבקרה: {dashboard_link}\n"
        f"לאחר ההשלמה נמשיך בתהליך האישור ונעדכן אתכם.\n\n"
        f"בברכה,\nצוות מהמקור"
    )
