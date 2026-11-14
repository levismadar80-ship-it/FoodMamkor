// @ts-check
import { Star } from "@phosphor-icons/react";

/**
 * RatingCompact — the card rating «★ X.X (N)» (MEH-3071).
 *
 * Module:   RatingCompact
 * Purpose:  The one compact rating on a listing card (ProducerCard, the /map
 *           selection card): a filled accent star, the average to one decimal,
 *           the review count in brackets — the whole block dir="ltr"
 *           (MEH-1243 🔒 §7, Google format); the numbers sit in an LTR <bdi>
 *           so a Hebrew neighbour cannot reorder them. Show it only when
 *           hasCardRating(producer) (lib/rating-gate.js) says so.
 *             size="sm" (default) 14px text, 13px star — ProducerCard
 *             size="xs" 12px text, 12px star — MapProducerCard
 * Does NOT: decide whether to show (the caller gates), or draw the business
 *           page's big rating link / the distribution bars — those are
 *           different formats on purpose (ProducerHeader, ReviewsSection).
 * Why:      until 13/11 ProducerCard and MapProducerCard each wrote the line
 *           and the ≥3-reviews rule by hand, and components/StarRating.jsx (a
 *           third format) was imported nowhere. Guard: RatingCompactGuard.test.js.
 *
 * @param {{ avg: number | string, count: number, size?: "sm" | "xs", className?: string, [key: string]: any }} props
 */
export default function RatingCompact({ avg, count, size = "sm", className = "", ...rest }) {
  const text = size === "xs" ? "text-xs" : "text-sm";
  const star = size === "xs" ? 12 : 13;
  return (
    <span dir="ltr" className={`whitespace-nowrap text-fg-muted ${text} ${className}`} {...rest}>
      <Star size={star} weight="fill" className="text-accent inline align-[-1px]" aria-hidden="true" />{" "}
      <bdi dir="ltr">
        {Number(avg).toFixed(1)} ({count})
      </bdi>
    </span>
  );
}
