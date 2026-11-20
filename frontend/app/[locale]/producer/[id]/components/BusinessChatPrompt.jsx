// @ts-check
"use client";

import { useTranslations } from "next-intl";
import { ChatCircleDots } from "@phosphor-icons/react";
import Button from "@/components/ui/Button";
import { openBusinessChat } from "@/lib/business-chat";

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
 * @param {{ producer: { id: string, name?: string } }} props
 */
export default function BusinessChatPrompt({ producer }) {
  const t = useTranslations("chat.business");
  if (!producer?.id) return null;
  return (
    <section
      data-testid="business-chat-prompt"
      className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 print:hidden"
    >
      <p className="flex items-center gap-2 text-sm text-text">
        <ChatCircleDots size={20} className="flex-shrink-0 text-primary" aria-hidden="true" />
        {t("page_lead")}
      </p>
      <Button
        variant="outlined"
        size="sm"
        data-testid="business-chat-open"
        onClick={() => openBusinessChat({ id: producer.id, name: producer.name || "" })}
      >
        {t("page_button")}
      </Button>
    </section>
  );
}
