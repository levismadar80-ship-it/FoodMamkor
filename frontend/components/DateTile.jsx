/**
 * Module:   DateTile
 * Purpose:  The small month/day calendar tile that leads the date row of the
 *           event and experience details cards (Luma's date-row icon). It
 *           replaces both the old tile on the cover and the card's large
 *           desktop header, which repeated the same date (MEH-2989).
 * Does NOT: format the date — callers pass the localised month and day.
 * Related:  app/[locale]/events/[id]/EventDetailClient.jsx ·
 *           app/[locale]/experiences/[id]/ExperienceDetailClient.jsx
 * History:  MEH-2989 (creation)
 */
export default function DateTile({ month, day, bandClass = "bg-primary", testId }) {
  return (
    <span
      aria-hidden="true"
      data-testid={testId}
      className="shrink-0 w-11 rounded-md border border-border bg-surface text-center overflow-hidden"
    >
      <span className={`block ${bandClass} text-white text-2xs font-bold leading-4`}>{month}</span>
      <span className="block font-headline-display font-black text-lg leading-6 numeric">{day}</span>
    </span>
  );
}
