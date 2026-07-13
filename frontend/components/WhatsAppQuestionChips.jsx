"use client";

import { useTranslations } from "next-intl";
import { ChatCircle } from "@phosphor-icons/react";
import { normalizePhone, getWhatsAppHref } from "@/lib/utils";
import { getProducerQuestions } from "@/lib/categoryQuestions";

/**
 * Ready-made WhatsApp questions under the primary CTA in the producer
 * contact card. MEH-1146 chunk A repurposed these from bordered chips to
 * quiet text links and made them lead with the dynamic city delivery
 * question ("אפשר משלוח ל-{city}?", invention-fix 11); the remaining slots
 * fill from the category-aware defaults, capped at three.
 *
 * Still WhatsApp-only (returns null without a phone number) regardless of
 * the producer's primary contact method — same as the pre-1146 behavior.
 */
export default function WhatsAppQuestionChips({ producer }) {
  const t = useTranslations("whatsapp.question_chips");
  const digits = normalizePhone(producer?.phone);
  if (!digits) return null;

  const city = producer.city || t("my_area");
  const name = producer.name || "";

  // Lead with the dynamic city delivery question, then top up from the
  // category defaults ("[עיר]" placeholder resolved), capped at 3. Because
  // the city question is prepended, the category set's trailing generic
  // "יש משלוח?" naturally falls past the slice for matched categories.
  const cityQuestion = t("delivery_to_city", { city });
  const base = getProducerQuestions(producer).map((q) => q.replace("[עיר]", city));
  const questions = [...new Set([cityQuestion, ...base])].slice(0, 3);

  return (
    <div className="mb-4">
      <p className="text-xs mb-1.5 font-body-md text-fg-muted">
        {t("ask_us")}:
      </p>
      <ul className="flex flex-col">
        {questions.map((q) => {
          const href = getWhatsAppHref(digits, t("greeting_template", { name, q }));
          return (
            <li key={q}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="question-link"
                className="flex items-center gap-2 min-h-[44px] font-body-md text-sm text-primary transition hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
              >
                {/* MEH-1168 P1: chat-bubble glyph carries the "ask" affordance
                    before each ready-made question (icon + color, no border). */}
                <ChatCircle size={16} weight="regular" className="flex-shrink-0" aria-hidden="true" />
                {q}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
