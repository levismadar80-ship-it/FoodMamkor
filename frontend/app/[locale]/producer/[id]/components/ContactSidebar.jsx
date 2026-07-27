import ContactCard from "./ContactCard";
import { OrderWindowCtaNote } from "./OrderWindowStrip";

/**
 * Desktop-only sticky wrapper around the shared ContactCard — the second
 * cell of ProducerDetail's two-column grid at lg+. On mobile/tablet the
 * card is mounted inline by ProducerDetail (the sticky-bar IO target), so
 * this wrapper is hidden below lg to keep exactly one primary CTA visible
 * per viewport (MEH-1146 chunk A). All card chrome + contact affordances
 * live in ContactCard.
 */
export default function ContactSidebar({ producer, isVacation }) {
  return (
    <aside className="hidden lg:block">
      <div className="lg:sticky lg:top-24">
        {/* MEH-1600: the MEH-1546 closed-state context line, mirrored from the
            mobile inline mount (ProducerDetail.jsx) — same component, same
            key, same directly-above-the-card placement. INSIDE the existing
            sticky child, so the <aside> stays the stretched grid item and
            sticky travel is untouched (the MEH-1546 wrapper concern). The
            note self-gates: renders nothing unless the window is closed. */}
        <OrderWindowCtaNote orderWindow={producer.order_window} />
        <ContactCard producer={producer} isVacation={isVacation} />
      </div>
    </aside>
  );
}
