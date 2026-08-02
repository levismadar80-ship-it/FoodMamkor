/**
 * OfferBadge — MEH-1823 chunk 3.
 *
 * Purpose:  Render a business's single active offer, in two sizes: a `badge`
 *           above the delivery block on the business page, and a short `chip`
 *           on ProducerCard.
 * Does NOT: decide whether the offer is live. The server already did — an
 *           expired offer is filtered out server-side (Producer.active_offer,
 *           models.py) and never reaches the client. The expiry check below is
 *           defence in depth for a leaked payload, not the mechanism.
 * Related:  frontend/components/DeliveryBlock.jsx:271-280 (the <bdi> reasoning
 *           this file reuses verbatim).
 * History:  MEH-1823 (creation, chunk 3/3).
 *
 * ZERO VISUAL CHANGE when there is no offer: every caller renders nothing at
 * all, rather than an empty wrapper that would still take flow space.
 */
"use client";

import { Gift } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

// The typed vocabulary, mirrored from schemas.py OFFER_TYPES / THRESHOLD_UNITS.
// An unknown value renders nothing rather than a raw key — a backend that grows
// a fifth type must not leak "offer.text.new_type" onto a consumer surface.
const OFFER_TYPES = new Set([
  "free_delivery_above",
  "gift_above",
  "first_order",
  "pickup_discount",
]);
const UNITS = new Set(["ils", "units", "liters", "kg"]);

// Split marker for the {amount} placeholder. The translated sentence puts the
// number mid-phrase in Hebrew, so the amount is isolated in its own <bdi> —
// RTL otherwise reorders "150 ₪". Same choice, and the same reason, as
// DeliveryBlock: <bdi> rather than U+2066/U+2069, because the Unicode isolates
// land in textContent where they are invisible and silently break getByText and
// Playwright assertions written against the rendered copy.
// Written as an explicit \u escape, never as the invisible literal: MEH-1373
// hit exactly this in alerts.py, where ZWJ/VS16 sat unescaped inside a
// character class and copy-paste, linters and merges silently dropped or
// duplicated them. It also must not be "" — an empty separator makes
// split() return every character individually. The marker never reaches
// textContent: the sentence is split ON it, so it is consumed.
const AMOUNT_SLOT = "\u0001";

export default function OfferBadge({ offer, variant = "badge", className = "" }) {
  const t = useTranslations("producer.offer");
  if (!offer || !OFFER_TYPES.has(offer.offer_type)) return null;

  // Defence in depth only — see "Does NOT" above. Uses a date-only comparison
  // so a client in a different timezone cannot shave a day off a live offer.
  if (offer.expires_at && offer.expires_at < new Date().toISOString().slice(0, 10)) {
    return null;
  }

  // `!= null` and not truthiness: threshold_value is a positive integer or
  // null, and a truthiness test would be one refactor away from swallowing a
  // legitimate value. The pair is both-or-neither by DB CHECK, so testing one
  // of the two is enough — but the unit is validated before use anyway.
  const hasThreshold =
    offer.threshold_value != null && UNITS.has(offer.threshold_unit);

  let content;
  if (hasThreshold) {
    const amount = `${offer.threshold_value} ${t(`units.${offer.threshold_unit}`)}`;
    const [before, after] = t(`text_with.${offer.offer_type}`, {
      amount: AMOUNT_SLOT,
    }).split(AMOUNT_SLOT);
    content = (
      <>
        {before}
        <bdi>{amount}</bdi>
        {after}
      </>
    );
  } else {
    content = t(`text.${offer.offer_type}`);
  }

  if (variant === "chip") {
    return (
      <span
        data-testid="offer-chip"
        className={`inline-flex w-fit items-center gap-1 rounded-full bg-primary/10 border border-primary/30 text-primary px-2 py-0.5 text-[11px] font-semibold ${className}`}
      >
        <Gift size={12} weight="fill" aria-hidden="true" className="shrink-0" />
        <span className="truncate">{content}</span>
      </span>
    );
  }

  return (
    <div
      data-testid="offer-badge"
      className={`inline-flex items-start gap-2 rounded-[10px] bg-primary/10 border border-primary/30 px-3 py-2 text-sm text-primary ${className}`}
    >
      <Gift size={18} weight="fill" aria-hidden="true" className="shrink-0 mt-0.5" />
      <span>
        <span className="font-semibold">{content}</span>
        {/* The owner's free-text line, when she wrote one. Secondary to the
            typed sentence above it, never a replacement for it — the typed
            string is the part the platform can guarantee. */}
        {offer.headline ? (
          <span className="block text-fg-muted text-xs mt-0.5" data-testid="offer-headline">
            {offer.headline}
          </span>
        ) : null}
      </span>
    </div>
  );
}
