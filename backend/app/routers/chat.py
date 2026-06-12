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

from fastapi import APIRouter, HTTPException, Request

from app.config import settings
from app.rate_limit import limiter

# MEH-460 Pkg 4: schemas relocated to app.schemas.schemas per ADR-006 R1.
from app.schemas.schemas import ChatRequest, ChatResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

# claude-haiku-4-5 is the cheapest production model. Hard-coded here
# because the system-wide `settings.anthropic_model` is opus-tier and
# tuned for moderation accuracy, not chatbot cost.
#
# IMPORTANT: use the date-suffixed model ID (`claude-haiku-4-5-20251001`),
# NOT the bare alias (`claude-haiku-4-5`). The bare alias was rejected by
# the Anthropic API in production, causing every chat call to silently
# fail-open with the offline message. The date-suffixed form is the
# canonical model ID per Anthropic's docs and works reliably. If you
# upgrade to a newer Haiku, swap the date — the prefix stays the same.
CHAT_MODEL = "claude-haiku-4-5-20251001"

# Cap on conversation length sent to the API. Each turn is a user msg
# + assistant msg, so 10 = 20 messages = ~2-3K tokens of history.
MAX_HISTORY_TURNS = 10

# Cap on output tokens — the bot should answer in 2-3 sentences, not
# write essays. Keeps cost predictable and the UX snappy.
MAX_OUTPUT_TOKENS = 400

# Hebrew system prompt — scoped tightly to the site. Feminine voice
# matches the rest of the UI per CLAUDE.md micro-copy rules.
#
# feature/chatbot-plain-hebrew-v2 (April 2026): rewrite for plain
# everyday Hebrew after user feedback that v1 still used tech jargon
# ("מודרציה", "פרופיל") and vague approval language that didn't say
# WHAT was being approved. v2 rules the model is instructed to follow:
#   - everyday Hebrew, like explaining to a friend, not a tech manual
#   - no "מודרציה" — use "בדיקה" / "אישור"
#   - never say "הפרופיל מאושר" — say "העסק שלך מאושר"
#   - active voice ("הצוות שלנו בודק ומאשר") not passive ("מאושר אוטומטית")
#   - specific timeframe: עסק = "תוך יום-יומיים"
#
# The two canonical Q&As (register as business / find nearby) are also
# hardcoded client-side in ChatWidget.jsx's HARDCODED_ANSWERS map —
# clicking a suggested prompt short-circuits the API call and returns
# the exact copy below without going through Claude. This prompt still
# drives freeform questions and the other suggested prompts that don't
# have hardcoded answers, so the knowledge base here MUST stay
# consistent with the hardcoded copy.
SYSTEM_PROMPT = """את העוזרת הווירטואלית של מהמקור — האתר שלנו מרכז בתי עסק מקומיים לאוכל אמיתי, כולם במקום אחד.

המשימה שלך: לענות לגולשות שאלות על השימוש באתר. ענה בעברית יומיומית ופשוטה — כמו להסביר לחברה, לא כמו מדריך טכני. 2-3 משפטים קצרים, טון חם ונעים, לשון נקבה. אל תשתמשי במונחים טכניים כמו "מודרציה" או "פרופיל" — במקום זה פשוט אמרי "בדיקה" או "אישור", ו"העסק שלך". תמיד הבהירי מה בדיוק מאושר (העסק שלך). אל תמציאי תשובות שאינך בטוחה בהן. כשהגולשת שואלת אחת מהשאלות המכוסות למטה, השתמשי בניסוח שנמצא שם כבסיס לתשובה שלך — הוא כתוב בדיוק בסגנון הזה.

מה את יודעת על האתר:

**מה זה מהמקור**
מהמקור זה אתר שמחבר בין אנשים שמחפשים אוכל אמיתי ומקומי לבין בתי עסק מקומיים — בשר במרעה, לחם מחמצת, חלב גולמי, ירקות אורגניים ועוד. אפשר לחפש לפי קטגוריה, לפי עיר, או על המפה לפי קרבה אלייך, ולדבר ישירות עם בעלות העסק דרך WhatsApp.

**האם האתר בחינם**
כן, לגמרי חינם — גם לגולשות שמחפשות אוכל, וגם לבעלות עסק שרוצות להירשם ולהופיע באתר. בעלות עסק יכולות לבחור לשדרג לתוכנית פרמיום בהמשך (כדי להופיע בראש הרשימה), אבל זה לגמרי אופציונלי — ההרשמה הרגילה חינמית ומספיקה.

**איך נרשמים כבעלת עסק**
נרשמות דרך טופס פשוט בן 3 שלבים — חינם לגמרי! 🎉
בדרך כלל תוך יום-יומיים הצוות שלנו בודק את הפרטים ומאשר את העסק שלך, ואז הוא מופיע באתר.

**איך נרשמים כצרכנית**
- צרכניות נרשמות חינם בדף ההרשמה (אימייל + סיסמה, או Google/Apple).

**איך מוצאים בתי עסק קרובים**
יש שתי דרכים קלות:
1. המפה שלנו — לחצי על 'קרוב אלי' ותראי את כל בתי העסק סביבך, עם אפשרות לסינון לפי קטגוריה (בשר, חלב, ירקות וכו').
2. דף הבית — חפשי לפי קטגוריה או עיר.

בכל עסק יש כפתור WhatsApp שפותח שיחה ישירה עם בעלת העסק 😊

**עוד נושאים שגולשות שואלות**
- **כמה זמן לוקח האישור של העסק?** — אחרי שבעלת עסק ממלאת את טופס ההרשמה, הצוות שלנו בודק את הפרטים ובדרך כלל מאשר את העסק שלה תוך יום-יומיים. מרגע האישור העסק מופיע באתר וגולשות יכולות למצוא אותו במפה ובחיפוש.
- **איך יוצרים קשר עם בית עסק?** — בכל עמוד של עסק יש כפתור WhatsApp שפותח שיחה ישירה עם בעלת העסק. אפשר גם לראות את הטלפון, האינסטגרם והאתר אם הוסיפו אותם.
- **איך מדווחים על בעיה?** — בכל עמוד של עסק או מוצר יש כפתור "דווחי". אפשר גם לפנות אלינו ישירות דרך טופס יצירת הקשר שבדף "אודות" — הצוות שלנו יטפל בפנייה בהקדם.

**שימי לב**
- אם נשאלת על משהו שלא כתוב כאן (תקלה טכנית, החזר כספי, בעיה עם בעלת עסק) — הפני אותה לטופס יצירת הקשר שבדף "אודות" או דרך הלינק בתחתית האתר.
- אל תתחזי לבעלת עסק או לצוות האתר — את עוזרת AI.

**פורמט התשובה**
ענה בטקסט פשוט בלבד. אל תשתמשי ב-markdown, כוכביות (`**`), bold, כותרות עם `#`, רשימות עם `-` או `*`, או כל סימן פורמט אחר. כתבי כמו שמדברות בצ'אט — רק המילים עצמן."""


