// @ts-check
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PaperPlaneTilt, Sparkle } from "@phosphor-icons/react";
import { openBusinessChat } from "@/lib/business-chat";
import { businessChatPrompts } from "@/lib/business-chat-prompts";
import { businessChatHandoff } from "@/lib/business-chat-handoff";
import { usePreviewMode } from "@/lib/preview-mode";
import IconButton from "@/components/ui/IconButton";

// The panel's own field has the same cap (components/ChatWidget.jsx input).
const CHAT_MAX_CHARS = 500;

/**
 * BusinessChatPrompt — the business page's way into the site chat (MEH-3489).
 *
 * Placement: right after «מוצרים» (Sapir 20/11; was under «שאלות נפוצות»,
 * near the page end). Amazon Rufus
 * (product page), Yelp Assistant (business page) and Google Maps «Ask about
 * this place» put the entry INSIDE the page, never as a second floating
 * button. The floating chat button stays off this page (MEH-1168: it covered
 * the contact card at 375), and the button is outlined so the page keeps one
 * green primary action, the contact button.
 *
 * Does NOT: hold chat state or call the API — it asks the ChatWidget that
 * ChatWidgetLazy mounts here (lib/business-chat.js) to open for this business.
 *
 * Shown only on a live, approved page: a preview (draft link, dashboard) or
 * a not-yet-approved page mounts no chat to open, and the server adds no
 * facts for a business that is not public (routers/chat.py).
 *
 * MEH-3505: the panel's suggested questions come from this page's data
 * (lib/business-chat-prompts.js), so they differ per business.
 *
 * @param {{ producer: any, signatureProduct?: any }} props
 */
export default function BusinessChatPrompt({ producer, signatureProduct = null }) {
  const t = useTranslations("chat.business");
  const tWa = useTranslations("whatsapp.question_chips");
  const preview = usePreviewMode();
  const [draft, setDraft] = useState("");
  if (!producer?.id || preview || producer.status !== "approved") return null;
  const name = producer.name || "";
  const prompts = businessChatPrompts(producer, signatureProduct);
  /** @param {string} [ask] a question to send as the panel opens */
  // MEH-3513: «ask the business» under each answer — the same greeting and
  // source line as the page's WhatsApp question chips.
  const handoff = businessChatHandoff(producer, {
    greeting: (q) => tWa("greeting_template", { name, q }),
    sourceLine: tWa("source_line"),
  });
  const open = (ask) => openBusinessChat({ id: producer.id, name, prompts, ask, handoff });
  return (
    <section
      data-testid="business-chat-prompt"
      aria-labelledby="business-chat-title"
      className="mt-8 rounded-lg border border-border bg-surface p-4 print:hidden"
    >
      {/* Sapir 20/11 «האם יבינו שזה עוזרת»: the sparkle is the AI mark people
          learned from Google (Gemini), Amazon (Rufus) and most design systems,
          and the line under the title says in words that it is an AI that
          answers from this page (EU AI Act art. 50 asks the same). */}
      <div className="flex items-start gap-3">
        <span className="grid size-9 flex-shrink-0 place-items-center rounded-full bg-green-50 text-primary" aria-hidden="true">
          <Sparkle size={18} weight="fill" />
        </span>
        <div className="min-w-0">
          <h3 id="business-chat-title" className="text-base font-semibold text-text">
            {t("page_title", { name })}
          </h3>
          <p className="mt-0.5 text-xs text-fg-muted" data-testid="business-chat-ai-note">{t("page_ai_note")}</p>
        </div>
      </div>
      {/* MEH-3505: the business's own questions on the page, like Google Maps'
          «Ask about this place» and Amazon's Rufus chips — a tap opens the
          panel with that question already sent. No generic lead line. */}
      {prompts.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" data-testid="business-chat-questions">
          {prompts.map((p) => {
            const label = t(`prompts.${p.id}`, p.values);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => open(label)}
                  className="inline-flex min-h-touch items-center rounded-full border border-border bg-green-50 px-3.5 text-start text-sm text-primary transition focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {/* MEH-3584 (Sapir 21/11 «נראה כאילו אני אמורה להקליד כאן וזה נפתח
          לצ'אט»): a field that LOOKS typeable must BE typeable. Like the
          «Ask Rufus» box on an Amazon product page: type here, send, and the
          panel opens with the question already sent. An empty send opens the
          panel, as the old button did. */}
      <form
        data-testid="business-chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          const question = draft.trim();
          setDraft("");
          open(question || undefined);
        }}
        className="mt-3 flex min-h-touch items-center gap-1 rounded-full border border-border bg-surface-card ps-4 transition focus-within:border-primary focus-within:ring-1 focus-within:ring-primary"
      >
        <input
          type="text"
          data-testid="business-chat-input"
          aria-label={t("page_other")}
          placeholder={t("page_other")}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={CHAT_MAX_CHARS}
          enterKeyHint="send"
          className="min-w-0 flex-1 bg-transparent py-2 text-base text-text placeholder:text-fg-muted focus:outline-none"
        />
        <IconButton
          type="submit"
          data-testid="business-chat-open"
          aria-haspopup="dialog"
          label={t("page_title", { name })}
          className="grid size-11 flex-shrink-0 place-items-center rounded-full text-primary focus-visible:ring-2 focus-visible:ring-primary"
        >
          <PaperPlaneTilt size={18} weight="fill" className="rtl:-scale-x-100" aria-hidden="true" />
        </IconButton>
      </form>
    </section>
  );
}
