# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3480 PR)
"""
Module:   review_reply_suggest (schemas)
Purpose:  The answer of POST /reviews/{id}/reply/suggest (MEH-3480).
History:  MEH-3480 (creation)
"""

from pydantic import BaseModel


class ReviewReplySuggestOut(BaseModel):
    reply: str
