// @ts-check
"use client";

import { useTranslations } from "next-intl";
import { ChatCircleDots } from "@phosphor-icons/react";
import Button from "@/components/ui/Button";
import { openBusinessChat } from "@/lib/business-chat";
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
 * @param {{ producer: { id: string, name?: string, status?: string } }} props
 */
export default function BusinessChatPrompt({ producer }) {
  const t = useTranslations("chat.business");
  const preview = usePreviewMode();
  if (!producer?.id || preview || producer.status !== "approved") return null;
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
        aria-haspopup="dialog"
        onClick={() => openBusinessChat({ id: producer.id, name: producer.name || "" })}
      >
        {t("page_button")}
      </Button>
    </section>
  );
}
