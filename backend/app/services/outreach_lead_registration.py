"""
Module:   outreach_lead_registration
Purpose:  Mark an outreach lead «registered» when its owner signs up through
          the lead's prefill link (MEH-3026 F11) — until now the pipeline
          status never moved, so the admin kept chasing businesses that had
          already joined.
Touches:  outreach_leads.status (one row, no commit — the caller commits).
Does NOT: mint or validate the link for the form (admin_outreach.py
          mint_prefill_token / get_prefill), or create the producer
          (auth_register_producer.py).
Related:  backend/app/routers/admin_outreach.py:338 (the same token rules:
          ≥16 chars, unexpired), backend/app/models/admin_ops.py OutreachLead.
History:  MEH-3026 (creation).
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.admin_ops import OutreachLead
from app.utils.clock import utc_now

_MIN_TOKEN_LENGTH = 16
REGISTERED = "registered"


def mark_lead_registered(db: Session, token: str | None) -> bool:
    """Set the lead behind `token` to «registered». Returns True if a row
    changed. An absent, short, unknown or expired token is a silent no-op:
    the registration it rides on must never fail because of it."""
    if not token or len(token) < _MIN_TOKEN_LENGTH:
        return False
    lead = db.query(OutreachLead).filter(OutreachLead.prefill_token == token).first()
    if lead is None:
        return False
    expires = lead.prefill_token_expires_at
    if expires is None or expires < utc_now():
        return False
    if lead.status == REGISTERED:
        return False
    lead.status = REGISTERED  # type: ignore[assignment]
    return True
