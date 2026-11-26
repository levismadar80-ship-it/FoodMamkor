// @ts-check
"use client";

/**
 * Module:   OwnerAssistantPanel
 * Purpose:  The conversation inside the owner's dashboard assistant: her
 *           messages, the answers (with links to the right screen or card),
 *           questions to tap for the screen she is on, and what an answer
 *           opens in place (OwnerAssistantCard: page fields, products,
 *           photos, send for review), each saved only by her.
 * Touches:  POST /chat/owner · GET /producers/me (what the cards compare with
 *           and save onto) · PostHog events through lib/analytics.js.
 * Does NOT: hold the conversation (OwnerAssistant.jsx keeps it across screens
 *           and open/close) or decide what a draft row means (lib/page-fill.js).
 * Related:  backend/app/routers/chat_owner.py · components/PageFillReview.jsx ·
 *           components/ChatWidget.jsx (the public site chat, a separate widget)
 * History:  owner assistant (26/11); cards, English, measurement, a question
 *           asked from outside (26/11, MEH-3902).
 */

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Sparkle, X, PaperPlaneTilt, ArrowCounterClockwise } from "@phosphor-icons/react";
import api from "@/lib/api";
import IconButton from "@/components/ui/IconButton";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import CollectionNotice from "@/components/CollectionNotice";
import OwnerAssistantCard from "@/components/owner-assistant/OwnerAssistantCard";
import OwnerAssistantText from "@/components/owner-assistant/OwnerAssistantText";
import { announceOwnerPageUpdated } from "@/lib/owner-page-updated";
import { trackEvent } from "@/lib/analytics";
import {
  OwnerChatChatOwnerPostResponse as OwnerChatOut,
  GetMyProducerProducersMeGetResponse as OwnerProfile,
} from "@/lib/generated/api.zod";

const INPUT_MAX = 500;

/** Questions to tap, by screen. The overview is where a new owner starts. */
const PROMPTS_BY_SECTION = /** @type {Record<string, string[]>} */ ({
  "/producer/dashboard": ["next_step", "fill", "add_products"],
  "/producer/dashboard/edit": ["fill", "add_products", "this_screen"],
});
const DEFAULT_PROMPTS = ["this_screen", "next_step", "fill"];

/**
 * @typedef {{ role: "user" | "assistant", content: string, draft?: any, products?: any[],
 *   action?: string, done?: string }} OwnerMessage
 */

/**
 * `ask`: a question to send once on open (an `owner_assistant.prompts` key).
 * @param {{ messages: OwnerMessage[], setMessages: (fn: (m: OwnerMessage[]) => OwnerMessage[]) => void,
 *   section: string | null, onClose: () => void, onNewChat: () => void, ask?: string | null,
 *   panelRef?: import("react").Ref<HTMLDivElement> }} props
 */
