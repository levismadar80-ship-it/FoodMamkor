/**
 * Module:   resolvedQuestions
 * Purpose:  Resolve WHICH ready-made questions a producer's public page shows
 *           right now, and how each one is served (answered in-page vs opens a
 *           channel). The dashboard's questions card renders this so an owner
 *           sees her real page instead of five empty inputs (MEH-2155).
 * Touches:  nothing — pure. No React, no I/O, no i18n: every user-visible
 *           string is passed IN by the caller (see `labels` below), which is
 *           also what keeps this byte-identical to the public page.
 * Does NOT: render, translate, build hrefs, or decide the ORDER the public page
 *           caps at three-plus-expander — that is presentation and belongs to
 *           WhatsAppQuestionChips.jsx. It also does not read the DOM: this is
 *           derivation from the same producer payload the page receives.
 * Related:  frontend/components/WhatsAppQuestionChips.jsx (the public renderer
 *           this mirrors), frontend/lib/quickAnswers.js:41,103,
 *           frontend/lib/contact-method.js (isWhatsAppPrimary, MEH-2154).
 * History:  MEH-2155 (creation) · MEH-2385 (category stock set + recipe row
 *           dropped from the public block; only her custom questions remain
 *           as Q3+).
 *
 * ── THE HONESTY PROBLEM THIS SOLVES, AND THE ONE IT DOES NOT ────────────────
 * The dashboard card is titled "שאלות שמופיעות בדף שלך" and then showed
 * "עוד אין שאלות מותאמות" — while the public page was serving a full set of
 * category defaults. A new owner met questions she had never seen on a profile
 * she had just written. This module is what lets the card state the truth.
 *
 * What it does NOT solve: this is a SECOND derivation of the resolution rules,
 * beside the component's own. MEH-2155's scope holds WhatsAppQuestionChips.jsx
 * to read-only (MEH-2154 owns it), so the component was not refactored onto
 * this helper — which would have been the real single-owner fix.
 *
 * That leaves the exact drift risk `workflow.md` § Smell #1 warns about, so it
 * is bound MECHANICALLY rather than by a comment asking the next reader to
 * remember: `__tests__/ResolvedQuestionsParity.test.jsx` renders the REAL
 * component and asserts, item for item, that what it puts on screen is what
 * this function returns. Change either side alone and that test reds. The
 * follow-up that deletes the duplication is to have the component consume this
 * helper; until then, the test is the contract.
 *
 * ── WHY THE LABELS ARE ARGUMENTS ───────────────────────────────────────────
 * Q3+ has to drop any custom question that duplicates Q1/Q2, and the
 * component does that by comparing her raw Hebrew strings against its own
 * TRANSLATED `delivery_to_city` / `ordering_q`
 * (WhatsAppQuestionChips.jsx — the `.filter()` over `custom_questions`).
 * Re-deriving those strings here would make the two implementations agree only
 * in Hebrew: under `/en` the component's comparison stops matching, and a
 * helper that filtered on the Hebrew literals would then disagree with the page
 * it claims to mirror. Taking the resolved strings as inputs means both sides
 * filter on the same values in every locale — including the locale where that
 * filter does not work, which the dashboard must reflect rather than correct.
 */
import { normalizePhone } from "@/lib/utils";
import { buildDeliveryAnswer, buildOrderingAnswer } from "@/lib/quickAnswers";
import {
  getPrimaryContactHref,
  getPrimaryMethod,
  isWhatsAppPrimary,
} from "@/lib/contact-method";

/**
 * The literal the component also strips, on top of the two resolved labels.
 * It is the legacy stock wording ("יש משלוח?") that older custom lists may
 * still carry, not an i18n string, so it is safe to name here — and it lives
 * in one place so a future edit has a single site to update.
 */
const DUPLICATE_OF_DELIVERY = "יש משלוח?";

/**
 * @param {object|null|undefined} producer — public ProducerDetailOut shape
 * @param {{
 *   deliveryQuestion: string,   // t("delivery_to_city", { city })
 *   orderingQuestion: string,   // t("ordering_q")
 *   escalationQuestion: string, // t("escalation")
 * }} labels — resolved by the caller from `whatsapp.question_chips`
 * @returns {{
 *   items: Array<{
 *     id: string,
 *     label: string,
 *     answered: boolean,        // true = answered in-page from her own data
 *     channel: string|null,     // primary_contact_method the row opens, if any
 *     source: "delivery"|"ordering"|"custom"|"escalation",
 *   }>,
 *   usesCustom: boolean,        // she wrote custom questions (MEH-2385: there
 *                               // is no default set to replace any more)
 *   customCount: number,
 * }}
 */
export function resolveProducerQuestions(producer, labels) {
  const digits = normalizePhone(producer?.phone);
  const waEnabled = isWhatsAppPrimary(producer) && !!digits;
  const method = getPrimaryMethod(producer);
  const delivery = buildDeliveryAnswer(producer);
  const ordering = buildOrderingAnswer(producer);

  const custom = (producer?.custom_questions || []).filter(Boolean);
  const usesCustom = custom.length > 0;

  const items = [];

  // Q1 — answered from her delivery data, else a WhatsApp row, else absent.
  if (delivery) {
    items.push({
      id: "delivery",
      label: labels.deliveryQuestion,
      answered: true,
      channel: null,
      source: "delivery",
    });
  } else if (waEnabled) {
    items.push({
      id: "delivery",
      label: labels.deliveryQuestion,
      answered: false,
      channel: "whatsapp",
      source: "delivery",
    });
  }

  // Q2 — a "whatsapp" ordering answer needs a number to be worth showing; the
  // component drops it otherwise rather than showing an answer that says
  // "message her" with nowhere to send.
  if (ordering && (ordering.kind !== "whatsapp" || digits)) {
    items.push({
      id: "ordering",
      label: labels.orderingQuestion,
      answered: true,
      channel: null,
      source: "ordering",
    });
  } else if (!ordering && waEnabled) {
    items.push({
      id: "ordering",
      label: labels.orderingQuestion,
      answered: false,
      channel: "whatsapp",
      source: "ordering",
    });
  }

  // Q3+ — her custom questions only (MEH-2385: the category stock set no
  // longer renders), minus the two that would duplicate Q1/Q2. WhatsApp-only,
  // per MEH-2154.
  if (waEnabled) {
    const city = producer?.city || "";
    custom
      .map((q) => (city ? q.replace("[עיר]", city) : q))
      .filter(
        (q) =>
          q !== labels.orderingQuestion &&
          q !== labels.deliveryQuestion &&
          q !== DUPLICATE_OF_DELIVERY,
      )
      .forEach((label, i) => {
        items.push({
          id: `q-${i}`,
          label,
          answered: false,
          channel: "whatsapp",
          source: "custom",
        });
      });
  }

  // Escalation — the contact channel itself. Present whenever ANY channel
  // resolves (MEH-2154); on WhatsApp it needs the number the deep-link uses.
  const escalationLives = waEnabled || !!getPrimaryContactHref(producer);
  if (escalationLives) {
    items.push({
      id: "escalation",
      label: labels.escalationQuestion,
      answered: false,
      channel: waEnabled ? "whatsapp" : method,
      source: "escalation",
    });
  }

  return { items, usesCustom, customCount: custom.length };
}
