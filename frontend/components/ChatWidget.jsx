"use client";

import { useEffect, useRef, useState } from "react";
import { ChatCircleDots, X, PaperPlaneTilt } from "@phosphor-icons/react";
import api from "@/lib/api";

/**
 * ChatWidget — floating Q&A bot, all screen sizes.
 *
 * Launcher:
 *   Mobile: icon-only circle. bottom-32 when cookie banner visible,
 *     bottom-20 when dismissed. right-4. z-1100. (rtl-ok: comment-only)
 *   Desktop: pill with text on first visit, icon-only after user has
 *     opened once (chatWasOpened in localStorage). bottom-6 right-6. (rtl-ok: comment-only)
 *   Clean: no X, no badge, no dot. Tap to toggle open/close.
 *
 * Panel:
 *   Mobile: full-width from bottom. Desktop: 360px bottom-right.
 *
 * Coexistence: listens for "cookie-consent" CustomEvent from
 * CookieBanner to reposition. Reads "cookieConsent" from localStorage.
 */

// TODO MEH-543: i18n after /neighbor activation post-launch
const OPENING_MESSAGE = {
  role: "assistant",
  content: "היי 🌿 אני כאן לעזור! אפשר לשאול אותי איך נרשמים, איך מוצאים בתי עסק, או איך מפרסמים מוצר ביתי. מה תרצי לדעת?",
};

// Suggested prompts — restructured April 2026 (feature/chatbot-plain-hebrew-v2)
// around the mental model of a first-time visitor. The old list mixed early-
// funnel questions ("what is this site?") with later-stage ones ("how do I
// report a problem?") in random order, and phrased "האישור" without saying
// what was being approved. New grouping:
//   1-3: canonical hardcoded answers (see HARDCODED_ANSWERS)
//   4-5: visitor orientation — "what is this?" + "is it free?"
//   6:   buyer — contacting a business
//   7:   visitor/buyer curiosity — the "neighbor's kitchen" section
//   8:   seller follow-up — how long until their business is approved
// Dropped: "איך מדווחים על בעיה?" (later-stage concern, not a first-visit Q).
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
//
// v2 rewrite (feature/chatbot-plain-hebrew-v2): plain everyday Hebrew,
// active voice on approval ("הצוות שלנו בודק ומאשר" not "מאושר"),
// explicit about WHAT is being approved ("העסק שלך" / "המוצר שלך"),
// and specific timeframes ("תוך יום-יומיים" / "תוך שעות ספורות")
// instead of vague "תוך זמן קצר". No tech jargon like "מודרציה" /
// "פרופיל" — we say "העסק שלך" because that's what the user thinks
// they're registering.
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
  const [messages, setMessages] = useState([OPENING_MESSAGE]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // ── Responsive: desktop vs mobile ──
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const h = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  // ── Cookie banner visibility (for mobile positioning) ──
  const [bannerUp, setBannerUp] = useState(false);
  useEffect(() => {
    const check = () => {
      try {
        const v = localStorage.getItem("cookieConsent");
        setBannerUp(v !== "all" && v !== "essential");
      } catch (e) { setBannerUp(false); }
    };
    check();
    window.addEventListener("cookie-consent", check);
    return () => window.removeEventListener("cookie-consent", check);
  }, []);

  // ── "chatWasOpened" — shrink desktop pill to icon after first use ──
  const [wasOpened, setWasOpened] = useState(true); // default icon-only until checked
  useEffect(() => {
    try { setWasOpened(localStorage.getItem("chatWasOpened") === "true"); }
    catch (e) { setWasOpened(false); }
  }, []);

  const handleOpen = () => {
    setOpen(true);
    if (!wasOpened) {
      setWasOpened(true);
      try { localStorage.setItem("chatWasOpened", "true"); } catch (e) {}
    }
  };

  // ── Standard chat effects ──
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  useEffect(() => {
    if (open && inputRef.current) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open]);

  // ── Send message logic ──
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
    } finally { setSending(false); }
  };

  const handleSubmit = (e) => { e.preventDefault(); sendMessage(input); };

  // ── Positioning (all inline — no Tailwind specificity fights) ──
  const mobileBottom = bannerUp ? 128 : 80; // bottom-32 vs bottom-20
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

  // Desktop pill with text on first visit, icon-only after; mobile always icon-only.
  const showPillText = isDesktop && !wasOpened;

  return (
    <>
      {/* ── Launcher ── */}
      <button
        type="button"
        onClick={open ? () => setOpen(false) : handleOpen}
        style={launcherStyle}
        className={[
          "flex items-center justify-center bg-primary text-white rounded-full shadow-[0_4px_24px_rgba(46,104,83,0.25)] hover:bg-primary-dark transition focus-visible:ring-2 focus-visible:ring-primary/40",
          showPillText ? "gap-2 px-4 py-3" : "w-12 h-12",
        ].join(" ")}
        aria-label={open ? "סגרי את הצ׳אט" : "שאלי אותנו"}
        aria-expanded={open}
      >
        {open ? <X size={22} weight="bold" /> : <ChatCircleDots size={22} weight="duotone" />}
        {showPillText && !open && <span className="font-body text-sm">שאלה? שאלי אותי</span>}
      </button>

      {/* ── Chat panel ── */}
      {open && (
        <div
          style={panelStyle}
          className="flex flex-col bg-background border border-border shadow-[0_8px_32px_rgba(46,104,83,0.18)] overflow-hidden"
          role="dialog"
          aria-modal="false"
          aria-label="עוזרת מהמקור"
        >
          {/* Header */}
          <div className="bg-primary text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ChatCircleDots size={20} weight="duotone" aria-hidden="true" />
              <span className="font-headline font-bold text-base">שאלי אותנו</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-2 rounded-full hover:bg-white/10 transition focus-visible:ring-2 focus-visible:ring-white/40"
              aria-label="סגרי את חלון העוזרת"
            >
              <X size={18} weight="bold" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
            role="log" aria-live="polite" aria-label="שיחה עם העוזרת"
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
                  <button key={p} type="button" onClick={() => sendMessage(p)}
                    className="text-right text-xs text-primary bg-light hover:bg-light/70 border border-border rounded-[8px] px-3 py-2 transition focus-visible:ring-2 focus-visible:ring-primary/40"
                  >{p}</button>
                ))}
              </div>
            )}
          </div>

          {/* Composer */}
          <form onSubmit={handleSubmit} className="border-t border-border bg-white px-3 py-2 flex items-center gap-2">
            <label htmlFor="chat-input" className="sr-only">הקלידי שאלה</label>
            <input
              ref={inputRef} id="chat-input" type="text"
              value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="הקלידי שאלה..." maxLength={500} disabled={sending}
              className="flex-1 min-w-0 bg-transparent outline-none text-sm text-site-text placeholder:text-site-muted disabled:opacity-60"
              style={{ caretColor: "#2e6853" }}
              autoComplete="off"
            />
            <button
              type="submit" disabled={sending || !input.trim()}
              className="bg-primary text-white p-2 rounded-full hover:bg-primary-dark transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label="שלחי שאלה"
            >
              <PaperPlaneTilt size={16} weight="fill" style={{ transform: "scaleX(-1)" }} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
