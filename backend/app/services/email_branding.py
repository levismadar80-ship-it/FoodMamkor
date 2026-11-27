"""
The brand header shared by every HTML email (MEH-2834 PR 2).

One function, one image: the horizontal Hebrew lockup served from the
frontend's public folder (frontend/public/email-logo.png, 272×68 for a
136×34 display). Since MEH-2875 (Sapir, option ב) it is mark + «מהמקור» with no
tagline, rendered from frontend/public/logo-horizontal-he-no-tagline.svg.

Dark mode (MEH-3916, Sapir 27/11): the PNG has NO background at all — only the
flower and the wordmark on transparent pixels. Gmail's dark mode recolours the
email's backgrounds but never an image, so the old opaque white PNG was a hard
white rectangle on the dark page (and a cream badge around it still read as a
box). The wordmark is the brand's mid green #5A8F73 (a petal colour), which
reads on the cream page and on Gmail's dark page; the old near-black #1C1A17
vanished on dark. Gmail ignores prefers-color-scheme, so one image must work
on both. The wordmark sits on the flower's vertical centre (Sapir asked for
it; text y=83 in the SVG). The image is 4:1, the lockup's own ratio, so emails
already sent with the old 120×30 box show it undistorted.
Every HTML template calls email_logo_html() at the top of its content;
tests/test_email_logo.py renders each template and also scans backend/app
for any `<html` template that does not call it, so a new HTML email without
the logo fails CI.

Image host (MEH-3583): ALWAYS the public production origin, never
settings.frontend_url. Staging (both staging.mehamakor.online and
staging.mehamakor.co.il) sits behind Vercel Deployment Protection, so
`/email-logo.png` there answers 302 → vercel.com/login and every mail client's
image proxy (Gmail, Apple Mail, Outlook) shows a broken image. Links in the
emails still follow frontend_url (a staging mail links to staging); only the
static image comes from production, the same rule MEH-3414 applies to WhatsApp.
The file has been on main since MEH-2834, so production serves it.
tests/test_email_logo.py renders every template with a staging frontend_url and
fails on an image that is not on this origin, not https, or not PNG/JPEG/GIF.
"""

from html import escape as html_escape

# Public, unauthenticated, no redirect. Not an env var on purpose: every
# environment must load the image from the one host a mail client can reach.
EMAIL_ASSET_ORIGIN = "https://mehamakor.co.il"
EMAIL_LOGO_PATH = "/email-logo.png"
EMAIL_LOGO_ALT = "מהמקור"
# frontend/public/email-logo.png is 272×68 → 136×34 on screen (MEH-3916: was
# 240×60 on opaque white; MEH-2875: 240×70 with the tagline line).
EMAIL_LOGO_WIDTH = 136
EMAIL_LOGO_HEIGHT = 34


def email_logo_url() -> str:
    return f"{EMAIL_ASSET_ORIGIN}{EMAIL_LOGO_PATH}"


def email_logo_html() -> str:
    """The <img> row content. RTL: `margin-left:auto` aligns it to the start (right)."""
    # height: Outlook desktop sizes images from the attribute, not CSS.
    # color/font on the img style the alt text when images are blocked, so the
    # fallback reads like the text wordmark it replaced in some templates.
    return (
        f'<img src="{html_escape(email_logo_url())}" width="{EMAIL_LOGO_WIDTH}" height="{EMAIL_LOGO_HEIGHT}" '
        f'alt="{EMAIL_LOGO_ALT}" style="display:block;border:0;margin:0 0 24px auto;'
        'color:#2e6853;font-size:18px;font-weight:bold;font-family:Arial,Helvetica,sans-serif">'
    )


# MEH-3594 (Sapir, 21/11): the team sign-off carries the flower mark beside
# it. The square app icon (frontend/public/icon-192.png), on the same public
# origin as the logo, shown at 22×22.
EMAIL_ICON_PATH = "/icon-192.png"
EMAIL_ICON_SIZE = 22
EMAIL_SIGNOFF = "צוות מהמקור"


def email_icon_url() -> str:
    return f"{EMAIL_ASSET_ORIGIN}{EMAIL_ICON_PATH}"


def email_signoff_html() -> str:
    """«צוות מהמקור» with the flower mark before it (RTL: to its right).

    Inline content, so it sits inside whatever <p>/<td> the template already
    styles. alt="·" and not the name: the words beside it already say who
    signs, so a blocked image must not print «מהמקור» twice; every email
    <img> carries a non-empty alt (tests/test_email_logo.py), and the server
    sends no emoji (no-emoji-backend-guard.sh, MEH-3668)."""
    return (
        f'<img src="{html_escape(email_icon_url())}" width="{EMAIL_ICON_SIZE}" '
        f'height="{EMAIL_ICON_SIZE}" alt="·" style="display:inline-block;'
        'vertical-align:middle;border:0;border-radius:5px;margin:0 0 0 6px;">'
        f'<span style="vertical-align:middle;">{EMAIL_SIGNOFF}</span>'
    )
