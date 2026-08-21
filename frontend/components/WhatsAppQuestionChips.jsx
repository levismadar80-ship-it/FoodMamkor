"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CaretDown, ChatCircle } from "@phosphor-icons/react";
import { normalizePhone, getWhatsAppHref, formatPrice } from "@/lib/utils";
import { getProducerQuestions } from "@/lib/categoryQuestions";
import { buildDeliveryAnswer, buildOrderingAnswer } from "@/lib/quickAnswers";
import {
  getPrimaryContactHref,
  getPrimaryMethod,
  isPrimaryExternal,
  isWhatsAppPrimary,
} from "@/lib/contact-method";
import { markWhatsAppClickedLocal, pingWhatsAppBeacon } from "@/lib/contact-tracking";

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
 *   Escalation "שאלה אחרת?"     → the business's PRIMARY channel
 *
 * Unlike the pre-1302 version this no longer bails with `return null` when the
 * producer has no phone — the data-driven answers still render; only the
 * WhatsApp-backed items are hidden. The whole block returns null only when
 * nothing at all is renderable.
 *
 * MEH-2154 — WHAT GATES A WHATSAPP ITEM CHANGED, AND WHY IT MATTERS.
 * Every WhatsApp-prefill row used to be gated on `digits` alone: "the producer
 * filled in a phone number". That is not the same question as "the producer
 * chose WhatsApp", and a business that declared any other primary channel still
 * got wa.me chips because it happened to list a phone. The sharpest damage is
 * `external_order`: every question answered in WhatsApp is a lead that leaves
 * the owner's own funnel with no order number attached.
 *
 * So the gate is now `isWhatsAppPrimary(producer) && digits` (contact-method.js
 * — the single owner of channel logic). When it is false:
 *
 *   - stock / custom question chips  → hidden
 *   - recipe-idea chip (MEH-1462)    → hidden. The prefill string is
 *     Sapir-locked WhatsApp copy with no equivalent on any other channel, so
 *     narrowing its gate is the honest option and NOT a silent one — it is
 *     flagged on the MEH-2154 PR as a decision, not an implementation detail.
 *   - escalation "שאלה אחרת?"        → **still rendered**, pointed at the
 *     primary channel via getPrimaryContactHref. MEH-1538's lock is that the
 *     ready-made questions have no off switch; this ticket ROUTES them, it does
 *     not turn anything off, so the one row that is the contact channel itself
 *     must never vanish while any channel exists.
 *
 * Q1 and Q2 keep their answer-first disclosures untouched — they were already
 * channel-correct (Q2 reads getPrimaryContactHref through buildOrderingAnswer).
 * Only their WhatsApp FALLBACKS move behind the new gate, because a fallback
 * that opens wa.me is a WhatsApp item like any other.
 *
 * The attribution beacon stays bound to wa.me rows ONLY (see below): a tel:,
 * mailto: or https: escalation opens no WhatsApp conversation, so counting it
 * would inflate the very metric MEH-1426 exists to keep honest.
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
function WaItem({ href, question, onTrack }) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onTrack}
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
  // MEH-2154: the single gate for every WhatsApp-prefill row. Both halves are
  // required — the declared channel AND a number to send to.
  const waEnabled = isWhatsAppPrimary(producer) && !!digits;

  // MEH-1886: a chip that opens WhatsApp is a full WhatsApp path, so it owes
  // the same two calls the primary CTA makes (ContactCard.jsx:235-238) — the
  // MEH-1426 invariant: "every WhatsApp click = attribution + unlock; non-WA =
  // neither". Before this, a customer who opened a chat through a chip — even
  // one the owner wrote herself — produced a conversation that was never
  // counted and never unlocked her review form (reviews.py guard 3 → 403).
  //
  // Attached to the <a> elements ONLY. The answer-first disclosures below open
  // no conversation, so they deliberately do not fire; that is the
  // discriminating case, not an oversight. One handler per link and no
  // listener on any shared ancestor, so a tap fires exactly once.
  const trackWhatsAppOpen = () => {
    if (!producer?.id) return;
    pingWhatsAppBeacon(producer.id);
    markWhatsAppClickedLocal(producer.id);
  };
  const city = producer?.city || t("my_area");
  const name = producer?.name || "";

  const deliveryQ = t("delivery_to_city", { city });
  const orderingQ = t("ordering_q");
  const delivery = buildDeliveryAnswer(producer);
  const ordering = buildOrderingAnswer(producer);

  // MEH-1524: every prefill that opens a chat with a specific business ends
  // with a source line on its own final line, so the owner sees the referral
  // source in her own inbox. LOCKED copy — the `source_line` key is defined
  // once and appended here + at the recipe-idea call site.
  const waHref = (q) =>
    digits
      ? getWhatsAppHref(
          digits,
          `${t("greeting_template", { name, q })}\n\n${t("source_line")}`,
        )
      : null;

  // MEH-1462: "יש לי רעיון למתכון" — routes the recipe-idea intent to the
  // existing WhatsApp channel (research 22/07: no in-app suggestion box, no
  // moderation). Uses its own Sapir-locked prefill (NOT the greeting_template
  // that wraps the other questions), no in-page answer, gated on a phone like
  // every other WhatsApp row.
  const recipeIdeaHref = waEnabled
    ? getWhatsAppHref(
        digits,
        `${t("recipe_idea_message")}\n\n${t("source_line")}`,
      )
    : null;

  // MEH-2154: the escalation row follows the declared channel. WhatsApp-primary
  // keeps today's wa.me href byte-for-byte (same greeting_template + locked
  // source_line); every other channel reuses getPrimaryContactHref, which is
  // the SAME mapping the big primary CTA uses — no per-channel logic is
  // introduced here.
  //
  // The one addition is a subject on the mailto:, because an email with no
  // subject line is the one channel where the customer's intent is invisible
  // in the owner's inbox. It is appended HERE rather than inside
  // getPrimaryContactHref on purpose: that helper also builds the primary CTA,
  // and changing it would put this subject on a button outside this ticket.
  const escalationMethod = getPrimaryMethod(producer);
  const primaryHref = waEnabled ? null : getPrimaryContactHref(producer);
  const escalationHref = waEnabled
    ? waHref(t("escalation"))
    : primaryHref && escalationMethod === "email"
      ? `${primaryHref}?subject=${encodeURIComponent(t("escalation_email_subject"))}`
      : primaryHref;

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
  } else if (waEnabled) {
    items.push(
      <WaItem key="delivery" href={waHref(deliveryQ)} question={deliveryQ} onTrack={trackWhatsAppOpen} />,
    );
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
  } else if (!ordering && waEnabled) {
    items.push(
      <WaItem key="ordering" href={waHref(orderingQ)} question={orderingQ} onTrack={trackWhatsAppOpen} />,
    );
  }

  // Q3+ — stock / custom, WhatsApp only.
  if (waEnabled) {
    waQuestions.forEach((q, i) => {
      items.push(
        <WaItem key={`wa-${i}-${q}`} href={waHref(q)} question={q} onTrack={trackWhatsAppOpen} />,
      );
    });
  }

  // Nothing to show at all — no answers, no escalation channel, no recipe row.
  // (Pre-MEH-2154 this read `items.length === 0 && !digits`, where `digits` was
  // a proxy for "an escalation row will render". Now that the escalation can
  // ride a non-WhatsApp channel, ask the real question instead of the proxy.)
  if (items.length === 0 && !escalationHref && !recipeIdeaHref) return null;

  return (
    <QuestionList
      items={items}
      escalationHref={escalationHref}
      // The beacon belongs to wa.me rows only (MEH-1426): a tel:/mailto:/https:
      // escalation opens no WhatsApp conversation and must not be counted as
      // one. `null` here is the discriminating case, not an omission.
      escalationOnTrack={waEnabled ? trackWhatsAppOpen : null}
      escalationExternal={waEnabled || isPrimaryExternal(producer)}
      recipeIdeaHref={recipeIdeaHref}
      onTrack={trackWhatsAppOpen}
      t={t}
    />
  );
}

