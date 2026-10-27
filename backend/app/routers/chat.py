"""Chat assistant router — answers questions about mehamakor.online via Claude.

A small Q&A bot users can open from the floating widget on the homepage.
Users get answers to "how do I register?", "how do I find a producer?",
"how do I post a home listing?" — without having to leave the page.

Design notes:
  - Uses the fast-tier Haiku (app.config.AI_FAST_MODEL — Haiku 5.5 since
    MEH-2335). The questions are short, the answers should be short, and we
    expect MVP-scale traffic so per-call cost matters.
  - System prompt is in Hebrew. The bot persona is feminine, but it
    addresses users in neutral plural voice (MEH-940), scoped tightly to
    the site so the bot doesn't drift into general-purpose chitchat.
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

import json
import logging

from fastapi import APIRouter, HTTPException, Request

from app.config import AI_FAST_MODEL, ai_fast_request_kwargs, settings
from app.rate_limit import limiter

# MEH-460 Pkg 4: schemas relocated to app.schemas.schemas per ADR-006 R1.
from app.schemas.schemas import ChatRequest, ChatResponse
from app.services import chat_db_tools, chat_intent_router

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

# MEH-2335: the fast-tier model lives in one place — app.config.AI_FAST_MODEL
# (Haiku 5.5, whose ID has no date suffix). Not `settings.anthropic_model`,
# which is opus-tier and only used by the home-products path.
CHAT_MODEL = AI_FAST_MODEL

# Cap on conversation length sent to the API. Each turn is a user msg
# + assistant msg, so 10 = 20 messages = ~2-3K tokens of history.
MAX_HISTORY_TURNS = 10

# Cap on output tokens — the bot should answer in 2-3 sentences, not
# write essays. Keeps cost predictable and the UX snappy. 520 = the old
# 400 + ~30%: Haiku 5.5's tokenizer counts the same text as ~30% more
# tokens (MEH-2335), so this keeps the same answer length.
MAX_OUTPUT_TOKENS = 520

# Hebrew system prompt — scoped tightly to the site. The bot persona is
# feminine, but it addresses users in neutral plural voice (MEH-940) per
# the brand voice ADR / COPY_BANK.
#
# feature/chatbot-plain-hebrew-v2 (April 2026): rewrite for plain
# everyday Hebrew after user feedback that v1 still used tech jargon
# ("מודרציה", "פרופיל") and vague approval language that didn't say
# WHAT was being approved. v2 rules the model is instructed to follow:
#   - everyday Hebrew, like explaining to a friend, not a tech manual
#   - no "מודרציה" — use "בדיקה" / "אישור"
#   - never say "הפרופיל מאושר" — say "העסק שלך מאושר"
#   - active voice ("הצוות שלנו בודק ומאשר") not passive ("מאושר אוטומטית")
#   - specific timeframe: עסק = "עד 3 ימי עסקים" (MEH-1347 — unified
#     with the registration-success screen + dashboard review banner)
#
# The two canonical Q&As (register as business / find nearby) are ALSO
# answered client-side without an API call — clicking a suggested prompt
# short-circuits to canned copy. This prompt still drives freeform
# questions, so the knowledge base here MUST stay consistent with it.
#
# MEH-2100 — WHERE that canned copy lives, corrected: this comment used to
# say "ChatWidget.jsx's HARDCODED_ANSWERS map". That map no longer exists.
# MEH-1617 deleted it (a text-keyed lookup silently missed on /en) and moved
# the copy into i18n; ChatWidget now holds only an id SET
# (ANSWERED_PROMPT_IDS) and renders t(`answers.<id>`). The real twin of the
# paragraph below is therefore `chat.answers.register` in
# frontend/messages/he.json (+ the en.json twin), and that is the file to
# edit in lockstep with this one.
#
# MEH-2100 — and NO EMOJI in either. This line carried a 🎉 that he.json
# could not match, because NoEmojiInMessages.test.js (MEH-1661) reds vitest
# on any emoji in messages/*.json outside a 5-entry allowlist of outbound
# wa.me/share payloads — and this string is UI chrome, not an outbound
# payload. So the two surfaces could never be byte-identical while the emoji
# stood. Sapir's call, 16/08: drop it from both rather than widen the
# allowlist. Do not re-add it here without changing that guard first.
SYSTEM_PROMPT = """את העוזרת הווירטואלית של מהמקור — האתר שלנו מרכז בתי עסק מקומיים לאוכל אמיתי, כולם במקום אחד.

