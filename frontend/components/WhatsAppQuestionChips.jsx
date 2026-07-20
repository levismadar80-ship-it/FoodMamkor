"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CaretDown, ChatCircle } from "@phosphor-icons/react";
import { normalizePhone, getWhatsAppHref, formatPrice } from "@/lib/utils";
import { getProducerQuestions } from "@/lib/categoryQuestions";
import { buildDeliveryAnswer, buildOrderingAnswer } from "@/lib/quickAnswers";

/**
 * Quick Answers under the primary CTA in the producer contact card.
 *
 * MEH-1302 reworked this from WhatsApp-only chips into an answer-first
 * disclosure: the two canonical ready-made questions that CAN be answered
 * from existing data are answered in-page (delivery + how-to-order), and only
 * the dynamic stock question, any custom questions, and an "another question?"
 * escalation stay WhatsApp deep-links.
 *
 *   Q1  "אפשר משלוח ל{city}?"  → buildDeliveryAnswer disclosure, else WA link
 *   Q2  "איך מזמינים?"          → buildOrderingAnswer disclosure, else WA link
 *   Q3+ stock / custom          → WhatsApp (getProducerQuestions, category-aware)
 *   Escalation "שאלה אחרת?"     → WhatsApp (only when a phone exists)
 *
 * Unlike the pre-1302 version this no longer bails with `return null` when the
 * producer has no phone — the data-driven answers still render; only the
 * WhatsApp-backed items are hidden. The whole block returns null only when
 * nothing at all is renderable.
 */

