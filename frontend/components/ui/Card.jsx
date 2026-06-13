"use client";

import { useRouter } from "next/navigation";

/**
 * Card — flat editorial surface primitive (MEH-602).
 *
 * Module:   Card
 * Purpose:  Reusable card shell derived VERBATIM from the shipped "Assembly v2"
 *           ProducerCard. Net-new atom — nothing consumes it yet (migration is
 *           MEH-131-135 / MEH-76 / MEH-122).
 * Does NOT: render ProducerCard's domain content (badges/heart/price) — those
 *           stay in ProducerCard.jsx; this is the bare shell + slots.
 * Related:  ProducerCard.jsx:219-368 (source of truth), MEH-643 (Assembly v2).
 * History:  MEH-602 (creation).
 *
 * LOCKED invariants (shipped wins over any mockup — a mockup showing rounded
 * corners or a hover shadow-lift loses to these):
 *   - rounded-none, 1px border, bg-surface-card, flex flex-col, group
 *   - hover = border-color shift ONLY (hover:border-primary). NO shadow-lift.
 *   - active = border-primary ring-2 ring-primary
 *
 * Variants (border-weight only). The ticket's "elevated"/shadow variant is
 * DROPPED — it contradicts Assembly-v2:
 *   default — 1px resting border (border-border)
 *   flat    — borderless at rest (border-transparent); identical hover/active
 *
 * The root is NEVER a whole-card anchor. It ignores clicks that land on an
 * <a>/<button> descendant (so inner links/heart keep working) and navigates via
 * `href` (router.push) or `onClick` only on a bare-surface click — mirroring
 * ProducerCard.jsx:210-217. Consumers place their own <Link> inside the slots.
 *
 * Slots: `media` (+ `overlay` layered absolutely over it) / `children` (body) /
 * `footer`. Body+footer share one flex column so `footer` mt-auto aligns to the
 * card bottom in equal-height grids.
 *
 * @example
 * <Card href="/producer/1" media={<Image .../>} overlay={<Heart/>} footer={<Price/>}>
 *   <Heading level={3}>שם העסק</Heading>
 * </Card>
 */
const VARIANT_BORDER = {
  default: "border-border",
  flat: "border-transparent",
};

export default function Card({
  active = false,
  onClick,
  href,
  variant = "default",
  media,
  overlay,
  footer,
  className = "",
  children,
}) {
  const router = useRouter();
  const interactive = !!(onClick || href);

  const handleRootClick = (e) => {
    // Mirror ProducerCard: never hijack a click meant for an inner link/button.
    if (e.target.closest("a, button")) return;
    if (onClick) onClick(e);
    else if (href) router.push(href);
  };

  const borderRest = VARIANT_BORDER[variant] || VARIANT_BORDER.default;

  return (
    <article
      onClick={interactive ? handleRootClick : undefined}
      className={[
        "bg-surface-card overflow-hidden border flex flex-col rounded-none group transition-colors duration-base ease-quart",
        active
          ? "border-primary ring-2 ring-primary"
          : `${borderRest} hover:border-primary`,
        interactive ? "cursor-pointer" : "",
        className,
      ].join(" ")}
    >
      {(media || overlay) && (
        <div className="relative">
          {media}
          {overlay}
        </div>
      )}

      {(children || footer) && (
        <div className="p-4 flex flex-1 flex-col gap-2">
          {children}
          {footer && (
            <div className="mt-auto pt-3 flex items-center justify-between gap-2">
              {footer}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
