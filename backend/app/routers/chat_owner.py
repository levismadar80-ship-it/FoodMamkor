# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (owner assistant PR)
"""
Module:   chat_owner
Purpose:  POST /chat/owner — the assistant inside the business owner's
          dashboard. It knows her business (status, what still blocks
          «שליחה לבדיקה», empty fields), the screen she is on and every
          dashboard screen, and can hand back a draft of the page fields or of
          products from what she wrote, or open an existing card in the chat
          (menu upload, photos, send for review).
Touches:  reads the owner's producer row and the categories; the Anthropic
          API (fast tier) and, for a draft, services/page_filler.py or
          services/menu_reader.py (read_menu_text).
Does NOT: write. A draft is a suggestion: the widget shows it field by field
          and PUT /producers/me saves only what she ticks (the same route and
          validation as the edit cards). The public site chat stays in
          routers/chat.py, anonymous.
Related:  app/services/owner_assistant.py (prompt + facts) ·
          app/routers/chat.py (client, caps, site knowledge — REUSES) ·
          app/routers/page_fill.py (the same draft, from a text box)
History:  owner assistant (26/11); products, cards in the chat, English,
          unanswered questions (26/11, MEH-3902).
"""

import logging
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth import require_producer
from app.config import ai_fast_request_kwargs
from app.database import get_db
from app.models import Category, User
from app.rate_limit import get_real_client_ip, limiter
from app.routers import chat as site_chat  # REUSES client, caps, knowledge
from app.schemas.owner_chat import OwnerAction, OwnerChatRequest, OwnerChatResponse
from app.schemas.page_fill import TEXT_MIN, PageDraft
from app.services import ai_budget, ai_text, menu_reader, owner_assistant, page_filler
from app.services.chat_intent_router import cached_text_block, log_cache_usage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

MAX_OUTPUT_TOKENS = 600
DAILY_CAP = "150/day"

# Hebrew in `detail=` is required — backend/app/routers/CLAUDE.md.
NOT_FOUND_DETAIL = "בית העסק לא נמצא"
EMPTY_DETAIL = "השיחה ריקה. כתבו הודעה ונסו שוב."

# Fixed lines, per interface language (the model's own answers follow the
# prompt's language line).
LINES: dict[str, dict[str, str]] = {
    "he": {
        "draft_ready": "הכנתי הצעה למילוי. סמנו מה לשמור ולחצו «שמירה».",
        "draft_nothing": (
            "לא מצאתי בטקסט פרטים שאפשר למלא בעמוד. כתבו בכמה משפטים מה העסק "
            "מוכר, איפה, באילו שעות ואיך יוצרים קשר."
        ),
        "draft_too_short": (
            "בשמחה. כתבו לי בכמה משפטים מה העסק מוכר, איפה, באילו שעות ואיך "
            "יוצרים קשר, ואכין הצעה למילוי."
        ),
        "draft_failed": (
            "לא הצלחתי לקרוא את הטקסט כרגע. אפשר למלא את הפרטים ידנית ב- "
            "/producer/dashboard/edit."
        ),
        "products_ready": "אלה המוצרים שמצאתי. בדקו כל שורה, תקנו מה שצריך ולחצו «הוספה».",
        "products_nothing": (
            "לא מצאתי מוצרים בטקסט. כתבו שם ומחיר לכל מוצר, או העלו צילום של "
            "התפריט כאן."
        ),
        "products_failed": (
            "לא הצלחתי לקרוא את המוצרים כרגע. אפשר להעלות צילום תפריט כאן, או "
            "להוסיף ב- /producer/dashboard/edit#products."
        ),
        "add_products": "אפשר לצלם את התפריט או המחירון ולהעלות אותו כאן. אראה לכם את המוצרים לבדיקה לפני שהם נוספים.",
        "upload_photos": "אפשר להעלות כאן תמונות של העסק. התמונה הראשונה היא התמונה הראשית.",
        "send_for_review": "כאן מאמתים את הוואטסאפ ושולחים את העמוד לבדיקה.",
        "failed": "משהו השתבש בצד שלי. נסו שוב בעוד רגע.",
        "unclear": "לא הצלחתי להבין את השאלה. אפשר לנסח אותה מחדש?",
        "offline": site_chat.OFFLINE_REPLY,
    },
    "en": {
        "draft_ready": "I've prepared a suggestion. Tick what to keep and tap Save.",
        "draft_nothing": (
            "I couldn't find page details in the text. Write a few sentences: "
            "what you sell, where, your hours and how to reach you."
        ),
        "draft_too_short": (
            "Happy to. Write a few sentences about what you sell, where, your "
            "hours and how to reach you, and I'll prepare a suggestion."
        ),
        "draft_failed": (
            "I couldn't read the text right now. You can fill in the details at "
            "/producer/dashboard/edit."
        ),
        "products_ready": "Here are the products I found. Check each row, fix what's needed and tap Add.",
        "products_nothing": (
            "I couldn't find products in the text. Write a name and price for "
            "each product, or upload a photo of your menu here."
        ),
        "products_failed": (
            "I couldn't read the products right now. Upload a photo of your menu "
            "here, or add them at /producer/dashboard/edit#products."
        ),
        "add_products": "Take a photo of your menu or price list and upload it here. I'll show you the products to check before they're added.",
        "upload_photos": "You can upload photos of your business here. The first photo is the main one.",
        "send_for_review": "Verify your WhatsApp number and send your page for review here.",
        "failed": "Something went wrong on my side. Please try again in a moment.",
        "unclear": "I didn't understand the question. Could you rephrase it?",
        "offline": "The assistant isn't available right now. Please try again later.",
    },
}
# Kept as names for the tests and callers that read them.
DRAFT_READY = LINES["he"]["draft_ready"]
DRAFT_NOTHING = LINES["he"]["draft_nothing"]
DRAFT_TOO_SHORT = LINES["he"]["draft_too_short"]
DRAFT_FAILED = LINES["he"]["draft_failed"]
FAILED_REPLY = LINES["he"]["failed"]