export default function OwnerAssistantPanel({ messages, setMessages, section, onClose, onNewChat, ask = null, panelRef }) {
  const t = useTranslations("owner_assistant");
  const locale = useLocale();
  const tNotice = useTranslations("privacy.collection_notice");
  const tPrivacyLink = useTranslations("auth.register.consumer.terms");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(/** @type {any} */ (null));
  const logRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  useEffect(() => {
    logRef.current?.scrollTo?.({ top: logRef.current.scrollHeight });
  }, [messages, sending]);

  const loadProfile = async () => {
    const res = await api.get("/producers/me");
    const parsed = OwnerProfile.safeParse(res.data);
    // The review compares with the raw row (locations, contact fields); a
    // shape the schema rejects is not shown at all.
    if (!parsed.success) throw new Error("shape");
    setProfile(res.data);
  };

  const send = async (/** @type {string} */ text, /** @type {string} */ source = "typed") => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    trackEvent("owner_assistant_ask", { section, source });
    setError("");
    const history = [...messages, /** @type {OwnerMessage} */ ({ role: "user", content: trimmed })];
    setMessages(() => history);
    setInput("");
    setSending(true);
    try {
      const res = await api.post("/chat/owner", {
        messages: history.map(({ role, content }) => ({ role, content })),
        section,
        locale: locale === "en" ? "en" : "he",
      });
      const parsed = OwnerChatOut.safeParse(res.data);
      if (!parsed.success) throw new Error("shape");
      const { reply, draft, products, action, unanswered } = parsed.data;
      if (draft || products?.length || action) {
        await loadProfile();
        trackEvent("owner_assistant_card", { section, kind: draft ? "fields" : products?.length ? "products" : action });
      }
      if (unanswered) trackEvent("owner_assistant_unanswered", { section, topic: unanswered });
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: reply || t("fallback"),
        draft: draft || undefined,
        products: products?.length ? products : undefined,
        action: action || undefined,
      }]);
    } catch (e) {
      setError(/** @type {any} */ (e)?.response?.status === 429 ? t("error_rate_limit") : t("error_generic"));
    } finally {
      setSending(false);
    }
  };

  // A question asked from outside the panel (the dashboard-home nudge).
  const asked = useRef(false);
  useEffect(() => {
    if (!ask || asked.current) return;
    asked.current = true;
    send(t(`prompts.${ask}`), ask);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per open
  }, [ask]);

  const markDone = (/** @type {number} */ index, /** @type {string} */ kind) => {
    trackEvent("owner_assistant_saved", { section, kind });
    announceOwnerPageUpdated();
    // Photos stay open: she may add another one.
    if (kind === "photos") return;
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, done: kind } : m)));
  };
  const patchProfile = (/** @type {object} */ patch) => setProfile((p) => (p ? { ...p, ...patch } : p));

  // A question she already asked is not offered again (persona run 26/11:
  // «מה הצעד הבא שלי?» kept coming back under its own answer).
  const askedTexts = new Set(messages.filter((m) => m.role === "user").map((m) => m.content));
  const prompts = (PROMPTS_BY_SECTION[section || ""] || DEFAULT_PROMPTS).filter((id) => !askedTexts.has(t(`prompts.${id}`)));

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={t("title")}
      data-testid="owner-assistant-panel"
      className="print:hidden fixed z-chat inset-x-0 bottom-0 md:inset-x-auto md:end-6 md:bottom-6 md:w-[400px] max-h-[85vh] md:max-h-[min(640px,85vh)] flex flex-col bg-background border border-border shadow-lg rounded-t-lg md:rounded-lg overflow-hidden"
    >
      <div className="bg-primary text-white px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkle size={20} aria-hidden="true" className="shrink-0" />
          <span className="font-bold text-base truncate">{t("title")}</span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <IconButton label={t("new_chat")} onClick={() => { setError(""); onNewChat(); }}
              className="p-2 rounded-full hover:bg-white/10 focus-ring" data-testid="owner-assistant-new-chat">
              <ArrowCounterClockwise size={18} weight="bold" aria-hidden="true" />
            </IconButton>
          )}
          <IconButton label={t("close")} onClick={onClose} className="p-2 rounded-full hover:bg-white/10 focus-ring">
            <X size={18} weight="bold" aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <div ref={logRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3" role="log" aria-live="polite" aria-label={t("log_label")}>
        <Bubble from="assistant"><OwnerAssistantText text={t("opening")} onNavigate={onClose} /></Bubble>
        {messages.map((m, i) => (
          <div key={i} className="space-y-2">
            <Bubble from={m.role}>
              {m.role === "assistant" ? <OwnerAssistantText text={m.content} onNavigate={onClose} /> : m.content}
            </Bubble>
            <OwnerAssistantCard message={m} profile={profile} onDone={(kind) => markDone(i, kind)} onProfile={patchProfile} />
            {m.done && (
              <p className="text-xs text-fg-muted" data-testid="owner-assistant-saved">{t(`done.${m.done}`)}</p>
            )}
          </div>
        ))}
        {sending && <p className="text-sm text-fg-muted" data-testid="owner-assistant-typing">{t("typing")}</p>}
        {error && <p role="status" className="text-xs text-danger-700 bg-danger-50 border border-danger-200 rounded-sm px-3 py-2">{error}</p>}
        {!sending && prompts.length > 0 && (
          <div className="flex flex-col gap-2 pt-1" data-testid="owner-assistant-prompts">
            {prompts.map((id) => (
              <Button key={id} variant="outlined" size="sm" className="justify-start text-start" onClick={() => send(t(`prompts.${id}`), id)}>
                {t(`prompts.${id}`)}
              </Button>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="border-t border-border bg-surface px-3 py-2 flex items-center gap-2"
      >
        <div className="flex-1 min-w-0">
          <Input
            inline
            size="sm"
            aria-label={t("input_label")}
            placeholder={t("input_placeholder")}
            value={input}
            maxLength={INPUT_MAX}
            disabled={sending}
            autoComplete="off"
            onChange={(e) => setInput(e.target.value)}
            data-testid="owner-assistant-input"
            className="w-full"
          />
        </div>
        <IconButton
          type="submit"
          label={t("send")}
          disabled={sending || !input.trim()}
          className="bg-primary text-white p-2 rounded-full hover:bg-primary-dark disabled:opacity-50 focus-ring"
        >
          <PaperPlaneTilt size={16} weight="fill" aria-hidden="true" className="-scale-x-100" />
        </IconButton>
      </form>
      <CollectionNotice
        message={tNotice("chat")}
        linkLabel={tPrivacyLink("privacy_link")}
        testId="owner-assistant-collection-notice"
        className="bg-surface px-3 pb-2"
      />
    </div>
  );
}

/** @param {{ from: "user" | "assistant", children: import("react").ReactNode }} props */
function Bubble({ from, children }) {
  return (
    <div className={`flex ${from === "user" ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[88%] px-3 py-2 rounded-md text-sm leading-relaxed whitespace-pre-line ${
          from === "user" ? "bg-primary text-white" : "bg-surface text-text border border-border"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
