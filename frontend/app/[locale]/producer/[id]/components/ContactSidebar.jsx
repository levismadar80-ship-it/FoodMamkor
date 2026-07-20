import ContactCard from "./ContactCard";

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
        <ContactCard producer={producer} isVacation={isVacation} />
      </div>
    </aside>
  );
}
