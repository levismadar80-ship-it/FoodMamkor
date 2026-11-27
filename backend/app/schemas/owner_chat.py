# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (owner assistant PR)
"""
Module:   owner_chat (schemas)
Purpose:  The owner-dashboard assistant's request and answer: her chat, the
          screen she is on and her interface language; and back, the answer,
          plus (when she asked for it) a draft of the page fields or product
          rows that nothing has saved yet, or a step to show in the chat.
Does NOT: validate the draft as a write — the fields she ticks go through
          PUT /producers/me (ProducerUpdate), like «ספרו לנו על העסק».
Related:  app/routers/chat_owner.py · app/schemas/site.py ChatMessage (the
          same per-message caps) · app/schemas/page_fill.py PageDraft
History:  owner assistant (26/11); actions, locale, unanswered (26/11, MEH-3902).
"""

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.menu_import import MenuRow
from app.schemas.page_fill import PageDraft
from app.schemas.site import ChatMessage

SECTION_MAX = 80

# What the chat can open in place (each is an existing card, saved by its own
# route): the menu upload, the photos card, and the send-for-review step.
OwnerAction = Literal["add_products", "upload_photos", "send_for_review"]


class OwnerChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)
    # The dashboard path she is on; the server keeps it only when it is one of
    # app/owner_sections.py's screens.
    section: str | None = Field(default=None, max_length=SECTION_MAX)
    # The interface language; the answer comes in the same one.
    locale: Literal["he", "en"] = "he"


class OwnerChatResponse(BaseModel):
    reply: str
    draft: PageDraft | None = None
    # Product rows read from her own chat text, for the menu review.
    products: list[MenuRow] | None = None
    action: OwnerAction | None = None
    # A question the assistant could not answer: the screen it was about (a
    # key from app/owner_sections.py) or "other". Never her words.
    unanswered: str | None = None
