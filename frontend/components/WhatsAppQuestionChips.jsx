// @ts-check
"use client";

import { cloneElement, useState } from "react";
import { useTranslations } from "next-intl";
import { CaretDown, ChatCircle, Wallet } from "@phosphor-icons/react";
import { normalizePhone, getWhatsAppHref, formatPrice } from "@/lib/utils";
import { buildDeliveryAnswer, hasDeliverySection } from "@/lib/quickAnswers";
import { ownerQuestionLabels } from "@/lib/resolvedQuestions";
import { isWhatsAppPrimary } from "@/lib/contact-method";
import { markWhatsAppClickedLocal, pingWhatsAppBeacon } from "@/lib/contact-tracking";
import { useUserCity } from "@/lib/use-user-city";
import { paymentAnswer } from "@/lib/payment-info";
import SectionHeading from "@/components/ui/SectionHeading";

/**
 * «שאלות נפוצות» — the business page's FAQ section (under «משלוחים» since
 * 20/11; before that, a block under the primary CTA in the contact card).
 *
 * MEH-1302 reworked this from WhatsApp-only chips into an answer-first
 * disclosure: the two canonical ready-made questions that CAN be answered
 * from existing data are answered in-page (delivery + how-to-order), and only
 * the dynamic stock question and any custom questions stay WhatsApp
 * deep-links (the "another question?" escalation left 20/11, see MEH-3460).
 *
 *   Q1  "אפשר משלוח ל{city}?"  → not asked when the page has its «משלוח»
 *                                 section (20/11: this section sits right
 *                                 under it), else buildDeliveryAnswer
 *                                 disclosure, else WA link
 *   Q2  "איך מזמינים?"          → REMOVED 19/11: it repeated the primary CTA
 *   Q3+ custom (owner-written)  → WhatsApp (MEH-2385: category stock set no longer renders)
 *   Escalation "שאלה אחרת?"     → REMOVED 20/11: it repeated the primary CTA
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
 *   - custom question chips          → hidden
 *   - (the category stock rows and the recipe-idea chip of MEH-1462 no longer
 *     exist at all — MEH-2385 cut the block to Q1 / Q2 / owner questions /
 *     escalation, so there is nothing channel-specific left to gate there)
 *   - escalation "שאלה אחרת?"        → (then) still rendered, pointed at the
 *     primary channel via getPrimaryContactHref. MEH-1538's lock is that the
 *     ready-made questions have no off switch; this ticket ROUTES them, it does
 *     not turn anything off, so the one row that is the contact channel itself
 *     must never vanish while any channel exists.
 *
 * Q1 and Q2 keep their answer-first disclosures untouched — they were already
 * channel-correct (Q2 read getPrimaryContactHref; Q2 itself left in MEH-3460).
 * Only their WhatsApp FALLBACKS move behind the new gate, because a fallback
 * that opens wa.me is a WhatsApp item like any other.
 *
 * The attribution beacon stays bound to wa.me rows ONLY (see below): a tel:,
 * mailto: or https: escalation opens no WhatsApp conversation, so counting it
 * would inflate the very metric MEH-1426 exists to keep honest.
 *
 * MEH-2385 — WHAT THE BLOCK SHOWS BY DEFAULT SHRANK, AND WHY.
 * Sapir (26/10): five rows + a button under the CTA read as a form and took a
 * quarter of a 375px screen. Industry pages (Google Business Profile, Yelp,
 * Airbnb, Wolt) show one primary action, an icon row, and facts as facts —
 * none of them lists questions beside the button, and Google retired its own
 * Q&A section in 12/2025. So:
 *
 *   - Q1 / Q2 (answer-first)        → unchanged, byte-for-byte (MEH-1302).
 *   - Q3+ category STOCK question   → gone. It had no in-page answer and only
 *     opened WhatsApp, which the escalation row already does.
 *   - Q3+ owner `custom_questions`  → still rendered. She wrote them herself
 *     and there is no off switch for them (MEH-1538 lock, unchanged).
 *   - recipe-idea row (MEH-1462)    → gone; "שאלה אחרת?" covers it.
 *   - escalation "שאלה אחרת?"       → unchanged (then; removed in MEH-3460).
 *
 * The hairline above the block is also conditional now: a producer with no
 * primary CTA (no channel resolves) used to get a card that opened with a
 * detached rule and a "שאלות נפוצות:" caption over one disclosure. The rule
 * separates the block from the button; with no button there is nothing to
 * separate from.
 *
 * MEH-3460 (Sapir 19/11) — NO ANSWER THAT REPEATS THE PAGE.
 *   - Q2 «איך מזמינים?» → gone. Its answer was the primary CTA's own href, so
 *     it could only ever repeat the button directly above it.
 *   - Q1 delivery → a jump to #section-delivery whenever that section renders
 *     (hasDeliverySection, the same gate the section uses). The section is the
 *     full answer; the disclosure gave a cut copy («+ עוד 44»).
 *   - The whole block is closed by default; the caption is the toggle.
 *   - (20/11) The block left the contact card: it is its own page section
 *     («שאלות נפוצות», #section-faq) mounted by ProducerSections right under
 *     «משלוחים». The delivery question is not asked when that section exists
 *     — it sits directly above. No outer toggle; each question opens alone.
 *   - (20/11) The escalation row «שאלה אחרת? צרו איתנו קשר» → gone. It
 *     opened the primary CTA's own channel, so it repeated the button too;
 *     the button and the channel icons below already are "contact us". This
 *     supersedes the MEH-2154 note above that it must always render.
 */