def _business_key(request: Request) -> str:
    key = getattr(request.state, "owner_chat_key", None)
    return key or get_real_client_ip(request)


def _owner(request: Request, user: User = Depends(require_producer)) -> User:
    # One daily bucket per business, whatever IP she writes from.
    request.state.owner_chat_key = f"owner_chat:{user.producer_id or user.id}"
    return user


def _messages(body: OwnerChatRequest) -> list[dict[str, Any]]:
    history = body.messages[-(site_chat.MAX_HISTORY_TURNS * 2) :]
    api_messages = [{"role": m.role, "content": m.content} for m in history]
    while api_messages and api_messages[0]["role"] != "user":
        api_messages.pop(0)
    if not api_messages:
        raise HTTPException(status_code=400, detail=EMPTY_DETAIL)
    return api_messages


def _draft_is_empty(draft: PageDraft) -> bool:
    return not any(
        value for value in draft.model_dump().values() if value not in (None, "")
    )


def _fill(text: str, categories: list[tuple[int, str]], lines: dict[str, str]) -> OwnerChatResponse:
    if len(text) < TEXT_MIN:
        return OwnerChatResponse(reply=lines["draft_too_short"])
    draft = page_filler.read_page(text, categories)
    if draft is None:
        return OwnerChatResponse(reply=lines["draft_failed"])
    if _draft_is_empty(draft):
        return OwnerChatResponse(reply=lines["draft_nothing"])
    return OwnerChatResponse(reply=lines["draft_ready"], draft=draft)


def _products(text: str, lines: dict[str, str]) -> OwnerChatResponse:
    """Product rows from her words; nothing found → the menu upload instead."""
    rows = menu_reader.read_menu_text(text) if text else []
    if rows is None:
        return OwnerChatResponse(reply=lines["products_failed"], action="add_products")
    if not rows:
        return OwnerChatResponse(reply=lines["products_nothing"], action="add_products")
    return OwnerChatResponse(reply=lines["products_ready"], products=rows)


def _show(what: object, text: str, lines: dict[str, str], can_submit: bool) -> OwnerChatResponse | None:
    if what not in owner_assistant.ACTIONS:
        return None
    if what == "send_for_review" and not can_submit:
        return None  # the card only exists for a draft
    action = cast(OwnerAction, what)
    return OwnerChatResponse(reply=text or lines[action], action=action)


