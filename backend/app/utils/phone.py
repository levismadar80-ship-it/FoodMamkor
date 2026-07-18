"""
Module:   phone
Purpose:  Canonicalize an Israeli mobile number to a single comparable form
          so a Meta webhook `from` (international, no "+") can be matched
          against an unvalidated, non-unique `User.phone` (stored in any of
          local / international / hyphenated notations).
Does NOT: format numbers for *sending* — outbound normalization lives in
          app/services/auth_notifications.py:_normalize_il_phone (which
          assumes a local 0-prefixed input and must NOT be reused here; it
          double-prefixes an already-international number). This helper is
          match-only and never mutates state.
Related:  app/routers/whatsapp_webhook.py (opt-out keyword handler, MEH-1339).
History:  MEH-1339 (creation — WhatsApp "הסר" opt-out phone matching).
"""

from __future__ import annotations

import re

_NON_DIGIT = re.compile(r"\D")

# IL mobile numbers are a 9-digit national part (local "05X-XXXXXXX" without
# the trunk 0). Landlines are 8 national digits, so requiring exactly 9 both
# canonicalizes every mobile notation to one form AND rejects non-mobile /
# foreign / garbage input (→ None) without a phone-number library.
_IL_NATIONAL_LEN = 9


def canonical_il_msisdn(phone: str | None) -> str | None:
    """Return the canonical IL MSISDN (``"972" + 9 national digits``) or None.

    Bidirectional — collapses every equivalent notation of one Israeli mobile
    number to the same string:

        "+972501234567" · "972501234567" · "0501234567" · "050-123-4567"
            → "972501234567"

    Non-deterministically-canonicalizable input (empty, too short/long,
    landline, foreign, non-numeric) returns ``None`` — the caller must treat
    None as "no match" and never guess before writing to the DB.
    """
    if not phone:
        return None
    digits = _NON_DIGIT.sub("", phone)
    if digits.startswith("972"):
        national = digits[3:]
    elif digits.startswith("0"):
        national = digits[1:]
    else:
        national = digits
    if len(national) != _IL_NATIONAL_LEN:
        return None
    return "972" + national
