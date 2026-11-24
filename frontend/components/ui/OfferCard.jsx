// @ts-check
"use client";

import { Link } from "@/i18n/navigation";
import StruckPrice from "@/components/ui/StruckPrice";

/**
 * Module:   OfferCard
 * Purpose:  The one card for a time-limited offer on a business page — a group
 *           buy and a surprise bag — so the two read as one family: optional
 *           icon tile, title + «where» lines, big price with the struck regular
 *           price, gold saving line, beige status band, then any actions.
 * Does NOT: fetch, format prices or decide what to say — callers pass ready
 *           text. Does not set its width: the parent grid does (both offer
 *           sections use `grid gap-3 sm:grid-cols-2`, so the cards match).
 * Related:  app/[locale]/producer/[id]/components/ProducerActivities.jsx
 *           (GroupBuyRow) · components/rescue/RescueSection.jsx (bag card)
 * History:  MEH-3585 (Sapir 21/11: «עיצוב אחיד» — the bag card was a second
 *           hand-written copy and drifted: double width, a bare «נשארו 4»)
 */

/**
 * @param {object} props
 * @param {string} [props.href]          the whole card is this link (no buttons inside then)
 * @param {string} props.testId
 * @param {import("react").ReactNode} [props.icon]      a tile before the title
 * @param {import("react").ReactNode} [props.title]     h3 text; omitted → no h3
 * @param {string} [props.titleTestId]
 * @param {import("react").ReactNode} [props.trailing]  beside the title (e.g. a caret)
 * @param {import("react").ReactNode} [props.lines]     under the title (product, where)
 * @param {import("react").ReactNode} [props.price]     the price the buyer pays
 * @param {string} [props.priceTestId]
 * @param {import("react").ReactNode} [props.worth]     struck-through regular price
 * @param {string} [props.worthTestId]
 * @param {import("react").ReactNode} [props.unit]      unit text after the price
 * @param {import("react").ReactNode} [props.saving]    the gold line; falsy → none
 * @param {string} [props.savingTestId]
 * @param {import("react").ReactNode} [props.bandStart] beige band, start side (status)
 * @param {import("react").ReactNode} [props.bandEnd]   beige band, end side (time)
 * @param {import("react").ReactNode} [props.children]  actions under the band
 */
export default function OfferCard(props) {
  const { href, testId, children } = props;
  const cls = "flex flex-col gap-3 rounded-lg border border-border bg-surface-card p-4";
  const body = (
    <>
      <OfferHead {...props} />
      <OfferPrice {...props} />
      <OfferBand {...props} />
      {children}
    </>
  );
  return href ? (
    <Link href={href} data-testid={testId} className={`${cls} hover:border-primary transition focus-ring`}>
      {body}
    </Link>
  ) : (
    <div data-testid={testId} className={cls}>
      {body}
    </div>
  );
}

/** @param {any} props */
function OfferHead({ icon, title, titleTestId, trailing, lines }) {
  return (
    <div className="flex items-start gap-3">
      {icon && (
        <span aria-hidden="true" className="w-11 h-11 rounded-lg bg-green-50 text-primary grid place-items-center shrink-0">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {(title || trailing) && (
          <div className="flex items-start justify-between gap-3">
            {title && (
              <h3 className="font-headline-md text-lg font-bold text-text leading-snug line-clamp-2 min-w-0" data-testid={titleTestId}>
                {title}
              </h3>
            )}
            {trailing}
          </div>
        )}
        {lines}
      </div>
    </div>
  );
}

/** @param {any} props */
function OfferPrice({ price, priceTestId, worth, worthTestId, unit, saving, savingTestId }) {
  if (price === null || price === undefined) return null;
  return (
    <div>
      <p className="flex items-baseline gap-2">
        <span dir="ltr" className="font-headline-md text-2xl font-black text-primary leading-none numeric" data-testid={priceTestId}>
          {price}
        </span>
        {worth !== null && worth !== undefined && (
          // Decorative (aria-hidden): read aloud as a second bare price it says nothing useful.
          <StruckPrice className="text-sm numeric" testId={worthTestId}>
            {worth}
          </StruckPrice>
        )}
        {unit && <span className="text-xs text-fg-muted">{unit}</span>}
      </p>
      {saving ? (
        <p className="mt-1 text-xs font-semibold text-gold-deep" data-testid={savingTestId}>
          {saving}
        </p>
      ) : null}
    </div>
  );
}

/** @param {any} props */
function OfferBand({ bandStart, bandEnd }) {
  if (!bandStart && !bandEnd) return null;
  // flex-wrap: ten seeds + a long count can exceed a 375 card; the end side
  // then drops under the start side instead of overflowing.
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg bg-background-alt px-2.5 py-2">
      {bandStart && <span className="flex items-center gap-2 min-w-0">{bandStart}</span>}
      {bandEnd && <span className="flex items-center gap-1 text-xs text-fg-muted shrink-0">{bandEnd}</span>}
    </div>
  );
}
