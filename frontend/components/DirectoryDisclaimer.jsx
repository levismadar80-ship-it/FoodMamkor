/**
 * Directory-only disclaimer — required by Israeli consumer protection law.
 *
 * Shown on every producer detail page and every "מהמטבח של השכן" listing
 * card so users understand מהמקור is a directory only — the seller bears
 * legal responsibility for products and licensing.
 */
export default function DirectoryDisclaimer({ className = "" }) {
  return (
    <div
      className={`bg-light/60 border border-border rounded-[12px] p-3 text-xs text-site-text/80 leading-relaxed ${className}`}
      role="note"
    >
      <span className="font-semibold text-site-text">מהמקור</span> היא פלטפורמת
      דירקטורי בלבד. האחריות על המוצרים ורישוי המוכר חלה על המוכר בלבד.
    </div>
  );
}