// MEH-2592 C: ready-made questions are pills (like WhatsApp Business quick
// replies) rather than accordion rows, so they read as tappable at a glance.
const QUESTION_PILL =
  "inline-flex items-center gap-1.5 min-h-touch px-3.5 rounded-full border font-body-md text-sm transition focus-visible:ring-2 focus-visible:ring-primary";

/** Collapsible answer row: button + aria-expanded + CaretDown (rotates open). */
function Disclosure({ question, children, defaultOpen = false }) {
  // MEH-3666: the only question on the page starts open (see the caller).
  const [open, setOpen] = useState(defaultOpen);
  return (
    // MEH-2592 C: an open question takes the whole row so its answer has room.
    <li className={open ? "basis-full" : ""}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="quick-answer-toggle"
        className={`${QUESTION_PILL} text-start border-primary/15 bg-green-50 text-primary-dark hover:bg-primary/10`}
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
          className="px-3.5 pt-2 pb-1 font-body-md text-sm text-text"
        >
          {children}
        </div>
      )}
    </li>
  );
}

// MEH-3035 chunk 3: «איך משלמים?» — what the business entered in its
// dashboard («איך משלמים לך?»), as text under ONE Wallet line icon (design
// option א, Sapir 13/11: per-method icons live only in the dashboard picker).
// paymentAnswer (lib/payment-info.js) returns null when nothing usable is set.

function PaymentContent({ answer, t }) {
  return (
    <div className="flex items-start gap-2" data-testid="payment-answer">
      <Wallet size={18} weight="regular" aria-hidden="true" className="mt-0.5 flex-shrink-0 text-primary" />
      <div className="space-y-0.5">
        {answer.methods.length > 0 && (
          <p data-testid="payment-methods">
            {answer.methods.map((m) => t(`payment_methods.${m}`)).join(" · ")}
          </p>
        )}
        {answer.timing && (
          <p data-testid="payment-timing" className="text-fg-muted">
            {t(`payment_timing.${answer.timing}`)}
          </p>
        )}
        {answer.note && (
          <p data-testid="payment-note" className="text-fg-muted">{answer.note}</p>
        )}
      </div>
    </div>
  );
}

// MEH-2634: every row WaItem renders is a wa.me deep link that leaves the site —
// the Q1/Q2 fallbacks AND the owner's custom questions, which have no
// answer-first branch at all. The chip looked like the Disclosure rows beside
// it, which open in place, so the suffix names the destination before the tap.
// It is appended here rather than at each call site precisely because this
// component IS the wa.me branch: a row that renders in-page answers is a
// Disclosure, never a WaItem. MEH-3170: the suffix copy is
// `whatsapp.question_chips.wa_suffix` in messages/*.json (leading space kept).

/** WhatsApp deep-link row (unchanged idiom: ChatCircle glyph + quiet link). */
function WaItem({ href, question, onTrack }) {
  const t = useTranslations("whatsapp.question_chips");
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onTrack}
        data-testid="question-link"
        className={`${QUESTION_PILL} border-primary/15 bg-green-50 text-primary-dark hover:bg-primary/10`}
      >
        <ChatCircle size={16} weight="regular" className="flex-shrink-0" aria-hidden="true" />
        {question}
        {t("wa_suffix")}
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

