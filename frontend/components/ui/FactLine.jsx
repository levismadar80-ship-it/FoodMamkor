// @ts-check
/**
 * FactLine — one line stating one fact, led by the icon for that KIND of fact
 * (MEH-3028).
 *
 * Module:   FactLine
 * Purpose:  The only way a fact line on the business page gets an icon, so
 *           every such icon has the same size, colour and spacing. Kinds in
 *           use: delivery fee → Truck, order cutoff / hours → Clock, city →
 *           MapPin, self-pickup → Package.
 *           No `icon` → the same row with no icon (a line whose kind already
 *           has its icon nearby, e.g. the one-day form of the day labels).
 * Does NOT: style the text beyond the shared row (`className` carries the text
 *           size, colour, weight and margin of the line); appear inside a
 *           <SectionHeading> — a section heading is text only.
 * Why:      until 13/11 «משלוחים» was the only heading on the site with an
 *           icon, its truck repeated on every day label, and the city pin was
 *           grey 14 beside a green 16 truck. Sapir chose option א («icons on
 *           fact lines only», research artifact FGymGHjHMLDCstmSEDP2Bm).
 *           Guard: __tests__/FactLineIconGuard.test.js.
 * Related:  components/ui/SectionHeading.jsx.
 *
 * @example
 * <FactLine icon={MapPin} className="text-muted mb-3">קצרין</FactLine>
 */
export const FACT_ICON_SIZE = 14;

// The icon sits in a box one line tall, so on a line that wraps it stays
// beside the FIRST line instead of drifting to the middle of the block.
/**
 * @param {{ icon?: any, as?: any, className?: string, children?: import("react").ReactNode, [key: string]: any }} props
 */
export default function FactLine({ icon: Icon, as: Tag = "p", className = "", children, ...rest }) {
  return (
    <Tag className={`flex items-start gap-1.5${className ? ` ${className}` : ""}`} {...rest}>
      {Icon && (
        <span className="flex h-[1lh] shrink-0 items-center">
          <Icon size={FACT_ICON_SIZE} className="text-fg-muted" aria-hidden="true" data-fact-icon="" />
        </span>
      )}
      <span className="min-w-0">{children}</span>
    </Tag>
  );
}
