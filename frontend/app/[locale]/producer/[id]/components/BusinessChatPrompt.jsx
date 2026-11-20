// @ts-check
"use client";

import { useTranslations } from "next-intl";
import { PaperPlaneTilt, Sparkle } from "@phosphor-icons/react";
import { openBusinessChat } from "@/lib/business-chat";
import { businessChatPrompts } from "@/lib/business-chat-prompts";
import { usePreviewMode } from "@/lib/preview-mode";

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
  const preview = usePreviewMode();
  if (!producer?.id || preview || producer.status !== "approved") return null;
  const name = producer.name || "";
  const prompts = businessChatPrompts(producer, signatureProduct);
  /** @param {string} [ask] a question to send as the panel opens */
  const open = (ask) => openBusinessChat({ id: producer.id, name, prompts, ask });
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
      {/* Looks like the field it opens (Rufus's «Ask Rufus a question» box):
          one more outlined button under the chips read as a fourth chip. */}
      <button
        type="button"
        data-testid="business-chat-open"
        aria-haspopup="dialog"
        onClick={() => open()}
        className="mt-3 flex min-h-touch w-full items-center justify-between gap-2 rounded-full border border-border bg-surface-card px-4 text-start text-sm text-fg-muted transition hover:border-primary focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span>{t("page_other")}</span>
        <PaperPlaneTilt size={16} weight="fill" className="flex-shrink-0 text-primary" style={{ transform: "scaleX(-1)" }} aria-hidden="true" />
      </button>
    </section>
  );
}
