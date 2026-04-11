"use client";

import { useEffect, useRef, useState } from "react";
import { ChatCircleDots, X, PaperPlaneTilt } from "@phosphor-icons/react";
import api from "@/lib/api";

/**
 * ChatWidget — floating Q&A bot that answers questions about mehamakor.online
 * via the backend `/chat` endpoint (Claude Haiku 4.5 with a Hebrew system
 * prompt scoped to site usage).
 *
 * Design:
 *   - Floating button bottom-LEFT (bottom-6 left-6) — opposite the
 *     existing "near me" map button which sits bottom-right inside the
 *     map container; doesn't conflict with anything global.
 *   - **Desktop only** (`hidden md:flex`) per spec. Mobile real estate
 *     is already taken by BottomNav + cookies banner; chat goes in
 *     phase 2.
 *   - Open state shows a 360px panel with brand styling: cream bg,
 *     primary green header, rounded 16px, soft shadow tinted with the
 *     brand primary (CLAUDE.md design rule).
 *   - Conversation state lives in this component — refreshing the page
 *     wipes it. That's intentional for an MVP help-bot; persistence
 *     would mean storing per-user history server-side, which is
 *     scope-creep.
 *   - First-open seeds an opening assistant message so the empty state
 *     doesn't look broken.
 *   - prefers-reduced-motion is honored: panel just appears, no slide.
 *
 * Server contract (see backend/app/routers/chat.py):
 *   POST /api/chat
 *   { messages: [{ role: "user"|"assistant", content: string }, ...] }
 *   → { reply: string }
 *
 * The backend is rate-limited (10/min, 30/hour per IP). On 429 we
 * surface a friendly Hebrew message; on any other error we surface a
 * generic "try again" without exposing the error.
 */

const OPENING_MESSAGE = {
  role: "assistant",
  content: "היי 🌿 אני העוזרת של מהמקור. אפשר לשאול אותי איך נרשמים, איך מוצאים בתי עסק, או איך מפרסמים מוצר ביתי. מה תרצי לדעת?",
};

const SUGGESTED_PROMPTS = [
  "איך נרשמים כבעלת עסק?",
  "איך מוצאים עסקים קרובים אליי?",
  "איך מפרסמים מוצר ביתי?",
  "האם ההרשמה בחינם?",
  "כמה זמן לוקח האישור?",
  "איך יוצרים קשר עם בית עסק?",
  'מה זה "מהמטבח של השכן"?',
  "איך מדווחים על בעיה?",
];

