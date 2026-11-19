// @ts-check
"use client";

/**
 * Module:   OwnerAttentionCard
 * Purpose:  «מה מחכה לך» — the top of the dashboard home lists what is
 *           waiting for the owner right now, each row one tap from the tool
 *           that handles it (MEH-3108; Airbnb «Today», Shopify home tasks).
 * Touches:  nothing — renders `attention` from GET /producers/me/dashboard
 *           (backend/app/services/owner_attention.py).
 * Does NOT: fetch, or show an empty state — with nothing waiting the card is
 *           not rendered at all.
 * Related:  app/[locale]/producer/dashboard/page.js (mounts it under the
 *           greeting).
 * History:  MEH-3108 (creation); MEH-3316 (on-site orders waiting, first row);
 *           MEH-3430 (no products yet → upload a menu, last row; not for an
 *           organizer, who has no catalog).
 */

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const SIGNUP_HREF = {
  event: "/producer/dashboard/events",
  experience: "/producer/dashboard/experiences",
};

/**
 * The rows to show, in a fixed order: orders waiting (MEH-3316), reviews, the item with the most new
 * sign-ups, funded group buys, no products yet (MEH-3430). At most 5.
 * @param {any} attention
 * @param {boolean} [isOrganizer]
 * @returns {{ key: string, text: [string, Record<string, any>], cta: string, href: string }[]}
 */
function attentionRows(attention, isOrganizer = false) {
  if (!attention) return [];
  /** @type {{ key: string, text: [string, Record<string, any>], cta: string, href: string }[]} */
  const rows = [];
  // MEH-3316: orders waiting for an answer come first — they expire.
  const orders = Number(attention.pending_orders) || 0;
  if (orders > 0) {
    rows.push({ key: "orders", text: ["orders", { count: orders }], cta: "orders_cta", href: "/producer/dashboard/orders" });
  }
  const reviews = Number(attention.unreplied_reviews) || 0;
  if (reviews > 0) {
    rows.push({ key: "reviews", text: ["reviews", { count: reviews }], cta: "reviews_cta", href: "/producer/dashboard/reviews" });
  }
  const top = Array.isArray(attention.new_signups) ? attention.new_signups[0] : null;
  if (top && top.count > 0 && SIGNUP_HREF[/** @type {"event"|"experience"} */ (top.kind)]) {
    rows.push({
      key: "signups",
      text: ["signups", { count: top.count, title: top.title }],
      cta: "signups_cta",
      href: SIGNUP_HREF[/** @type {"event"|"experience"} */ (top.kind)],
    });
  }
  const funded = Number(attention.funded_group_buys) || 0;
  if (funded > 0) {
    rows.push({ key: "group_buys", text: ["group_buys", { count: funded }], cta: "group_buys_cta", href: "/producer/dashboard/group-buys" });
  }
  // MEH-3430: exactly 0 — the backend sends -1 when the count failed, and an
  // old backend sends nothing; neither must tell her she has no products.
  if (!isOrganizer && attention.products === 0) {
    rows.push({ key: "menu", text: ["menu", {}], cta: "menu_cta", href: "/producer/dashboard/edit#products" });
  }
  return rows;
}

/** @param {{ attention: any, isOrganizer?: boolean }} props */
export default function OwnerAttentionCard({ attention, isOrganizer = false }) {
  const t = useTranslations("dashboard.producer.attention");
  const rows = attentionRows(attention, isOrganizer);
  if (rows.length === 0) return null;
  return (
    <section
      data-testid="owner-attention"
      aria-labelledby="owner-attention-heading"
      className="bg-surface border border-primary rounded-lg p-4 mb-6"
    >
      <h2 id="owner-attention-heading" className="font-semibold text-text mb-2">
        {t("title")}
      </h2>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.key} data-testid={`owner-attention-${r.key}`} className="flex items-center gap-3 py-2">
            <span className="w-2 h-2 rounded-full bg-primary shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0 text-sm text-text">{t(r.text[0], r.text[1])}</span>
            <Link
              href={r.href}
              className="min-h-touch inline-flex items-center text-sm text-primary font-medium underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current shrink-0"
            >
              {t(r.cta)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
