"""MEH-2520 — is a business's public verification signal still true today?

Two signals the public page shows, and the one fact each one rests on:

* «מאומת» (verification_tier="verified") rests on an admin having checked a
  document (`verified_at`). When the admin also captured the licence's expiry
  (`license_expires_at`, MEH-2072) and that date has passed, the check no
  longer says anything about today, so the badge drops. The BUSINESS stays
  listed — only the badge goes (the Google / Yelp pattern), because hiding a
  live business on a mistyped date is the danger MEH-2072 refused. A NULL
  expiry means "not captured", never "expired".
* «העסק חתם על הצהרה מחייבת» (verification_tier="declared") rests on a signed
  declaration (`declared_at`, written by self-registration and by the owner
  claim). A business an admin created and nobody claimed has signed nothing, so
  it gets no "declared" tier and the sentence is not shown.

Both readers — the public schema tier and the `?verified` listing filter — go
through this module, so they cannot disagree about the same business.
"""

from datetime import date

from sqlalchemy import or_

from app.utils.clock import israel_today


def licence_lapsed(license_expires_at: date | None, today: date | None = None) -> bool:
    """True only when an expiry was captured and it is before today (Israel)."""
    if license_expires_at is None:
        return False
    return license_expires_at < (today or israel_today())


def verification_is_current(
    verified_at, license_expires_at: date | None, today: date | None = None
) -> bool:
    """«מאומת» holds: a document was checked and its captured licence has not lapsed."""
    return verified_at is not None and not licence_lapsed(license_expires_at, today)


def verified_current_condition(producer_model, today: date | None = None):
    """SQL twin of `verification_is_current` for the `?verified` filter."""
    day = today or israel_today()
    return (producer_model.verified_at.isnot(None)) & or_(
        producer_model.license_expires_at.is_(None),
        producer_model.license_expires_at >= day,
    )
