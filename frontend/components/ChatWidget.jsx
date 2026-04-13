"use client";

import { useEffect, useRef, useState } from "react";
import { ChatCircleDots, X, PaperPlaneTilt } from "@phosphor-icons/react";
import api from "@/lib/api";

/**
 * ChatWidget — floating Q&A bot for mehamakor.online.
 *
 * Positioning (all screen sizes, inline styles to avoid Tailwind conflicts):
 *   Desktop (≥ 768px): bottom-right corner, 24px from edge, z-9999.
 *   Mobile (< 768px): bottom-right, above BottomNav (80px).
 *     If CookieBanner is visible, bumps to 128px.
 *
 * Dismiss/restore (Intercom/Zendesk pattern):
 *   - Launcher has a small X button at top-left corner to dismiss.
 *   - Dismissed state saved to localStorage `chat_widget_dismissed`.
 *   - When dismissed, a tiny restore dot appears in its place.
 *   - Footer also has a "שאלות?" restore link.
 *   - `chat-widget-restore` CustomEvent re-shows the widget.
 *
 * CookieBanner coexistence:
 *   - CookieBanner fires `cookie-consent` CustomEvent on dismiss.
 *   - This component listens + re-reads localStorage to reposition.
 */

const DISMISS_KEY = "chat_widget_dismissed";
const COOKIE_KEY = "cookies_accepted";

const OPENING_MESSAGE = {
  role: "assistant",
  content: "היי 🌿 אני העוזרת של מהמקור. אפשר לשאול אותי איך נרשמים, איך מוצאים בתי עסק, או איך מפרסמים מוצר ביתי. מה תרצי לדעת?",
};

const SUGGESTED_PROMPTS = [
  "איך נרשמים כבעלת עסק?",
  "איך מוצאים עסקים קרובים אליי?",
  "איך מפרסמים מוצר ביתי?",
  "מה זה מהמקור?",
  "האם האתר בחינם?",
  "איך יוצרים קשר עם בית עסק?",
  'מה זה "מהמטבח של השכן"?',
  "כמה זמן לוקח האישור של העסק?",
];

