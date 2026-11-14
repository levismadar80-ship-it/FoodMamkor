// @ts-check
"use client";

import { CaretDown, CaretUp } from "@phosphor-icons/react";

/**
 * Module:   ShowMore
 * Purpose:  The one "show more / show less" control for a list that grows in
 *           place, so every such button on the site looks and reads the same.
 * Does NOT: navigate (a "to all X" link is a <Link>, not this), own the copy
 *           (the caller passes the label), or own the list state.
 * Related:  components/ReviewsSection.jsx, components/DeliveryBlock.jsx,
 *           components/CategorySelector.jsx,
 *           app/[locale]/home/HomeProducersGrid.jsx,
 *           app/[locale]/producer/[id]/components/ProducerActivities.jsx
 * History:  MEH-3052 (creation) — nine hand-rolled expanders in five looks.
 *           Research: claude.ai/artifact/WxGjjoDQuxLS7YWeHPrJca.
 *
 * Two sizes, one look family (Airbnb / Google Maps pattern):
 *   size="block"  — ends a page list. Green outline, rounded-full, full width
 *                   on a phone, centred on desktop. Usually no "show less"
 *                   (MEH-1387), so `expanded` is left undefined.
 *   size="inline" — inside a box (delivery cities, categories). Green text +
 *                   caret, 44px tap target. Pass `expanded` for show-less.
 *
 * `expanded` drives the caret and aria-expanded. Leave it undefined for a
 * one-way "load more", where aria-expanded would be a false promise.
 */

// Exported so a slot that swaps the button for a link (home grid at its cap)
// keeps the identical block look.
export const SHOW_MORE_BLOCK_CLASSES =
  "flex w-full sm:w-fit sm:min-w-[280px] sm:mx-auto min-h-touch items-center justify-center gap-1.5 rounded-full border border-primary px-7 text-base font-semibold text-primary hover:bg-primary/5 active:bg-primary/10 disabled:opacity-50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

const SIZE_CLASSES = {
  block: SHOW_MORE_BLOCK_CLASSES,
  inline:
    "inline-flex min-h-touch items-center gap-1 text-sm font-semibold text-primary hover:text-primary-dark disabled:opacity-50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
};

/**
 * @param {{
 *   onClick: () => void,
 *   label: string,
 *   size?: "block" | "inline",
 *   expanded?: boolean,
 *   disabled?: boolean,
 *   className?: string,
 *   "data-testid"?: string,
 *   "aria-controls"?: string,
 * }} props
 */
export default function ShowMore(props) {
  const { onClick, label, size = "block", expanded, disabled, className = "" } = props;
  const Caret = expanded ? CaretUp : CaretDown;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={expanded}
      aria-controls={props["aria-controls"]}
      data-testid={props["data-testid"]}
      data-show-more={size}
      className={[
        SIZE_CLASSES[size] || SIZE_CLASSES.block,
        className,
      ].join(" ")}
    >
      {label}
      <Caret size={16} weight="bold" aria-hidden="true" className="shrink-0" />
    </button>
  );
}
