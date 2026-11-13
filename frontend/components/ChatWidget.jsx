"use client";

import { useEffect, useRef, useState } from "react";
import { ChatCircleDots, X, PaperPlaneTilt } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import CollectionNotice from "@/components/CollectionNotice";
import { INERT_PRESENT } from "@/lib/inert-attr";

/**
 * ChatWidget — floating Q&A bot, all screen sizes.
 *
 * MEH-2499 (28/10) reverses MEH-1410 (21/07, desktop-only): the launcher is
 * back on mobile as an icon-only circle above the BottomNav pill. What made
 * MEH-1410 hide it — a second floating control stacked on bottom navigation —
 * was answered by hiding the launcher on scroll-down; since 4/11 it stays put
 * on every viewport (a launcher that moves read as broken on a phone).
 *
 * MEH-1617: every user-facing string moved to the `chat.*` namespace in
 * messages/{he,en}.json. The copy is UNCHANGED — a move, not a rewrite. The
 * one structural change is the suggested-prompt keying; see
 * ANSWERED_PROMPT_IDS below for why it had to change.
 *
 * Launcher:
 *   Mobile (MEH-2499): icon-only circle, always shown, pinned to
 *     the end/inline edge. MEH-850: bottom = safe-area + pill-clearance +
 *     var(--cookie-banner-h, 0) via calc() — it self-clears the cookie banner
 *     when shown and sits just above the BottomNav pill when dismissed. z 1050 (desktop launcher + panel: 9999).
 *   Desktop: pill with text on first visit, icon-only after user has opened
 *     once (chatWasOpened in localStorage). Inline style — 24px bottom, 24px
 *     inline-end. MEH-1135: positioned with logical `insetInlineEnd` (was
 *     physical `right`) so the FAB owns the bottom-END corner in every locale
 *     (RTL → physical left, LTR → physical right).
 *   Clean: no X, no badge, no dot. Tap to toggle open/close.
 *
 * Panel:
 *   Mobile: full-width from bottom. Desktop: 360px bottom-right.
 *
 * Coexistence: positioning reads the `--cookie-banner-h` CSS var published by
 * CookieBanner (MEH-850) — no JS event handshake.
 */

// Suggested prompts — restructured April 2026 (feature/chatbot-plain-hebrew-v2)
// around the mental model of a first-time visitor. The old list mixed early-
// funnel questions ("what is this site?") with later-stage ones ("how do I
// report a problem?") in random order, and phrased "האישור" without saying
// what was being approved. New grouping:
//   1-2: canonical instant answers (see ANSWERED_PROMPT_IDS)
//   3-4: visitor orientation — "what is this?" + "is it free?"
//   5:   buyer — contacting a business
//   6:   seller follow-up — how long until their business is approved
// Dropped: "איך מדווחים על בעיה?" (later-stage concern, not a first-visit Q);
// plus the removed home-cook ("neighbor") feature prompts (MEH-133).
//
// MEH-1617: these are IDs, not copy. The rendered question comes from
// t(`prompts.${id}`); the order here is the render order.
const SUGGESTED_PROMPT_IDS = [
  "register",
  "find_nearby",
  "what_is",
  "is_free",
  "contact",
  "approval_time",
];

// The two prompts that answer instantly from the message file — no API call,
// no model drift, no Anthropic cost. The other four still go to Claude Haiku
// via POST /chat, which uses the matching knowledge-base sections in
// backend/app/routers/chat.py::SYSTEM_PROMPT so the answers stay consistent
// with these canonical ones.
//
// MEH-1617 — WHY THIS IS AN ID SET AND NOT A TEXT MAP: this used to be an
// object keyed by the Hebrew question string, matched byte-for-byte against
// the clicked text. Once the prompts became translation keys that lookup would
// silently miss on /en — the click would fall through to the API, losing the
// instant answer and paying for it. Keying on a locale-independent id makes
// the match survive translation.
// DO NOT reintroduce a text-keyed lookup.
//
// v2 rewrite (feature/chatbot-plain-hebrew-v2): plain everyday Hebrew,
// active voice on approval ("הצוות שלנו בודק ומאשר" not "מאושר"),
// explicit about WHAT is being approved ("העסק שלך" / "המוצר שלך"),
// and specific timeframes ("עד 3 ימי עסקים" per MEH-1347 / "תוך שעות ספורות")
// instead of vague "תוך זמן קצר". No tech jargon like "מודרציה" /
// "פרופיל" — we say "העסק שלך" because that's what the user thinks
// they're registering. That copy now lives verbatim at chat.answers.*.
const ANSWERED_PROMPT_IDS = new Set(["register", "find_nearby"]);