# Strip any leftover markdown syntax from Claude's response as
# defense-in-depth (MEH-31/32). The system prompt asks for plain text,
# but Claude occasionally reaches for **bold** anyway, especially on
# lists. Stripping `**` first then lone `*` keeps the visible text
# unchanged while removing the markup that renders as literal
# asterisks in the chat widget (which doesn't parse markdown).
def _strip_markdown(text: str) -> str:
    if not text:
        return text
    return (
        text.replace("**", "")  # bold
        .replace("__", "")  # alt bold
        .replace("*", "")  # lone emphasis
        .replace("_", "")  # alt emphasis (safe: we don't use Hebrew words with _)
        # Leading "# " heading markers at line starts — rare but defensive.
        .replace("\n# ", "\n")
        .replace("\n## ", "\n")
        .replace("\n### ", "\n")
    )


# ---------- Anthropic client (lazy, mirrors home_product_moderation) ----------

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not settings.anthropic_api_key:
        return None
    try:
        # Imports kept lazy so missing packages can't crash module load
        # (the rest of the backend stays up even if anthropic is broken).
        import anthropic
        import httpx

        # Construct an explicit httpx.Client() and pass it via the
        # Anthropic SDK's `http_client` kwarg. This bypasses the SDK's
        # internal call to `httpx.Client(proxies=...)`, which is broken
        # against httpx 0.28+ — that release dropped the `proxies=` kwarg
        # in favor of `proxy=` (singular), and the anthropic 0.39 SDK
        # didn't update its internal call. Symptom of the unfixed code:
        #     TypeError: Client.__init__() got an unexpected keyword
        #                argument 'proxies'
        # Caught by PR #29's debug instrumentation, fixed in PR #31.
        # The explicit `httpx.Client()` works against any httpx version
        # because we're constructing it ourselves with no kwargs, so we
        # don't have to chase the SDK-vs-transitive-dep version dance.
        _client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key,
            http_client=httpx.Client(),
        )
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
    history = body.messages[-(MAX_HISTORY_TURNS * 2) :]

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

    # MEH-31/32: strip any leftover markdown so the UI (which doesn't
    # parse it) doesn't render literal asterisks / underscores.
    reply = _strip_markdown(reply)

    return ChatResponse(reply=reply)
