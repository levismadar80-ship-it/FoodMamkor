"""
Module:   owner_invite_existing
Purpose:  Request bodies for accepting an owner invite on an account that
          already exists (MEH-3256, grill retro D8).
Does NOT: carry an email or a password — the signed-in account supplies the
          address, and its password is not touched (the stronger-model review
          rejected a password field on the invite page).
Related:  backend/app/schemas/schemas.py OwnerInviteAccept (the new-account
          sibling) · backend/app/routers/producer_owner_invite_existing.py
History:  MEH-3256 (creation).
"""

from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.schemas.schemas import _terms_must_be_accepted


class OwnerInviteExistingCodeRequest(BaseModel):
    token: str = Field(min_length=1, max_length=512)


class OwnerInviteExistingAccept(BaseModel):
    token: str = Field(min_length=1, max_length=512)
    code: str = Field(min_length=1, max_length=12)
    # Both consents are hers to sign here too: the ToS again (the current
    # version), and the licensing declaration for THIS business.
    terms_accepted: bool
    declaration_accepted: bool

    @field_validator("code", mode="before")
    @classmethod
    def _strip_code(cls, v: Any) -> Any:
        return v.replace(" ", "").strip() if isinstance(v, str) else v

    @field_validator("terms_accepted")
    @classmethod
    def _terms_accepted_required(cls, v: bool) -> bool:
        return _terms_must_be_accepted(v)

    @field_validator("declaration_accepted")
    @classmethod
    def _declaration_accepted_required(cls, v: bool) -> bool:
        if v is not True:
            raise ValueError("יש לאשר את הצהרת הרישוי כדי להמשיך")
        return v
