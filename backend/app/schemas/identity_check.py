"""
Module:   identity_check (schemas)
Purpose:  Body and answer of POST /producer-identity-check — the sign-up form
          asks whether the business being registered already has a page
          (MEH-3884).
Does NOT: carry a business name, id, status or full email: the answer says
          only that a page exists and, when it has an account, a masked email.
Related:  app/routers/producer_identity_check.py · services/business_identity.py
History:  MEH-3884 (creation)
"""

from pydantic import BaseModel, Field


class IdentityCheckIn(BaseModel):
    """What the form has typed so far. A signed-in user's own account email
    and phone are added by the server; nothing else is read from the body."""

    phone: str | None = Field(default=None, max_length=40)


class IdentityCheckMatch(BaseModel):
    """`owner_email` is masked (`o***@farmerim.com`); None = a page with no account."""

    owner_email: str | None


class IdentityCheckOut(BaseModel):
    match: IdentityCheckMatch | None
