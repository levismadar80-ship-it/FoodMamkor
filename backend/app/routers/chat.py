"""Chat assistant router — answers questions about mehamakor.online via Claude.

A small Q&A bot users can open from the floating widget on the homepage.
Users get answers to "how do I register?", "how do I find a producer?",
"how do I post a home listing?" — without having to leave the page.

Design notes:
  - Uses claude-haiku-4-5 (cheapest production model — see SKILL.md model
    table). The questions are short, the answers should be short, and we
    expect MVP-scale traffic so per-call cost matters.
  - System prompt is in Hebrew, feminine voice, scoped tightly to the
    site so the bot doesn't drift into general-purpose chitchat.
  - **No auth required.** People should be able to ask a question before
    signing up — that's the whole point.
  - **Rate-limited heavily** (10/minute, 30/hour per IP) — every call
    costs money, and an unauthed endpoint is the obvious abuse target.
  - Conversation history is sent client → server every turn (the API is
    stateless, the client tracks state). We cap to the last 10 turns
    server-side to bound the prompt budget regardless of client behavior.
  - **Fail-open**: if ANTHROPIC_API_KEY isn't set we return a friendly
    Hebrew "the assistant is offline, please try again later" message
    rather than crashing the widget.
"""
import logging
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import settings
from app.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

# claude-haiku-4-5 is the cheapest production model. Hard-coded here
# because the system-wide `settings.anthropic_model` is opus-tier and
# tuned for moderation accuracy, not chatbot cost.
CHAT_MODEL = "claude-haiku-4-5"

# Cap on conversation length sent to the API. Each turn is a user msg
# + assistant msg, so 10 = 20 messages = ~2-3K tokens of history.
MAX_HISTORY_TURNS = 10

# Cap on output tokens — the bot should answer in 2-3 sentences, not
# write essays. Keeps cost predictable and the UX snappy.
MAX_OUTPUT_TOKENS = 400

# Hebrew system prompt — scoped tightly to the site. Feminine voice
# matches the rest of the UI per CLAUDE.md micro-copy rules.
SYSTEM_PROMPT = """את העוזרת הווירטואלית של מהמקור — דירקטורי ישראלי של בתי עסק מקומיים לאוכל אמיתי, מגדלים קטנים, ושכנות שמבשלות בבית.

המשימה שלך: לענות לגולשות שאלות על השימוש באתר. ענה בעברית, בקצרה (2-3 משפטים), בטון חם ונעים, ובלשון נקבה. אל תמציאי תשובות שאינך בטוחה בהן.

מה את יודעת על האתר:

**איך נרשמים**
- צרכניות נרשמות חינם מ-/login (אימייל + סיסמה, או Google/Apple).
- בעלות עסק נרשמות מ-/register/producer — טופס בן 3 שלבים. ההצטרפות חופשית, ולאחר ההגשה הפרופיל ממתין לאישור מהאדמין לפני שהוא מופיע בדירקטורי.
- שכנות שמבשלות בבית נרשמות כצרכניות ואז מפרסמות מוצרים דרך /neighbor — אין צורך באישור.

**איך מוצאים בתי עסק**
- דף הבית מציג קטגוריות (בשר, ירקות, חלב, לחם, שמנים, טיפוח) — לחיצה על קטגוריה מסננת את הרשימה.
- /map מציג את כל בתי העסק על מפה אינטראקטיבית. אפשר לסנן לפי עיר, לעקוב אחרי קטגוריה ספציפית מהמקרא, וללחוץ על "חפשי באזור זה" אחרי שמזיזים את המפה.
- אפשר ללחוץ על "קרוב אלי" בתחתית המפה כדי למרכז על המיקום הנוכחי.
- כל כרטיסיית עסק כוללת כפתור WhatsApp להתחלת שיחה ישירה עם בעלת העסק.

**איך מפרסמים מוצר ביתי במהמטבח של השכן**
- צריך להיות מחוברת. נכנסות ל-/neighbor ולוחצות על כפתור "פרסמי מוצר" הצף בתחתית המסך.
- ממלאות את הטופס: כותרת, תיאור, מחיר, קטגוריה, תאריכי הכנה ותפוגה, אלרגנים, ותמונה.
- כל מוצר עובר מודרציה אוטומטית — הרוב מאושר מיידית; חלק מסומנים "בבדיקה" לזמן קצר; דברים פוגעניים נחסמים.
- הכתובת המדויקת לא נחשפת — רק עיר ושכונה.

**שימי לב**
- אם נשאלת על משהו שלא כתוב כאן (תקלה טכנית, החזר כספי, בעיה עם בעלת עסק) — הפני אותה לטופס יצירת הקשר ב-/about או דרך footer האתר.
- אל תתחזי לבעלת עסק או לצוות האתר — את עוזרת AI."""


# ---------- request/response schemas ----------

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    # Full conversation history. Client tracks the state and re-sends
    # each turn — the API is stateless. We trim server-side as a backstop.
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)


class ChatResponse(BaseModel):
    reply: str


# ---------- Anthropic client (lazy, mirrors home_product_moderation) ----------

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not settings.anthropic_api_key:
        return None
    try:
        import anthropic
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        return _client
    except Exception as e:  # pragma: no cover — defensive
        logger.warning("anthropic client init failed for chat: %s", e)
        return None


# ---------- endpoint ----------

@router.post("", response_model=ChatResponse)
@limiter.limit("10/minute")  # SECURITY: chat is unauth + costs $$, lock it down
@limiter.limit("30/hour")
def chat(request: Request, body: ChatRequest) -> ChatResponse:
    """Answer a user question about mehamakor.online via Claude Haiku 4.5."""
    client = _get_client()
    if client is None:
        # Fail-open friendly message — UI keeps working.
        return ChatResponse(
            reply="העוזרת לא זמינה כרגע 🌿 נסי שוב בעוד כמה רגעים, או פני אלינו דרך טופס יצירת הקשר באודות.",
        )

    # Trim to the last MAX_HISTORY_TURNS turns. A "turn" here = one
    # message regardless of role (the API just wants alternation, and
    # the UI guarantees it). Cap = 2 * MAX_HISTORY_TURNS messages.
    history = body.messages[-(MAX_HISTORY_TURNS * 2):]

    # Convert to the Messages API shape. ChatMessage.role is already
    # restricted to user|assistant by Pydantic.
    api_messages = [{"role": m.role, "content": m.content} for m in history]

    # First message must be user; if the trim left us with an
    # assistant-first slice, drop it. (Shouldn't happen with a sane
    # client, but defense in depth.)
    while api_messages and api_messages[0]["role"] != "user":
        api_messages.pop(0)
    if not api_messages:
        raise HTTPException(status_code=400, detail="Empty conversation after trim")

    try:
        response = client.messages.create(
            model=CHAT_MODEL,
            max_tokens=MAX_OUTPUT_TOKENS,
            system=SYSTEM_PROMPT,
            messages=api_messages,
        )
    except Exception as e:  # pragma: no cover — network/quota
        logger.warning("chat completion failed: %s", e)
        return ChatResponse(
            reply="משהו השתבש בצד שלי 🌱 נסי שוב בעוד רגע. אם זה נמשך — דווחי לנו דרך טופס יצירת הקשר.",
        )

    # Pull the first text block out of the response.content list.
    reply = next((b.text for b in response.content if b.type == "text"), "")
    if not reply:
        # Empty response is not expected but handle it gracefully.
        reply = "לא הצלחתי להבין את השאלה — אפשר לנסות לנסח אותה מחדש?"

    return ChatResponse(reply=reply)