const HARDCODED_ANSWERS = {
  "איך נרשמים כבעלת עסק?":
    "נרשמות דרך טופס פשוט בן 3 שלבים — חינם לגמרי! 🎉\nבדרך כלל תוך יום-יומיים הצוות שלנו בודק את הפרטים ומאשר את העסק שלך, ואז הוא מופיע באתר.",
  "איך מוצאים עסקים קרובים אליי?":
    "יש שתי דרכים קלות:\n\n1. המפה שלנו — לחצי על 'קרוב אלי' ותראי את כל בתי העסק סביבך, עם אפשרות לסינון לפי קטגוריה (בשר, חלב, ירקות וכו').\n2. דף הבית — חפשי לפי קטגוריה או עיר.\n\nבכל עסק יש כפתור WhatsApp שפותח שיחה ישירה עם בעלת העסק 😊",
  "איך מפרסמים מוצר ביתי?":
    "נכנסי לעמוד 'מהמטבח של השכן', לחצי על 'פרסמי מוצר', מלאי את הטופס — וזהו! 🎉\nהצוות שלנו בודק את המוצר שלך ומאשר אותו בדרך כלל תוך שעות ספורות, ואז הוא מופיע בדף. הכתובת המדויקת שלך לא נחשפת — רק העיר והשכונה.",
};

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(true); // start hidden until localStorage check
  const [messages, setMessages] = useState([OPENING_MESSAGE]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Desktop vs mobile detection
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const h = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  // Cookie banner visibility
  const [bannerVisible, setBannerVisible] = useState(false);
  useEffect(() => {
    const check = () => {
      try {
        const v = localStorage.getItem(COOKIE_KEY);
        setBannerVisible(v !== "all" && v !== "essential");
      } catch (e) { setBannerVisible(false); }
    };
    check();
    window.addEventListener("cookie-consent", check);
    return () => window.removeEventListener("cookie-consent", check);
  }, []);

  // Dismiss/restore persistence
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "true");
    } catch (e) { setDismissed(false); }
    const restore = () => {
      try { localStorage.removeItem(DISMISS_KEY); } catch (e) {}
      setDismissed(false);
    };
    window.addEventListener("chat-widget-restore", restore);
    return () => window.removeEventListener("chat-widget-restore", restore);
  }, []);

  const dismiss = (e) => {
    e.stopPropagation();
    try { localStorage.setItem(DISMISS_KEY, "true"); } catch (e2) {}
    setDismissed(true);
    setOpen(false);
  };

  const restore = () => {
    try { localStorage.removeItem(DISMISS_KEY); } catch (e) {}
    setDismissed(false);
  };

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  // Focus input on open
  useEffect(() => {
    if (open && inputRef.current) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const sendMessage = async (text) => {
    const trimmed = (text || "").trim();
    if (!trimmed || sending) return;
    setError("");
    const nextMessages = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    if (HARDCODED_ANSWERS[trimmed]) {
      setMessages((prev) => [...prev, { role: "assistant", content: HARDCODED_ANSWERS[trimmed] }]);
      return;
    }
    setSending(true);
    try {
      const apiMessages = nextMessages
        .filter((m, i) => !(i === 0 && m === OPENING_MESSAGE))
        .map(({ role, content }) => ({ role, content }));
      const res = await api.post("/chat", { messages: apiMessages });
      const reply = res.data?.reply || "לא הצלחתי להבין את השאלה — אפשר לנסח אותה שוב?";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      if (e.response?.status === 429) {
        setError("שלחת הרבה הודעות בזמן קצר — נסי שוב בעוד דקה 🌱");
      } else {
        setError("משהו השתבש 🌱 נסי שוב בעוד רגע");
      }
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e) => { e.preventDefault(); sendMessage(input); };

  // ─── Positioning (all inline to avoid Tailwind specificity issues) ───
  const mobileBottom = bannerVisible ? 128 : 80;
  const launcherStyle = {
    position: "fixed", zIndex: 9999,
    right: isDesktop ? 24 : 16,
    bottom: isDesktop ? 24 : mobileBottom,
  };
  const panelStyle = {
    position: "fixed", zIndex: 9999,
    bottom: isDesktop ? 24 : 0,
    right: isDesktop ? 24 : 0,
    left: isDesktop ? "auto" : 0,
    width: isDesktop ? 360 : "100%",
    maxHeight: isDesktop ? "min(560px, 80vh)" : "80vh",
    borderRadius: isDesktop ? 16 : "16px 16px 0 0",
  };
  const restoreDotStyle = {
    position: "fixed", zIndex: 9999,
    right: isDesktop ? 24 : 16,
    bottom: isDesktop ? 24 : mobileBottom,
  };

  // ─── Dismissed: show tiny restore dot ───
  if (dismissed && !open) {
    return (
      <button
        type="button"
        onClick={restore}
        style={restoreDotStyle}
        className="w-11 h-11 flex items-center justify-center rounded-full bg-primary/80 text-white shadow-md hover:bg-primary transition"
        aria-label="פתחי את העוזרת"
        title="שאלות?"
      >
        <ChatCircleDots size={20} weight="fill" />
      </button>
    );
  }

  return (
    <>
      {/* ─── Launcher button — clean, no X ─── */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={launcherStyle}
          className="flex items-center gap-2 bg-primary text-white px-4 py-3 rounded-full shadow-[0_4px_24px_rgba(46,104,83,0.25)] hover:bg-primary-dark transition focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label="פתחי את העוזרת של מהמקור"
        >
          <ChatCircleDots size={22} weight="duotone" />
          <span className="font-body text-sm">שאלה? שאלי אותי</span>
        </button>
      )}

      {/* ─── Chat panel ─── */}
      {open && (
        <div
          style={panelStyle}
          className="flex flex-col bg-background border border-border shadow-[0_8px_32px_rgba(46,104,83,0.18)] overflow-hidden"
          role="dialog"
          aria-modal="false"
          aria-label="עוזרת מהמקור"
        >
          {/* Header — X closes/minimizes only */}
          <div className="bg-primary text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ChatCircleDots size={20} weight="duotone" aria-hidden="true" />
              <span className="font-headline font-bold text-base">העוזרת של מהמקור</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-full hover:bg-white/10 transition focus-visible:ring-2 focus-visible:ring-white/40"
              aria-label="סגרי את חלון העוזרת"
            >
              <X size={18} weight="bold" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
            role="log"
            aria-live="polite"
            aria-label="שיחה עם העוזרת"
          >
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-[12px] text-sm leading-relaxed whitespace-pre-line ${
                  m.role === "user" ? "bg-primary text-white" : "bg-white text-site-text border border-border"
                }`}>
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
              <p role="status" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-[8px] px-3 py-2">
                {error}
              </p>
            )}
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
          <form onSubmit={handleSubmit} className="border-t border-border bg-white px-3 py-2 flex items-center gap-2">
            <label htmlFor="chat-input" className="sr-only">הקלידי שאלה</label>
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
              style={{ caretColor: "#2e6853" }}
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="bg-primary text-white p-2 rounded-full hover:bg-primary-dark transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label="שלחי שאלה"
            >
              <PaperPlaneTilt size={16} weight="fill" style={{ transform: "scaleX(-1)" }} />
            </button>
          </form>

          {/* Dismiss link — bottom of the chat window */}
          <button
            type="button"
            onClick={dismiss}
            className="text-[11px] text-site-muted hover:text-site-text py-1.5 text-center transition border-t border-border bg-white"
          >
            × הסתר את העוזרת
          </button>
        </div>
      )}
    </>
  );
}