def _answer(
    response: Any, ctx: "_Ctx", api_messages: list[dict[str, Any]], lines: dict[str, str]
) -> OwnerChatResponse:
    """The model's text and tool calls → one answer. A fill or a product read
    replaces the text with its fixed line; a card keeps the model's line."""
    text = " ".join(b.text for b in response.content if b.type == "text").strip()
    text = ai_text.strip_emoji(site_chat._strip_markdown(text))
    calls = {b.name: b.input for b in response.content if b.type == "tool_use"}
    out: OwnerChatResponse | None = None
    owner_words = owner_assistant.owner_text(api_messages)
    if owner_assistant.FILL_TOOL_NAME in calls:
        out = _fill(owner_words, ctx.categories, lines)
    elif owner_assistant.PRODUCTS_TOOL_NAME in calls:
        out = _products(owner_words, lines)
    elif owner_assistant.SHOW_TOOL_NAME in calls:
        what = (calls[owner_assistant.SHOW_TOOL_NAME] or {}).get("what")
        out = _show(what, text, lines, ctx.can_submit)
    if out is None:
        out = OwnerChatResponse(reply=text or lines["unclear"])
    if owner_assistant.UNANSWERED_TOOL_NAME in calls:
        topic = (calls[owner_assistant.UNANSWERED_TOOL_NAME] or {}).get("topic")
        out.unanswered = topic if topic in ctx.topics else owner_assistant.OTHER_TOPIC
        logger.info("owner chat unanswered: topic=%s", out.unanswered)
    return out


class _Ctx:
    def __init__(self, facts_block: str, categories: list[tuple[int, str]], can_submit: bool) -> None:
        self.facts_block = facts_block
        self.categories = categories
        self.can_submit = can_submit
        self.topics: list[str] = []


def _context(db: Session, user: User, section_path: str | None) -> _Ctx:
    """Read everything first, then give the connection back before any model
    call (database.py, the MEH-2886 pattern)."""
    try:
        producer = owner_assistant.load_owner_business(db, user)
        if producer is None:
            raise HTTPException(status_code=404, detail=NOT_FOUND_DETAIL)
        data = owner_assistant.facts(producer, owner_assistant.section_key(section_path))
        rows = db.query(Category.id, Category.name).order_by(Category.id).all()
        categories = [(int(cid), str(name)) for cid, name in rows]
        # The send-for-review card also verifies the phone, so it is offered
        # to any draft; the server re-checks everything on submit.
        can_submit = data["status"] == "draft"
    finally:
        db.rollback()
    return _Ctx(owner_assistant.fenced(data), categories, can_submit)


@router.post("/owner", response_model=OwnerChatResponse)
@limiter.limit("20/minute")
@limiter.limit("120/hour")
@limiter.limit(DAILY_CAP, key_func=_business_key)
def owner_chat(
    request: Request,
    body: OwnerChatRequest,
    user: User = Depends(_owner),
    db: Session = Depends(get_db),
) -> OwnerChatResponse:
    """Answer the owner inside her dashboard, or hand back a page draft."""
    api_messages = _messages(body)
    lines = LINES[body.locale]
    ctx = _context(db, user, body.section)
    client = site_chat._get_client()
    if client is None:
        return OwnerChatResponse(reply=lines["offline"])
    if not site_chat._global_chat_allowed() or not ai_budget.allow("fast"):
        return OwnerChatResponse(reply=lines["offline"])
    rescue_on = site_chat._rescue_knowledge() is not None
    ctx.topics = owner_assistant.topics(rescue_on)
    prompt = owner_assistant.system_prompt(
        rescue_on=rescue_on, site_knowledge=site_chat._base_system_prompt(), locale=body.locale
    )
    tools = [
        owner_assistant.FILL_TOOL,
        owner_assistant.PRODUCTS_TOOL,
        owner_assistant.SHOW_TOOL,
        owner_assistant.unanswered_tool(ctx.topics),
    ]
    try:
        response = client.messages.create(
            **ai_fast_request_kwargs(),
            max_tokens=MAX_OUTPUT_TOKENS,
            system=[cached_text_block(prompt), {"type": "text", "text": ctx.facts_block}],
            tools=tools,
            messages=api_messages,
        )
    except Exception as e:  # noqa: BLE001 — network/quota; the widget stays up
        logger.warning("owner chat completion failed: %s", e)
        return OwnerChatResponse(reply=lines["failed"])
    log_cache_usage("chat_owner", response)
    return _answer(response, ctx, api_messages, lines)
