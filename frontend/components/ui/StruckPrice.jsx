// @ts-check
/**
 * StruckPrice — the old or regular price, struck through, beside the price
 * actually paid (MEH-3465).
 *
 * Module:   StruckPrice
 * Purpose:  The one way a crossed-out price is drawn: an <s>, left-to-right so
 *           ₪ and the digits keep their order inside RTL, muted, struck.
 *           `className` carries only the size and the font of the line
 *           (`text-xs numeric`, `text-2xl leading-none`).
 * Does NOT: format the number (the caller passes the formatted string); decide
 *           whether there IS a discount (the caller renders it only when the
 *           old price is above the paid one).
 * a11y:     `decorative` (the default) hides it from screen readers. Read aloud
 *           as two bare prices it says nothing; the paid price is the one
 *           announced. Pass `decorative={false}` where the struck price has
 *           its own visible label (the group-buy page's «מחיר רגיל» box), and
 *           where nothing else on the card says what it was (the home
 *           «מה קורה» card, the owner and admin group-buy rows): there the
 *           old price is the information, and hiding it would drop it.
 * Why:      until 21/11 seven screens each wrote their own: some a <span> with
 *           `line-through`, some an <s>, some hidden from screen readers and
 *           some not (MEH-3465 duplicates audit).
 *           Guard: __tests__/StruckPriceOneOwnerGuard.test.jsx.
 *
 * @example
 * <StruckPrice className="text-xs numeric">{formatPrice(48)}</StruckPrice>
 */

/**
 * @param {{
 *   children: import("react").ReactNode,
 *   className?: string,
 *   decorative?: boolean,
 *   testId?: string,
 * }} props
 */
export default function StruckPrice({ children, className = "", decorative = true, testId }) {
  return (
    <s
      dir="ltr"
      aria-hidden={decorative ? "true" : undefined}
      className={`text-fg-muted line-through ${className}`.trim()}
      data-testid={testId}
    >
      {children}
    </s>
  );
}