המשימה שלך: לענות לגולשים שאלות על השימוש באתר. עני בעברית יומיומית ופשוטה — כמו להסביר לחבר, לא כמו מדריך טכני. 2-3 משפטים קצרים, טון חם ונעים, ופני אל הגולשים בלשון רבים ניטרלית (לא נקבה יחיד). אל תשתמשי במונחים טכניים כמו "מודרציה" או "פרופיל" — במקום זה פשוט אמרי "בדיקה" או "אישור", ו"העסק שלך". תמיד הבהירי מה בדיוק מאושר (העסק שלך). אל תמציאי תשובות שאינך בטוחה בהן. כשגולשים שואלים אחת מהשאלות המכוסות למטה, השתמשי בניסוח שנמצא שם כבסיס לתשובה שלך — הוא כתוב בדיוק בסגנון הזה.

מה את יודעת על האתר:

**מה זה מהמקור**
מהמקור זה אתר שמחבר בין אנשים שמחפשים אוכל אמיתי ומקומי לבין בתי עסק מקומיים — בשר במרעה, לחם מחמצת, גבינות, ירקות אורגניים ועוד. אפשר לחפש לפי קטגוריה, לפי עיר, או על המפה לפי קרבה אליכם, ולדבר ישירות עם בית העסק.

**האם האתר בחינם**
כן, לגמרי חינם — גם לגולשים שמחפשים אוכל, וגם לבתי עסק שרוצים להירשם ולהופיע באתר. אין עמלות על עסקאות. הדף הבסיסי חינם — תמיד. — הלקוחות פונים ישירות לבית העסק, והתשלום עובר ביניהם בלבד.

**איך נרשמים כבית עסק**
נרשמים דרך טופס קצר — חינם לגמרי! אחרי ההרשמה משלימים את הפרופיל בלוח הבקרה (תמונה, מוצר ראשון), שולחים לבדיקה — והצוות שלנו בודק ומאשר את העסק שלך עד 3 ימי עסקים, ואז הוא מופיע באתר.

**איך נרשמים כלקוחות**
- לקוחות נרשמים חינם בדף ההרשמה (אימייל + סיסמה, או Google/Apple).

