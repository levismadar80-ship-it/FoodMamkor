// @ts-check
"use client";

import { useTranslations } from "next-intl";
import { ChatCircleText } from "@phosphor-icons/react";
import { trackPrimaryCtaClick } from "@/lib/contact-tracking";

/**
 * BusinessChatAfterAnswer — what shows under the latest answer in the
 * business-page chat (MEH-3513).
 *
 * 1. Follow-up questions: the business's suggested questions not yet asked
 *    (Amazon Rufus offers clickable follow-ups after every answer). None left
 *    → nothing.
 * 2. «לשאול את {name} ישירות»: hands the visitor's last question to the
 *    business itself (Yelp, Shopify Inbox). The href comes from the page
 *    (lib/business-chat-handoff.js); the click is tracked like the contact
 *    button (trackPrimaryCtaClick), so it also opens the review gate.
 *
 * Does NOT: send anything to the API (the follow-up calls `onAsk`, the
 * widget's own send) or decide which channel (the page did).
 */

/**
 * @param {{
 *   business: { id: string, name: string, prompts?: { id: string, values?: Record<string, string> }[], handoff?: import("@/lib/business-chat-handoff").BusinessHandoff | null },
 *   messages: { role: string, content: string }[],
 *   onAsk: (label: string) => void,
 * }} props
 */
export default function BusinessChatAfterAnswer({ business, messages, onAsk }) {
  const t = useTranslations("chat.business");
  const asked = new Set(messages.filter((m) => m.role === "user").map((m) => m.content.trim()));
  const lastQuestion = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  // Exact match on the label the chip sends; a typed paraphrase is not matched.
  const followUps = (business.prompts || [])
    .map((p) => ({ id: p.id, label: t(`prompts.${p.id}`, p.values) }))
    .filter(({ label }) => !asked.has(label.trim()));
  const href = business.handoff ? business.handoff.href(lastQuestion) : null;
  if (followUps.length === 0 && !href) return null;
  return (
    <div className="flex flex-col gap-2 pt-1" data-testid="business-chat-after-answer">
      {followUps.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onAsk(label)}
          className="min-h-11 text-start text-xs text-primary bg-green-50 hover:bg-green-50/70 border border-border rounded-sm px-3 py-2 transition focus-visible:ring-2 focus-visible:ring-primary"
        >
          {label}
        </button>
      ))}
      {href && (
        <a
          href={href}
          // MEH-3513: a new tab only where the contact button opens one
          // (website / social); wa.me, tel and mailto stay in place.
          {...(business.handoff?.external
            ? {
                target: "_blank",
                rel: business.handoff.isWebsite ? "noopener" : "noopener noreferrer",
                "aria-label": t("ask_business_aria", { name: business.name }),
              }
            : {})}
          data-testid="business-chat-handoff"
          onClick={() => trackPrimaryCtaClick(business.id, business.handoff?.method)}
          className="min-h-11 inline-flex items-center gap-1.5 self-start text-xs font-medium text-primary underline underline-offset-2 px-1 py-2 focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
        >
          <ChatCircleText size={16} aria-hidden="true" />
          {t("ask_business", { name: business.name })}
        </a>
      )}
    </div>
  );
}