export default function WhatsAppQuestionChips({ producer }) {
  const t = useTranslations("whatsapp.question_chips");
  const { city: visitorCity } = useUserCity();
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
  // MEH-2602: the question is the VISITOR's — «can you deliver to me?». It
  // used to name the business's own city («אפשר משלוח לבנימינה?» on a
  // Binyamina bakery's page). The city the visitor picked on the site (map /
  // home «איפה אתם?») when there is one, else «אפשר משלוח לאזור שלי?».
  const name = producer?.name || "";

  const deliveryQ = visitorCity
    ? t("delivery_to_city", { city: visitorCity })
    : t("delivery_to_my_area");
  // «איך מזמינים?» is no longer asked (Sapir 19/11): its answer was built
  // from the primary CTA's own href, so it only ever repeated the button right
  // above it. The label is still resolved — an owner's custom question with
  // the same wording is dropped as a duplicate of that button.
  const orderingQ = t("ordering_q");
  const delivery = buildDeliveryAnswer(producer);

  // MEH-1524: every prefill that opens a chat with a specific business ends
  // with a source line on its own final line, so the owner sees the referral
  // source in her own inbox. LOCKED copy — the `source_line` key is defined
  // once and appended here.
  const waHref = (q) =>
    digits
      ? getWhatsAppHref(
          digits,
          `${t("greeting_template", { name, q }).trim()}\n\n${t("source_line")}`,
        )
      : null;

  // MEH-3460 (Sapir 20/11): the «שאלה אחרת? צרו איתנו קשר» escalation row
  // is gone. Its href was the primary CTA's own (WhatsApp greeting or
  // getPrimaryContactHref), so it repeated the button right above the block.

  // MEH-2385: only the owner's own custom questions stay as WhatsApp rows —
  // the category stock set no longer renders. One derivation, shared with the
  // dashboard preview (lib/resolvedQuestions.js), so the two cannot drift.
  const waQuestions = ownerQuestionLabels(producer, {
    // An owner's own «[עיר]» placeholder keeps its pre-2602 reading (the
    // business city) unless the visitor has told us hers.
    city: visitorCity || producer?.city || "",
    deliveryQuestion: deliveryQ,
    orderingQuestion: orderingQ,
  });

  const items = [];

  // Q1 — delivery. When the page has its «משלוח» section the question is not
  // asked: this section sits right under it and the section IS the answer
  // (Sapir 19–20/11). Otherwise answer-first, else WhatsApp fallback.
  const deliveryOnPage = hasDeliverySection(producer);
  if (!deliveryOnPage && delivery) {
    items.push(
      <Disclosure key="delivery" question={deliveryQ}>
        <DeliveryContent answer={delivery} t={t} />
      </Disclosure>,
    );
  } else if (!deliveryOnPage && waEnabled) {
    items.push(
      <WaItem key="delivery" href={waHref(deliveryQ)} question={deliveryQ} onTrack={trackWhatsAppOpen} />,
    );
  }

  // MEH-3035: «איך משלמים?» — answer-first, from her dashboard. No WhatsApp
  // fallback when unset: the question simply does not appear (the button
  // and the channel icons cover it), so a business that said nothing is not shown asking.
  const payment = paymentAnswer(producer?.payment_info);
  if (payment) {
    items.push(
      <Disclosure key="payment" question={t("payment_q")}>
        <PaymentContent answer={payment} t={t} />
      </Disclosure>,
    );
  }

  // Q3+ — her custom questions, WhatsApp only.
  if (waEnabled) {
    waQuestions.forEach((q, i) => {
      items.push(
        <WaItem key={`wa-${i}-${q}`} href={waHref(q)} question={q} onTrack={trackWhatsAppOpen} />,
      );
    });
  }

  // Nothing to show at all → no block (MEH-3460: no escalation row either).
  if (items.length === 0) return null;

  // MEH-3666 (Sapir 21/11): one answer-first question is shown open. A single
  // closed pill under its own heading is a tap that reveals the whole section.
  // Two or more stay closed (MEH-3460). A lone WhatsApp question has no answer
  // here to open, so it stays a link.
  if (items.length === 1 && items[0].type === Disclosure) {
    items[0] = cloneElement(items[0], { defaultOpen: true });
  }

  return <QuestionList items={items} t={t} />;
}

// MEH-1334 chunk 2: progressive-disclosure wrapper — the first VISIBLE_MAX
// ready-made questions render immediately; the rest hide behind one "עוד
// שאלות" expander (single level, no pagination). MEH-1302's answer-first
// behavior of each item is untouched — this only caps how many show at once.
// The container was restyled to the quiet card idiom (hairline top rule,
// tighter row rhythm) per the approved mockup.
const VISIBLE_MAX = 3;

function QuestionList({ items, t }) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = items.length > VISIBLE_MAX;
  const visible = expanded ? items : items.slice(0, VISIBLE_MAX);

  // MEH-3460 (Sapir 20/11, decision card): the questions are their own page
  // section under «משלוחים», not a block inside the contact card. The card
  // keeps one job (the button + the channel icons); FAQs are an extension of
  // the page's details (Airbnb «Things to know», Etsy shop FAQ, Baymard).
  // Each question is still closed until tapped, so no outer toggle.
  return (
    <section
      id="section-faq"
      data-testid="question-chips"
      className="mt-12 scroll-mt-[calc(var(--chrome-top,82px)_+_var(--section-nav-h,68px))] md:scroll-mt-24"
    >
      <SectionHeading size="content" className="mb-4">
        {t("common_questions")}
      </SectionHeading>
      <ul className="flex flex-wrap gap-2">{visible}</ul>

      {/* "עוד שאלות" — reveals the remaining ready-made questions in place.
          ≥44px hit-area via min-h + transparent padding (revision-2 #5). */}
      {hasMore && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          data-testid="more-questions"
          aria-expanded={false}
          className={`${QUESTION_PILL} mt-2 border-primary/15 font-medium text-primary hover:bg-primary/[0.06]`}
        >
          <CaretDown size={16} weight="bold" className="flex-shrink-0" aria-hidden="true" />
          {t("more_questions")}
        </button>
      )}
    </section>
  );
}
