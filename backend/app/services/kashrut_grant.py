"""
Module:   kashrut_grant
Purpose:  Turn a kashrut badge on for a business, with the expiry printed on
          its certificate. One home for the rule, used by the admin's approve
          of an owner's request and by the admin attaching a certificate
          herself.
Touches:  producers (kashrut_badges, kashrut_expires_at, kashrut_verified_at).
Does NOT: commit, create the request row, or notify the owner — the routes in
          backend/app/routers/admin_kashrut.py do that.
Related:  backend/app/routers/admin_kashrut.py (approve, grant) ·
          backend/app/services/kashrut_cert_proxy.py (which cert is shown).
History:  MEH-2518 (printed expiry, earlier date wins — written in the router);
          MEH-3081 (moved here verbatim so the admin grant shares it).
"""

from __future__ import annotations

from datetime import date, datetime, time, timezone

from app.models import Producer
from app.utils.clock import ISRAEL_TZ


def certificate_expiry(expires_on: date) -> datetime:
    """The last moment of the printed expiry day in Israel, as the naive UTC
    the `kashrut_expires_at` column stores (it is compared against utc_now())."""
    end_of_day = datetime.combine(expires_on, time.max, tzinfo=ISRAEL_TZ)
    return end_of_day.astimezone(timezone.utc).replace(tzinfo=None)


def apply_badge(producer: Producer, badge_code: str, expires_on: date, now: datetime) -> None:
    """Add `badge_code` and set the business's one expiry. Caller commits."""
    new_expiry = certificate_expiry(expires_on)
    live = producer.kashrut_expires_at is None or producer.kashrut_expires_at >= now
    other_live_badges = live and any(
        code != badge_code
        for code in (producer.kashrut_badges or [])
    )

    badges = list(producer.kashrut_badges or [])
    if badge_code not in badges:
        badges.append(badge_code)
        producer.kashrut_badges = badges  # type: ignore[assignment]

    # MEH-2518: the expiry is the date printed on the certificate, never
    # approval + 365 days (which also stacked a year per extra badge). There is
    # one expiry per business, so while ANOTHER badge is still live the earlier
    # of the two dates wins — the public «תקף עד» must never outlast a
    # certificate. Approving the business's only badge (a renewal) replaces it.
    if other_live_badges and producer.kashrut_expires_at is not None:
        producer.kashrut_expires_at = min(producer.kashrut_expires_at, new_expiry)  # type: ignore[assignment]
    else:
        producer.kashrut_expires_at = new_expiry  # type: ignore[assignment]
    producer.kashrut_verified_at = now  # type: ignore[assignment]