/** Collapsible answer row: button + aria-expanded + CaretDown (rotates open). */
function Disclosure({ question, children }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="quick-answer-toggle"
        className="flex w-full items-center gap-2 min-h-[44px] text-start font-body-md text-sm text-primary transition rounded focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <CaretDown
          size={16}
          weight="bold"
          aria-hidden="true"
          className={`flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
        {question}
      </button>
      {open && (
        <div
          data-testid="quick-answer-content"
          className="ps-6 pb-2 font-body-md text-sm text-text"
        >
          {children}
        </div>
      )}
    </li>
  );
}

/** WhatsApp deep-link row (unchanged idiom: ChatCircle glyph + quiet link). */
function WaItem({ href, question }) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="question-link"
        className="flex items-center gap-2 min-h-[44px] font-body-md text-sm text-primary transition hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
      >
        <ChatCircle size={16} weight="regular" className="flex-shrink-0" aria-hidden="true" />
        {question}
      </a>
    </li>
  );
}

/** Render the delivery descriptor into localized disclosure content. */
function DeliveryContent({ answer, t }) {
  switch (answer.kind) {
    case "nationwide":
      return <p>{t("delivery_nationwide")}</p>;
    case "nationwide_except":
      return <p>{t("delivery_nationwide_except", { cities: answer.cities.join(", ") })}</p>;
    case "areas": {
      const label =
        answer.moreCount > 0
          ? t("delivery_areas_more", { cities: answer.cities.join(", "), count: answer.moreCount })
          : t("delivery_areas", { cities: answer.cities.join(", ") });
      const subs = [];
      if (answer.minOrder != null) subs.push(t("delivery_sub_min", { min: formatPrice(answer.minOrder) }));
      if (answer.deliveryDay) subs.push(t("delivery_sub_day", { day: answer.deliveryDay }));
      return (
        <>
          <p>{label}</p>
          {subs.length > 0 && <p className="mt-0.5 text-fg-muted">{subs.join(" · ")}</p>}
        </>
      );
    }
    case "pickup_only":
      return (
        <p>
          {answer.city
            ? t("delivery_pickup_only", { city: answer.city })
            : t("delivery_pickup_only_nocity")}
        </p>
      );
    default:
      return null;
  }
}

/** Render the ordering descriptor into localized disclosure content. */
function OrderingContent({ answer, t }) {
  if (answer.kind === "whatsapp") return <p>{t("ordering_whatsapp")}</p>;
  if (answer.kind === "phone") {
    return (
      <p>
        {t("ordering_phone_prefix")}{" "}
        <a href={answer.href} dir="ltr" className="text-primary hover:underline">
          {answer.phone}
        </a>
      </p>
    );
  }
  const textKey = {
    external_order: "ordering_external_order",
    website: "ordering_website",
    instagram: "ordering_instagram",
    facebook: "ordering_facebook",
    email: "ordering_email",
  }[answer.kind];
  return (
    <p>
      {t(textKey)}{" "}
      <a
        href={answer.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline"
      >
        {t("ordering_link_label")}
      </a>
    </p>
  );
}

export default function WhatsAppQuestionChips({ producer }) {
  const t = useTranslations("whatsapp.question_chips");
  const digits = normalizePhone(producer?.phone);
  const city = producer?.city || t("my_area");
  const name = producer?.name || "";

  const deliveryQ = t("delivery_to_city", { city });
  const orderingQ = t("ordering_q");
  const delivery = buildDeliveryAnswer(producer);
  const ordering = buildOrderingAnswer(producer);

  const waHref = (q) =>
    digits ? getWhatsAppHref(digits, t("greeting_template", { name, q })) : null;

  // Category-aware stock / custom questions stay WhatsApp — minus the two
  // canonical slots (delivery + ordering) handled above, to avoid duplicates.
  const waQuestions = getProducerQuestions(producer || {})
    .map((q) => q.replace("[עיר]", city))
    .filter((q) => q !== orderingQ && q !== deliveryQ && q !== "יש משלוח?");

  const items = [];

  // Q1 — delivery: answer-first, else WhatsApp fallback (today's behaviour).
  if (delivery) {
    items.push(
      <Disclosure key="delivery" question={deliveryQ}>
        <DeliveryContent answer={delivery} t={t} />
      </Disclosure>,
    );
  } else if (digits) {
    items.push(<WaItem key="delivery" href={waHref(deliveryQ)} question={deliveryQ} />);
  }

  // Q2 — ordering: answer-first. A WhatsApp-method answer only makes sense
  // with a phone; without one it collapses to the WA fallback (also gated on
  // a phone), so it simply drops out.
  if (ordering && (ordering.kind !== "whatsapp" || digits)) {
    items.push(
      <Disclosure key="ordering" question={orderingQ}>
        <OrderingContent answer={ordering} t={t} />
      </Disclosure>,
    );
  } else if (!ordering && digits) {
    items.push(<WaItem key="ordering" href={waHref(orderingQ)} question={orderingQ} />);
  }

  // Q3+ — stock / custom, WhatsApp only.
  if (digits) {
    waQuestions.forEach((q, i) => {
      items.push(<WaItem key={`wa-${i}-${q}`} href={waHref(q)} question={q} />);
    });
  }

  if (items.length === 0 && !digits) return null;

  return (
    <QuestionList items={items} showEscalation={!!digits} escalationHref={waHref(t("escalation"))} t={t} />
  );
}

// MEH-1334 chunk 2: progressive-disclosure wrapper — the first VISIBLE_MAX
// ready-made questions render immediately; the rest hide behind one "עוד
// שאלות" expander (single level, no pagination). MEH-1302's answer-first
// behavior of each item is untouched — this only caps how many show at once.
// The container was restyled to the quiet card idiom (hairline top rule,
// tighter row rhythm) per the approved mockup.
const VISIBLE_MAX = 3;

function QuestionList({ items, showEscalation, escalationHref, t }) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = items.length > VISIBLE_MAX;
  const visible = expanded ? items : items.slice(0, VISIBLE_MAX);

  return (
    <div className="mb-4 border-t border-border pt-3">
      <p className="text-xs mb-1.5 font-body-md text-fg-muted">{t("common_questions")}:</p>
      <ul className="flex flex-col">{visible}</ul>

      {/* "עוד שאלות" — reveals the remaining ready-made questions in place.
          ≥44px hit-area via min-h + transparent padding (revision-2 #5). */}
      {hasMore && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          data-testid="more-questions"
          aria-expanded={false}
          className="flex items-center gap-2 min-h-[44px] font-body-md text-sm font-medium text-primary transition hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
        >
          <CaretDown size={16} weight="bold" className="flex-shrink-0" aria-hidden="true" />
          {t("more_questions")}
        </button>
      )}

      {/* Escalation — reuses the greeting template; only when a phone exists. */}
      {showEscalation && (
        <a
          href={escalationHref}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="escalation-link"
          className="flex items-center gap-2 min-h-[44px] font-body-md text-sm text-fg-muted transition hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
        >
          <ChatCircle size={16} weight="regular" className="flex-shrink-0" aria-hidden="true" />
          {t("escalation")}
        </a>
      )}
    </div>
  );
}
