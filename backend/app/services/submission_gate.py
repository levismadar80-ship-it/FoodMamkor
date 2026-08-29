"""
Module:   submission_gate
Purpose:  The single answer to "may this business be sent to the admin review
          queue, and if not, what is it missing?". One list of requirement
          codes, produced in one place, consumed by the submit endpoint (which
          422s on a non-empty list) and by the day-1 nudge email (which names
          the same items to the owner).
Touches:  reads a Producer and its images / products / categories / locations /
          delivery_areas relations. No writes, no commit, no I/O, no email —
          callers own all of that.
Does NOT: decide APPROVABILITY. That is a different question with a different
          owner: producer_me.py:_is_approvable and admin.py:_assert_approvable
          (the MEH-799 photo gate + the MEH-971 license gate), which stay
          exactly as they are, as defense-in-depth at approve time. In
          particular a LICENSE is deliberately NOT checked here — MEH-971's
          license_pending path lets a business reach the queue with a NULL
          license on purpose, and gating submission on it would close a route
          the product wants open. Opening hours are likewise absent: MEH-1895
          counts them toward completeness, but they are RECOMMENDED, not
          required (Google precedent, Sapir 16/08).
Related:  backend/app/routers/producer_me.py (POST /producers/me/submit-for-review),
          backend/app/services/pending_nudge.py (maps these codes to email copy),
          frontend/lib/producer-completeness.js:48 (the frontend mirror this
          deliberately parallels — see "Why this is not that" below).
History:  MEH-2100 (creation) — extracted so the submit gate and the MEH-1818
          nudge cannot drift into two different definitions of "ready".

Why this is NOT producer-completeness.js, even though they overlap
------------------------------------------------------------------
`producerCompleteness()` answers "how polished is this profile?" and feeds a
progress ring; it counts a short description and opening hours, neither of
which blocks anything. This module answers "is it legal to enter the review
queue?" — a smaller, harder set. Merging them would either block submission on
a tagline or let the ring hit 100% on a business that cannot submit. They share
the LOCATION rule and nothing else, and that rule is mirrored below rather than
imported because this is Python and that is JavaScript.
"""

from __future__ import annotations

import math

from app.models.models import Producer

# Machine-readable requirement codes. These cross the API boundary — the
# submit endpoint returns them in `detail.params.missing` — so they are part
# of the contract: rename one and the dashboard checklist stops matching.
MISSING_IMAGE = "image"
MISSING_PRODUCT = "product"
MISSING_CATEGORY = "category"
MISSING_LOCATION = "location"
MISSING_PHONE_VERIFIED = "phone_verified"

# Canonical order. Callers render in list order, so this is the order the
# owner reads her missing items in — image first (the thing customers see
# first), phone verification last (the one step that needs a code to arrive).
SUBMISSION_REQUIREMENTS: tuple[str, ...] = (
    MISSING_IMAGE,
    MISSING_PRODUCT,
    MISSING_CATEGORY,
    MISSING_LOCATION,
    MISSING_PHONE_VERIFIED,
)


def _is_usable_coord(value) -> bool:
    """A coordinate is usable only when it is a real, non-NaN number.

    Mirrors producerPoints.js:20's `isUsableCoord`. `bool` is excluded
    explicitly because in Python `isinstance(True, int)` is True, so a stray
    boolean would otherwise read as the latitude 1.
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    return not math.isnan(value)


def _has_location(producer: Producer) -> bool:
    """True when the business has told us where it is — by whichever of the
    two shapes applies to it.

    Mirrors producer-completeness.js:50-72 + producerPoints.js, which is what
    the dashboard checklist shows the owner. The two must agree: a checklist
    row that reads done while the server 422s on the same field is the worst
    possible version of this feature.

    MEH-213: a delivery-only business intentionally has NO lat/lng, so
    demanding coordinates from it would make submission unreachable. For that
    shape the location signal is the delivery declaration instead — nationwide,
    or at least one named city.

    MEH-904 / MEH-1838: the cities come from the `delivery_areas` ROWS. The
    flat `delivery_cities` column is dead and is never written by any
    registration path, so reading it here would evaluate empty for every
    business and silently block every delivery-only submission.
    """
    delivery_only = producer.has_physical_location is False and bool(
        producer.offers_delivery
    )
    if delivery_only:
        if producer.delivery_nationwide:
            return True
        return any(
            (area.city or "").strip() for area in (producer.delivery_areas or [])
        )

    # Physical location. MEH-1938 chunk 3: a producer_locations row counts,
    # and Producer.lat/lng is the fallback for rows that predate that table —
    # same precedence producerPoints() uses, so a business with coordinates in
    # either place reads as located.
    for loc in producer.locations or []:
        if _is_usable_coord(loc.lat) and _is_usable_coord(loc.lng):
            return True
    return _is_usable_coord(producer.lat) and _is_usable_coord(producer.lng)


def submission_missing_items(producer: Producer) -> list[str]:
    """The requirement codes this producer has NOT satisfied, in canonical
    order. An empty list means "ready to submit".

    Every check is written as "prove it is present", never "prove it is
    absent", so a relation that fails to load reads as MISSING rather than as
    satisfied — the fail-closed direction. The cost of a false "missing" is
    one confused owner; the cost of a false "ready" is an unreviewable row in
    the admin queue, which is the bug this whole ticket exists to remove.
    """
    missing: list[str] = []

    # MEH-799: `images` is ARRAY(Text) with default=[], so an untouched row can
    # be [] OR None depending on how it was inserted. `or []` normalises both.
    if not (producer.images or []):
        missing.append(MISSING_IMAGE)

    # Etsy precedent (Sapir 16/08): one product minimum. A business page with
    # an empty catalog gives a customer nothing to act on. Matches the
    # dashboard checklist's CHECKLIST_PRODUCTS_MIN = 1 — deliberately NOT
    # badges.js PRODUCTS_MIN = 3, which is the auto-badge threshold and was
    # decoupled from onboarding in MEH-1238.
    if not (producer.products or []):
        missing.append(MISSING_PRODUCT)

    if not (producer.categories or []):
        missing.append(MISSING_CATEGORY)

    if not _has_location(producer):
        missing.append(MISSING_LOCATION)

    # MEH-745: the WhatsApp number is the channel every customer contact runs
    # through, so an unverified one makes an approved page useless.
    #
    # `phone_verified` is the signal, NOT a status value — pending_nudge read
    # `status == "pending_whatsapp"` before this module existed, and under the
    # draft state machine that status stopped being reachable for a new
    # registration (it was removed outright in MEH-2124), so keying on it would
    # have reported every draft as phone-verified and opened the gate for
    # nobody's benefit. The column is written by
    # producer_me.py:confirm_phone_otp independently of status, which is what
    # makes it correct for a draft.
    if not producer.phone_verified:
        missing.append(MISSING_PHONE_VERIFIED)

    return missing


def is_ready_for_review(producer: Producer) -> bool:
    """Convenience predicate. Kept as a one-liner over the list so there is
    exactly one definition of ready and no second condition to drift."""
    return not submission_missing_items(producer)
