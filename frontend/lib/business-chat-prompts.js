// @ts-check
/**
 * Module:   business-chat-prompts
 * Purpose:  The suggested questions in the chat opened from a business page,
 *           built from THAT page's data (MEH-3505). Before this, every
 *           business showed the same three, and «יש מוצרים בלי גלוטן?» on a
 *           business with no gluten-free product led to «not on the page».
 * Rule:     a question is offered only when the page holds its answer — the
 *           same fields services/chat_business_context.py hands the model:
 *           the signature product's ingredients or description, a dietary
 *           flag on at least one product, delivery, store hours.
 * Does NOT: phrase anything (the labels are chat.business.prompts.* in the
 *           messages files) or open the chat (lib/business-chat.js).
 * History:  MEH-3505 (creation)
 */

import { resolveStoreHours } from "@/lib/hours";

export const MAX_BUSINESS_PROMPTS = 3;

// Product flag → prompt id. Order breaks a tie in the product count.
const DIETARY = /** @type {const} */ ([
  ["is_gluten_free", "diet_gluten_free"],
  ["is_vegan", "diet_vegan"],
  ["is_lactose_free", "diet_lactose_free"],
  ["is_no_added_sugar", "diet_no_added_sugar"],
]);

/** @param {unknown} s */
const filled = (s) => typeof s === "string" && s.trim().length > 0;

/**
 * @typedef {{ id: string, values?: Record<string, string> }} BusinessPrompt
 * @param {any} producer the page's producer (GET /producers/{id})
 * @param {any} [signatureProduct] the product the page features (ProducerSections)
 * @returns {BusinessPrompt[]} at most MAX_BUSINESS_PROMPTS, in priority order
 */
export function businessChatPrompts(producer, signatureProduct = null) {
  if (!producer) return [];
  /** @type {BusinessPrompt[]} */
  const out = [];

  if (
    filled(signatureProduct?.name) &&
    (filled(signatureProduct?.ingredients) || filled(signatureProduct?.description))
  ) {
    out.push({ id: "signature", values: { product: signatureProduct.name.trim() } });
  }

  const products = Array.isArray(producer.products) ? producer.products : [];
  let diet = null;
  let dietCount = 0;
  for (const [flag, id] of DIETARY) {
    const n = products.filter((p) => p?.[flag] === true).length;
    if (n > dietCount) {
      diet = id;
      dietCount = n;
    }
  }
  if (diet) out.push({ id: diet });

  // MEH-1848: area rows left on a business that stopped delivering are not a
  // delivery — the server reads offers_delivery first (_delivers_to).
  const areas = Array.isArray(producer.delivery_areas) ? producer.delivery_areas : [];
  if (producer.offers_delivery === true && (producer.delivery_nationwide === true || areas.length > 0)) {
    out.push({ id: "delivery" });
  }

  if (resolveStoreHours(producer)) out.push({ id: "hours" });

  return out.slice(0, MAX_BUSINESS_PROMPTS);
}