**איך מוצאים בתי עסק קרובים**
יש שתי דרכים קלות:
1. המפה שלנו — לחצו על 'קרוב אלי' ותראו את כל בתי העסק סביבכם, עם אפשרות לסינון לפי קטגוריה (בשר, חלב, ירקות וכו').
2. דף הבית — חפשו לפי קטגוריה או עיר.

בכל עסק יש כפתור ליצירת קשר ישיר עם בית העסק — לרוב וואטסאפ, ולפעמים טלפון או ערוץ אחר שבית העסק בחר 😊

**עוד נושאים שגולשים שואלים**
- **כמה זמן לוקח האישור של העסק?** — אחרי שבית עסק ממלא את טופס ההרשמה, הצוות שלנו בודק את הפרטים ובדרך כלל מאשר את העסק שלו עד 3 ימי עסקים. מרגע האישור העסק מופיע באתר וגולשים יכולים למצוא אותו במפה ובחיפוש.
- **איך יוצרים קשר עם בית עסק?** — בכל עסק יש כפתור ליצירת קשר ישיר עם בית העסק — לרוב וואטסאפ, ולפעמים טלפון או ערוץ אחר שבית העסק בחר. אפשר גם לראות את הטלפון, האינסטגרם והאתר אם הוסיפו אותם.
- **איך מדווחים על בעיה?** — בכל עמוד של עסק או מוצר יש כפתור "דווח על עסק". אפשר גם לפנות אלינו ישירות דרך טופס יצירת הקשר שבדף "אודות" — הצוות שלנו יטפל בפנייה בהקדם.

**שימי לב**
- אם נשאלת על משהו שלא כתוב כאן (תקלה טכנית, החזר כספי, בעיה עם בית עסק) — הפני אותם לטופס יצירת הקשר שבדף "אודות" או דרך הלינק בתחתית האתר.
- אל תתחזי לבית עסק או לצוות האתר — את עוזרת AI.

**פורמט התשובה**
עני בטקסט פשוט בלבד. אל תשתמשי ב-markdown, כוכביות (`**`), bold, כותרות עם `#`, רשימות עם `-` או `*`, או כל סימן פורמט אחר. כתבי כמו שמדברים בצ'אט — רק המילים עצמן."""


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


# ---------- live data (MEH-586) ----------

# Per-IP cap on the DB-tool path, on top of the route's 10/minute + 30/hour.
# A tool call is one classifier call + one query + the answer call, so it is
# the costliest path; over the cap the question still gets answered, from the
# fixed knowledge only.
DB_QUERY_LIMIT = "5/minute"

# Appended to SYSTEM_PROMPT only for a db_query turn. Hebrew copy lives in
# the MEH-586 card; the model phrases the answer, the JSON is data.
LIVE_DATA_PREAMBLE = (
    "נתונים חיים מהאתר לשאלה האחרונה (JSON). עני רק על סמך הנתונים האלה: "
    "ציטטי מספרים ושמות כפי שהם, ואל תוסיפי בתי עסק או אירועים שלא מופיעים כאן. "
    "אם results ריק או count הוא 0 — אמרי שלא מצאת כרגע, והציעי לחפש במפה או בעמוד האירועים."
)


def _db_query_allowed(request: Request) -> bool:
    """MEH-586: per-tool 5/minute cap keyed like the route limits. Any failure
    to evaluate the cap counts as NOT allowed — the freeform path still
    answers, so denying is the cheap, safe side."""
    try:
        from limits import parse as parse_limit

        key = limiter._key_func(request)
        return bool(limiter._limiter.hit(parse_limit(DB_QUERY_LIMIT), "chat_db", key))
    except Exception as e:  # noqa: BLE001 — cap is best-effort, logged
        logger.warning("chat db_query cap unavailable: %s", e)
        return False


def _live_data_context(
    client, request: Request, api_messages: list[dict]
) -> str | None:
    """Route the latest user message; on db_query run the bounded tool and
    return a system-prompt addendum with the JSON result. None on any
    freeform / failure / over-cap outcome (fail-open to the existing flow).
    """
    latest = next(
        (m["content"] for m in reversed(api_messages) if m["role"] == "user"), ""
    )
    categories = chat_db_tools.list_category_slugs()
    decision = chat_intent_router.classify(client, latest, categories)
    if decision.route != chat_intent_router.ROUTE_DB or not decision.tool:
        return None
    if not _db_query_allowed(request):
        return None
    try:
        result = chat_db_tools.run_tool(decision.tool, decision.params)
    except chat_db_tools.ChatDbToolError:
        return None
    payload = json.dumps(
        {"tool": decision.tool, "data": result}, ensure_ascii=False, default=str
    )
    return f"{LIVE_DATA_PREAMBLE}\n{payload}"


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
            reply="העוזרת לא זמינה כרגע 🌿 נסו שוב בעוד כמה רגעים, או פנו אלינו דרך טופס יצירת הקשר באודות.",
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

    # MEH-586: hybrid — a db_query turn gets the live JSON appended to the
    # fixed knowledge; everything else is the unchanged freeform flow.
    system_prompt = SYSTEM_PROMPT
    live = _live_data_context(client, request, api_messages)
    if live:
        system_prompt = f"{SYSTEM_PROMPT}\n\n{live}"

    try:
        response = client.messages.create(
            **ai_fast_request_kwargs(),
            max_tokens=MAX_OUTPUT_TOKENS,
            system=system_prompt,
            messages=api_messages,
        )
    except Exception as e:  # pragma: no cover — network/quota
        logger.warning("chat completion failed: %s", e)
        return ChatResponse(
            reply="משהו השתבש בצד שלי 🌱 נסו שוב בעוד רגע. אם זה נמשך — דווחו לנו דרך טופס יצירת הקשר.",
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
