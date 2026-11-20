// @ts-check
"use client";

import { useTranslations } from "next-intl";
import { ChatCircleDots } from "@phosphor-icons/react";
import Button from "@/components/ui/Button";
import { openBusinessChat } from "@/lib/business-chat";
import { businessChatPrompts } from "@/lib/business-chat-prompts";
import { businessChatHandoff } from "@/lib/business-chat-handoff";
import { usePreviewMode } from "@/lib/preview-mode";

/**
 * BusinessChatPrompt — the business page's way into the site chat (MEH-3489).
 *
 * Placement: under «שאלות נפוצות», the page's question cluster. Amazon Rufus
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
      <h3 id="business-chat-title" className="flex items-center gap-2 text-sm font-semibold text-text">
        <ChatCircleDots size={20} className="flex-shrink-0 text-primary" aria-hidden="true" />
        {t("page_title", { name })}
      </h3>
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
      <Button
        variant="outlined"
        size="sm"
        className="mt-3"
        data-testid="business-chat-open"
        aria-haspopup="dialog"
        onClick={() => open()}
      >
        {prompts.length > 0 ? t("page_other") : t("page_button")}
      </Button>
    </section>
  );
}