// Hardcoded answers for the three canonical suggested prompts.
// Clicking one of these returns an instant, consistent, free response —
// no API call, no model drift, no Anthropic cost. Freeform questions
// (including any of the 5 other suggested prompts that aren't in this
// map) still go to Claude Haiku via POST /chat, which uses the matching
// knowledge-base sections in backend/app/routers/chat.py::SYSTEM_PROMPT
// so the answers stay consistent with these canonical ones.
//
// Keys MUST match the suggested-prompt strings above exactly (byte-for-
// byte) — the match check is a plain object lookup in sendMessage.
const HARDCODED_ANSWERS = {
  "איך נרשמים כבעלת עסק?":
    "בעלות עסק נרשמות דרך טופס הרשמה פשוט בן 3 שלבים — חינם לגמרי! 🎉\nאחרי שליחת הטופס, הצוות שלנו בודק את הפרטים ומאשר את הפרופיל שלך תוך זמן קצר.",
  "איך מוצאים עסקים קרובים אליי?":
    "יש שתי דרכים קלות:\n\n1. המפה שלנו — לחצי על 'קרוב אלי' ותראי את כל בתי העסק סביבך, עם סינון לפי קטגוריה.\n2. דף הבית — חפשי לפי קטגוריה ועיר.\n\nכל עסק כולל כפתור WhatsApp ישיר לבעלת העסק! 😊",
  "איך מפרסמים מוצר ביתי?":
    "נכנסי לעמוד 'מהמטבח של השכן', לחצי על 'פרסמי מוצר', מלאי את הטופס — וזהו! 🎉\nהמוצר שלך מאושר בדרך כלל תוך שעות ספורות. הכתובת המדויקת שלך לא נחשפת — רק העיר והשכונה.",
};

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([OPENING_MESSAGE]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to the newest message whenever the list grows.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  // When the panel opens, focus the input so the user can type immediately.
  useEffect(() => {
    if (open && inputRef.current) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Esc closes the panel — standard accessible dialog behavior.
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const sendMessage = async (text) => {
    const trimmed = (text || "").trim();
    if (!trimmed || sending) return;

    setError("");
    // Optimistic append: show user message immediately, then call API.
    const nextMessages = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");

    // Shortcut: if the user clicked (or typed verbatim) one of the three
    // canonical suggested prompts, return the hardcoded answer instantly
    // without going through Claude. See HARDCODED_ANSWERS at the top of
    // this file for the rationale (consistent copy, zero cost, zero
    // latency for the most-clicked prompts).
    if (HARDCODED_ANSWERS[trimmed]) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: HARDCODED_ANSWERS[trimmed] },
      ]);
      return;
    }

    setSending(true);

    try {
      // The opening message is UI fluff — don't send it to the model.
      // The model has its own system prompt; the seed greeting would
      // just inflate the prefix.
      const apiMessages = nextMessages
        .filter((m, i) => !(i === 0 && m === OPENING_MESSAGE))
        .map(({ role, content }) => ({ role, content }));

      const res = await api.post("/chat", { messages: apiMessages });
      const reply = res.data?.reply || "לא הצלחתי להבין את השאלה — אפשר לנסח אותה שוב?";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      // Rate limit (429) gets a specific message; everything else falls
      // through to a friendly generic.
      if (e.response?.status === 429) {
        setError("שלחת הרבה הודעות בזמן קצר — נסי שוב בעוד דקה 🌱");
      } else {
        setError("משהו השתבש 🌱 נסי שוב בעוד רגע");
      }
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <>
      {/* Floating launcher button — desktop only.
          bottom-LEFT per spec, opposite the existing rightside controls. */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="hidden md:flex fixed bottom-6 left-6 z-[900] items-center gap-2 bg-primary text-white px-4 py-3 rounded-full shadow-[0_4px_24px_rgba(46,104,83,0.25)] hover:bg-primary-dark transition focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label="פתחי את העוזרת של מהמקור"
        >
          <ChatCircleDots size={22} weight="duotone" />
          <span className="font-body text-sm">שאלה? שאלי אותי</span>
        </button>
      )}

      {/* Chat panel — desktop only.
          Width 360px, max-height bound to viewport so the input stays in view. */}
      {open && (
        <div
          className="hidden md:flex fixed bottom-6 left-6 z-[900] w-[360px] max-h-[min(560px,80vh)] flex-col bg-background border border-border rounded-[16px] shadow-[0_8px_32px_rgba(46,104,83,0.18)] overflow-hidden"
          role="dialog"
          aria-modal="false"
          aria-label="עוזרת מהמקור"
        >
          {/* Header */}
          <div className="bg-primary text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ChatCircleDots size={20} weight="duotone" aria-hidden="true" />
              <span className="font-headline font-bold text-base">העוזרת של מהמקור</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 rounded-full hover:bg-white/10 transition focus-visible:ring-2 focus-visible:ring-white/40"
              aria-label="סגרי את חלון העוזרת"
            >
              <X size={18} weight="bold" />
            </button>
          </div>

          {/* Message list */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
            role="log"
            aria-live="polite"
            aria-label="שיחה עם העוזרת"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-[12px] text-sm leading-relaxed whitespace-pre-line ${
                    m.role === "user"
                      ? "bg-primary text-white"
                      : "bg-white text-site-text border border-border"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-end">
                <div className="bg-white text-site-muted border border-border px-3 py-2 rounded-[12px] text-sm">
                  <span className="inline-flex gap-1">
                    <span className="animate-pulse">●</span>
                    <span className="animate-pulse" style={{ animationDelay: "0.15s" }}>●</span>
                    <span className="animate-pulse" style={{ animationDelay: "0.3s" }}>●</span>
                  </span>
                </div>
              </div>
            )}
            {error && (
              <p
                role="status"
                className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-[8px] px-3 py-2"
              >
                {error}
              </p>
            )}
            {/* Suggested prompts — only shown when the conversation hasn't started yet */}
            {messages.length === 1 && !sending && (
              <div className="flex flex-col gap-2 pt-1">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => sendMessage(p)}
                    className="text-right text-xs text-primary bg-light hover:bg-light/70 border border-border rounded-[8px] px-3 py-2 transition focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={handleSubmit}
            className="border-t border-border bg-white px-3 py-2 flex items-center gap-2"
          >
            <label htmlFor="chat-input" className="sr-only">
              הקלידי שאלה
            </label>
            <input
              ref={inputRef}
              id="chat-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="הקלידי שאלה..."
              maxLength={500}
              disabled={sending}
              className="flex-1 min-w-0 bg-transparent outline-none text-sm text-site-text placeholder:text-site-muted disabled:opacity-60"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="bg-primary text-white p-2 rounded-full hover:bg-primary-dark transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label="שלחי שאלה"
            >
              {/* Phosphor PaperPlaneTilt is mirrored for RTL by inverting it
                  so the "send" tip points toward the message direction. */}
              <PaperPlaneTilt size={16} weight="fill" style={{ transform: "scaleX(-1)" }} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
