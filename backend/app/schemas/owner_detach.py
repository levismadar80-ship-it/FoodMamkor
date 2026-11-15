"""
Module:   owner_detach
Purpose:  Request body for the admin's «ניתוק בעלים» (MEH-3256, grill retro D9).
Related:  backend/app/routers/producer_owner_detach.py
History:  MEH-3256 (moved out of the router, ADR-006 R1).
"""

from uuid import UUID

from pydantic import BaseModel, Field


class OwnerDetachIn(BaseModel):
    # The business name, typed. The same friction GitHub puts on deleting a
    # repository: an action that removes someone's access is not one click.
    confirm_name: str = Field(..., min_length=1, max_length=200)
    # The owner the admin SAW. If the row changed hands since the page loaded,
    # the action refuses instead of detaching someone she did not mean.
    expected_owner_user_id: UUID