// MEH-1334 chunk 2: progressive-disclosure wrapper — the first VISIBLE_MAX
// ready-made questions render immediately; the rest hide behind one "עוד
// שאלות" expander (single level, no pagination). MEH-1302's answer-first
// behavior of each item is untouched — this only caps how many show at once.
// The container was restyled to the quiet card idiom (hairline top rule,
// tighter row rhythm) per the approved mockup.
const VISIBLE_MAX = 3;

function QuestionList({
  items,
  escalationHref,
  escalationOnTrack,
  escalationExternal,
  recipeIdeaHref,
  onTrack,
  t,
}) {
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

      {/* Escalation — the contact channel itself, so it renders whenever ANY
          channel resolves (MEH-2154). WhatsApp-primary keeps the greeting
          template; other channels get the primary CTA's own href. tel: and
          mailto: must NOT carry target="_blank" — a new tab that immediately
          hands off to the OS leaves a blank window behind on mobile. */}
      {escalationHref && (
        <a
          href={escalationHref}
          {...(escalationExternal
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
          onClick={escalationOnTrack ?? undefined}
          data-testid="escalation-link"
          className="flex items-center gap-2 min-h-[44px] font-body-md text-sm text-fg-muted transition hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
        >
          <ChatCircle size={16} weight="regular" className="flex-shrink-0" aria-hidden="true" />
          {t("escalation")}
        </a>
      )}

      {/* MEH-1462: recipe-idea chip — always rendered LAST in the row (never
          capped by the "עוד שאלות" expander), only when a WhatsApp channel
          exists. No in-page disclosure: it always opens WhatsApp with the
          Sapir-locked recipe-idea prefill. */}
      {recipeIdeaHref && (
        <a
          href={recipeIdeaHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onTrack}
          data-testid="recipe-idea-link"
          className="flex items-center gap-2 min-h-[44px] font-body-md text-sm text-primary transition hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
        >
          <ChatCircle size={16} weight="regular" className="flex-shrink-0" aria-hidden="true" />
          {t("recipe_idea")}
        </a>
      )}
    </div>
  );
}