// MEH-2835: the mobile launcher is `w-12 h-12` (48px); + the 16px gap it keeps
// above the BottomNav pill.
const CHAT_FAB_CLEARANCE_VAR = "--chat-fab-clearance";
const CHAT_FAB_CLEARANCE = "64px";

export default function ChatWidget({ hideOnMobile = false } = {}) {
  const t = useTranslations("chat");
  // MEH-1981: notice-at-collection. The line names Anthropic itself — "to whom
  // the data is passed" is a mandatory §11 item, not something a link can
  // carry. Copy approved verbatim 02/09 (rule 22); the link label is the one
  // the registration pages already use, so there is one privacy-link string.
  const tNotice = useTranslations("privacy.collection_notice");
  const tPrivacyLink = useTranslations("auth.register.consumer.terms");

  // MEH-1617: a lazy useState initializer, so the object identity is stable for
  // the component's lifetime — the API-payload filter in sendMessage drops
  // messages[0] by reference, and rebuilding the object each render would leak
  // the opening line into the request body. (A ref written during render would
  // work too but trips react-hooks/refs; this is the idiomatic form.)
  const [openingMessage] = useState(() => ({ role: "assistant", content: t("opening") }));

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([openingMessage]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // MEH-1617: reverse index (rendered question → id) for the CURRENT locale.
  // Before the i18n move, typing a suggested question by hand hit the canned
  // answer just like clicking it, because the lookup was on raw text. This
  // preserves that behaviour per-locale; without it, typing the question would
  // silently start costing an API call.
  const promptIdByLabel = {};
  for (const id of SUGGESTED_PROMPT_IDS) promptIdByLabel[t(`prompts.${id}`)] = id;

  // ── Responsive: desktop vs mobile ──
  const [isDesktop, setIsDesktop] = useState(false);
  // MEH-2499: false until the matchMedia read below has run. Without it a
  // desktop load painted one frame of the MOBILE launcher (isDesktop starts
  // false) before jumping to the desktop pill.
  const [viewportKnown, setViewportKnown] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    setViewportKnown(true);
    const h = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  // The mobile launcher used to step aside on scroll-down (MEH-2499). On a
  // phone that read as a button that "does not stay in place" (Sapir, 31/10),
  // so since 4/11 it stays put on every viewport, like the business list's.

  // MEH-850: cookie-banner clearance is now handled purely in CSS via the
  // `--cookie-banner-h` var (published by CookieBanner) in the launcher's
  // bottom calc() below — no JS visibility state / event listener needed.

  // MEH-2835: while the MOBILE launcher is on screen (and its panel closed),
  // publish the room it takes — its 48px circle + a 16px gap — as
  // --chat-fab-clearance on <html>, the --cookie-banner-h pattern. globals.css
  // adds it to --bottom-inset, so every page's last line (and the footer's
  // newsletter arrow) ends above the launcher; BackToTop reads it to know
  // whether the launcher slot is taken. Desktop, an open panel, or a launcher
  // kept off this page → the var is removed (0).
  // MEH-2835 PR 2: one mechanism for "step aside" — any element carrying
  // data-chat-hide hides the MOBILE launcher while it intersects the viewport
  // (the map, a form, the business page's sticky contact bar while shown).
  // The set is re-scanned on DOM changes (route changes, a bar toggling its
  // attribute), throttled to one scan per frame. Desktop never steps aside.
  const [hiddenByPage, setHiddenByPage] = useState(false);
  useEffect(() => {
    if (!viewportKnown || isDesktop || typeof window === "undefined" || typeof window.IntersectionObserver === "undefined") {
      setHiddenByPage(false);
      return undefined;
    }
    const observed = new Set();
    const inView = new Set();
    const io = new window.IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) inView.add(e.target);
        else inView.delete(e.target);
      }
      setHiddenByPage(inView.size > 0);
    });
    const scan = () => {
      const now = new Set(document.querySelectorAll("[data-chat-hide]"));
      for (const el of observed) {
        if (!now.has(el)) {
          io.unobserve(el);
          observed.delete(el);
          inView.delete(el);
        }
      }
      for (const el of now) {
        if (!observed.has(el)) {
          io.observe(el);
          observed.add(el);
        }
      }
      setHiddenByPage(inView.size > 0);
    };
    scan();
    // `pending` (not the rAF id) gates the throttle: an id assigned after a
    // synchronously-run callback would leave the gate shut for good.
    let pending = false;
    let frame = 0;
    const mo = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      frame = window.requestAnimationFrame(() => {
        pending = false;
        scan();
      });
    });
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-chat-hide"] });
    return () => {
      io.disconnect();
      mo.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [viewportKnown, isDesktop]);
  // An open panel stays open: stepping aside only applies to the closed launcher.
  const steppedAside = hiddenByPage && !isDesktop && !open;

  const launcherOnMobile = viewportKnown && !isDesktop && !hideOnMobile && !open && !steppedAside;
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (!launcherOnMobile) {
      root.style.removeProperty(CHAT_FAB_CLEARANCE_VAR);
      return;
    }
    root.style.setProperty(CHAT_FAB_CLEARANCE_VAR, CHAT_FAB_CLEARANCE);
    return () => root.style.removeProperty(CHAT_FAB_CLEARANCE_VAR);
  }, [launcherOnMobile]);

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
      // MEH-1617: named `focusTimer` (was `t`) — `t` is the translations hook
      // at component scope now, and shadowing it here would be a trap.
      const focusTimer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(focusTimer);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open]);

  // ── Send message logic ──
  // `promptId` is passed when a suggested chip is clicked; a typed message
  // resolves its id through promptIdByLabel above.
  const sendMessage = async (text, promptId) => {
    const trimmed = (text || "").trim();
    if (!trimmed || sending) return;
    setError("");
    const nextMessages = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    const answeredId = promptId || promptIdByLabel[trimmed];
    if (answeredId && ANSWERED_PROMPT_IDS.has(answeredId)) {
      setMessages((prev) => [...prev, { role: "assistant", content: t(`answers.${answeredId}`) }]);
      return;
    }
    setSending(true);
    try {
      const apiMessages = nextMessages
        .filter((m, i) => !(i === 0 && m === openingMessage))
        .map(({ role, content }) => ({ role, content }));
      const res = await api.post("/chat", { messages: apiMessages });
      const reply = res.data?.reply || t("fallback_reply");
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      if (e.response?.status === 429) {
        setError(t("error_rate_limit"));
      } else {
        setError(t("error_generic"));
      }
    } finally { setSending(false); }
  };

  const handleSubmit = (e) => { e.preventDefault(); sendMessage(input); };

  // ── Positioning (all inline — no Tailwind specificity fights) ──
  // MEH-850: mobile bottom = safe-area + pill-clearance(72px) + 16px gap +
  // var(--cookie-banner-h, 0px). The var is published by CookieBanner while it's
  // shown, so the FAB self-clears the banner at ANY height and falls back to
  // sitting above the pill when the banner is gone — no fixed-px banner guess.
  // MEH-2148: derived from the published clearance instead of restating 88px.
  // 72 + 16 = 88 at the fallback, so this is exact parity. The safe-area term
  // moved inside the fallback because the var already carries the inset.
  const MOBILE_LAUNCHER_BOTTOM =
    `calc(var(--bottom-nav-clearance, calc(4.5rem + env(safe-area-inset-bottom, 0px))) + 16px + var(--cookie-banner-h, 0px))`;
  // MEH-1135: logical inline-end (was physical `right`). Distances (16/24) and
  // the MEH-850 vertical calc are unchanged — only the horizontal axis flips
  // from physical to logical, so the FAB tracks the inline-END corner per locale.
  const launcherStyle = {
    position: "fixed", zIndex: 9999,
    insetInlineEnd: isDesktop ? 24 : 16,
    bottom: isDesktop ? 24 : MOBILE_LAUNCHER_BOTTOM,
  };
  // MEH-2499: on mobile the launcher sits just above the BottomNav pill and
  // BackToTop (z-1000) but BELOW every sheet/prompt that can cover the same
  // corner — CookieBanner 1100, FilterSheet 1200, Toaster 2000, InstallPrompt
  // 9997. At 9999 it painted over the open filter sheet's end corner. The
  // panel keeps 9999 (it is the sheet here).
  if (!isDesktop) Object.assign(launcherStyle, { zIndex: 1050 });
  // MEH-2835 PR 2: stepping aside = a 150ms fade, no pointer events, inert.
  if (!isDesktop) {
    Object.assign(launcherStyle, {
      transition: "opacity 150ms ease",
      opacity: steppedAside ? 0 : 1,
      pointerEvents: steppedAside ? "none" : undefined,
    });
  }
  // MEH-1135: desktop 360px box anchors to the same bottom-END corner as the
  // launcher (insetInlineEnd:24, insetInlineStart:auto); mobile stays full-width
  // (both inline insets 0 → spans edge-to-edge in either direction).
  const panelStyle = {
    position: "fixed", zIndex: 9999,
    bottom: isDesktop ? 24 : 0,
    insetInlineEnd: isDesktop ? 24 : 0,
    insetInlineStart: isDesktop ? "auto" : 0,
    width: isDesktop ? 360 : "100%",
    maxHeight: isDesktop ? "min(560px, 80vh)" : "80vh",
    borderRadius: isDesktop ? 16 : "16px 16px 0 0",
  };

  if (!viewportKnown) return null;
  // MEH-2512: form pages (ChatWidgetLazy) keep the launcher off phones.
  if (hideOnMobile && !isDesktop) return null;

  // Desktop pill with text on first visit, icon-only after; mobile always icon-only.
  const showPillText = isDesktop && !wasOpened;

  return (
    <>
      {/* ── Launcher ── */}
      <button
        type="button"
        onClick={open ? () => setOpen(false) : handleOpen}
        style={launcherStyle}
        data-testid="chat-launcher"
        data-stepped-aside={steppedAside ? "true" : undefined}
        inert={steppedAside ? INERT_PRESENT : undefined}
        // MEH-2793: `print:hidden` — a floating chat button has no business on
        // paper, and it printed over the A6 QR card (MEH-2785) and the A5
        // rescue counter card (MEH-2649). The class goes on the component's
        // own elements, matching CookieBanner.jsx:70, NOT on `.vv-pin`: that
        // class is shared with BackToTop, AccountSheet, InstallPrompt and
        // BottomNav, so a rule on it would hide four unrelated components too.
        // It beats the inline style because that style sets position/zIndex
        // and never `display` — verified with a computed-style probe, not
        // assumed (frontend.md).
        className={[
          // MEH-2835: a 2px cream ring (ring-background) so the green circle
          // reads on green surfaces (footer, closing bands). Focus keeps the
          // cream ring and adds a dark outline outside it — the old
          // ring-primary/40 vanished on green and replaced the cream ring.
          "vv-pin print:hidden flex items-center justify-center bg-primary text-white rounded-full ring-2 ring-background shadow-[0_4px_24px_rgba(46,104,83,0.25)] hover:bg-primary-dark transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text",
          showPillText ? "gap-2 px-4 py-3" : "w-12 h-12",
        ].join(" ")}
        // MEH-2308: when the pill text is showing it IS the accessible name. An
        // aria-label over it would replace the words a voice-control user sees
        // (WCAG 2.5.3, axe label-content-name-mismatch). The label stays for the
        // icon-only states, where there is no visible text to contradict.
        aria-label={
          open ? t("launcher_close_label") : showPillText ? undefined : t("launcher_open_label")
        }
        aria-expanded={open}
      >
        {open ? <X size={24} weight="bold" /> : <ChatCircleDots size={24} />}
        {showPillText && !open && <span className="font-body-md text-sm">{t("launcher_pill")}</span>}
      </button>

      {/* ── Chat panel ── */}
      {open && (
        <div
          style={panelStyle}
          className="vv-pin print:hidden flex flex-col bg-background border border-border shadow-[0_8px_32px_rgba(46,104,83,0.18)] overflow-hidden"
          role="dialog"
          aria-modal="false"
          aria-label={t("panel_label")}
        >
          {/* Header */}
          <div className="bg-primary text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ChatCircleDots size={20} aria-hidden="true" />
              <span className="font-headline-md font-bold text-base">{t("panel_title")}</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-2 rounded-full hover:bg-white/10 transition focus-visible:ring-2 focus-visible:ring-white/40"
              aria-label={t("panel_close_label")}
            >
              <X size={18} weight="bold" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
            role="log" aria-live="polite" aria-label={t("log_label")}
          >
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-md text-sm leading-relaxed whitespace-pre-line ${
                  m.role === "user" ? "bg-primary text-white" : "bg-surface text-text border border-border"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-end">
                <div className="bg-surface text-fg-muted border border-border px-3 py-2 rounded-md text-sm">
                  <span className="inline-flex gap-1">
                    <span className="animate-pulse">●</span>
                    <span className="animate-pulse" style={{ animationDelay: "0.15s" }}>●</span>
                    <span className="animate-pulse" style={{ animationDelay: "0.3s" }}>●</span>
                  </span>
                </div>
              </div>
            )}
            {error && (
              <p role="status" className="text-xs text-danger-700 bg-danger-50 border border-danger-200 rounded-sm px-3 py-2">
                {error}
              </p>
            )}
            {messages.length === 1 && !sending && (
              <div className="flex flex-col gap-2 pt-1">
                {SUGGESTED_PROMPT_IDS.map((id) => {
                  const label = t(`prompts.${id}`);
                  return (
                    <button key={id} type="button" onClick={() => sendMessage(label, id)}
                      className="text-start text-xs text-primary bg-green-50 hover:bg-green-50/70 border border-border rounded-sm px-3 py-2 transition focus-visible:ring-2 focus-visible:ring-primary/40"
                    >{label}</button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Composer */}
          <form onSubmit={handleSubmit} className="border-t border-border bg-surface px-3 py-2 flex items-center gap-2">
            <label htmlFor="chat-input" className="sr-only">{t("input_label")}</label>
            <input
              ref={inputRef} id="chat-input" type="text"
              value={input} onChange={(e) => setInput(e.target.value)}
              placeholder={t("input_placeholder")} maxLength={500} disabled={sending}
              className="flex-1 min-w-0 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded text-sm text-text placeholder:text-fg-muted disabled:opacity-60"
              style={{ caretColor: "#2e6853" }}
              autoComplete="off"
            />
            <button
              type="submit" disabled={sending || !input.trim()}
              className="bg-primary text-white p-2 rounded-full hover:bg-primary-dark transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label={t("send_label")}
            >
              <PaperPlaneTilt size={16} weight="fill" style={{ transform: "scaleX(-1)" }} />
            </button>
          </form>
          <CollectionNotice
            message={tNotice("chat")}
            linkLabel={tPrivacyLink("privacy_link")}
            testId="chat-collection-notice"
            // The only surface that overrides the default: the composer sits on a
            // white panel over the page, so the notice paints the same white and
            // shares the composer's horizontal padding instead of the form default.
            className="bg-surface px-3 pb-2"
          />
        </div>
      )}
    </>
  );
}
