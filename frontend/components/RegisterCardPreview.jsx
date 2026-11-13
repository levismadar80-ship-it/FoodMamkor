// @ts-check
"use client";

import { useTranslations } from "next-intl";
import { CaretDown } from "@phosphor-icons/react";
import ProducerCard from "@/components/ProducerCard";
import { INERT_PRESENT } from "@/lib/inert-attr";

/**
 * RegisterCardPreview — MEH-3074.
 *
 * Purpose:  On the signup wizard's STORY step, let the owner open a preview of
 *           the card the site will show for her business, fed from what she
 *           has typed so far (name, city, first category, the one-line dek).
 * Does NOT: draw its own card. It mounts the real ProducerCard, so the preview
 *           cannot drift from the site. The card is `inert`: there is no page
 *           to open and nothing to save yet. No photo exists before signup, so
 *           the card shows its own no-image fallback.
 * States:   closed (default) / open — a native <details>, the site's FAQ
 *           pattern (app/[locale]/join/page.js). Always exactly one card.
 * Related:  app/[locale]/register/producer/RegisterProducerClient.jsx (mount).
 */

/**
 * The producer object the card needs, built from the wizard's form.
 * @param {Record<string, any>} form
 * @param {Array<{ id: number, name: string }>} categories
 */
export function previewProducer(form, categories) {
  const picked = (categories || []).filter((c) => (form.category_ids || []).includes(c.id));
  return {
    id: 0,
    name: form.producer_name,
    city: form.city,
    short_description: form.short_description,
    categories: picked,
    images: [],
    has_physical_location: form.has_physical_location,
    offers_delivery: form.offers_delivery,
    favorites_count: 0,
    reviews_count: 0,
    avg_rating: null,
  };
}

/** @param {{ form: Record<string, any>, categories: Array<{ id: number, name: string }> }} props */
export default function RegisterCardPreview({ form, categories }) {
  const t = useTranslations("auth.register.producer");
  return (
    <details
      data-testid="register-card-preview"
      className="group rounded-md border border-border bg-surface-card"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md px-4 py-3 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
        {t("card_preview.summary")}
        <CaretDown
          aria-hidden="true"
          size={18}
          className="shrink-0 transition-transform motion-reduce:transition-none group-open:rotate-180"
        />
      </summary>
      {/* max-w: a card on the site sits in a grid column, never full form width. */}
      <div className="mx-auto max-w-[320px] px-4 pb-4" inert={/** @type {any} */ (INERT_PRESENT)} data-testid="register-card-preview-body">
        <ProducerCard
          producer={previewProducer(form, categories)}
          active={false}
          onClick={undefined}
          referrer={undefined}
        />
      </div>
    </details>
  );
}
