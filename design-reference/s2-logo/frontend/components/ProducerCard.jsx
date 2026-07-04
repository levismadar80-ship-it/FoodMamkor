// S3 P2 v4 / MEH-638 — ProducerCard, 9 states incl. Vacation.
// REUSED VERBATIM from approved S3 P2 v4 — no modifications.
// This is a thin facade for the homepage; full state matrix lives in the
// approved phase doc. Defaults to the "rest" state for hi-fi composition.
//
// Server Component — pure render.

const HEART_PATH =
  "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z";

/**
 * @param {object} props
 * @param {object} props.producer
 * @param {"rest"|"hover"|"loading"|"vacation"|"disabled"} [props.state="rest"]
 * @param {"default"|"expanded"} [props.layout="default"]  expanded = used in Featured (S4 §4)
 */
export default function ProducerCard({ producer, state = "rest", layout = "default" }) {
  const {
    name = "מחלבת בן ארי",
    eyebrow = "גבינות",
    location = "כפר חיים",
    distance = "12 ק״מ",
    rating = 4.5,
    ratingCount = 47,
    availability = "פעיל היום",
    badges = ["מומלץ"],
    isSaved = false,
    isVacation = false,
    image = null, // null → cream placeholder w/ leaf glyph (S3 P2 v3 canonical)
  } = producer || {};

  const expanded = layout === "expanded";

  return (
    <article
      dir="rtl"
      className={[
        "relative overflow-hidden bg-[var(--bg-card)]",
        "border border-[var(--border)]",
        "transition-colors duration-[var(--duration-base)] ease-[var(--ease-quart)]",
        state === "hover" && "border-[var(--green-500)]",
        (state === "vacation" || isVacation) && "is-vacation",
        state === "disabled" && "opacity-50 pointer-events-none",
      ].filter(Boolean).join(" ")}
      style={{ borderRadius: "var(--radius-md, 16px)" }}
    >
      <div
        className="relative bg-[var(--background)]"
        style={{ aspectRatio: expanded ? "16 / 11" : "4 / 3" }}
      >
        {/* Heart — top-start (right in RTL). Green ink, never red. */}
        <button
          type="button"
          aria-label="שמירה"
          className={[
            "absolute top-4 inline-flex items-center justify-center",
            "h-10 w-10 rounded-full",
            "border bg-[rgba(245,240,232,0.85)]",
            "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-quart)]",
            isSaved
              ? "border-transparent text-[var(--color-action-primary)] bg-[var(--background)]"
              : "border-[var(--border)] text-[var(--text)]",
          ].join(" ")}
          style={{ insetInlineStart: "16px" }}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5"
               fill={isSaved ? "currentColor" : "none"}
               stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d={HEART_PATH} />
          </svg>
        </button>

        {/* Image / placeholder cell — cream + leaf glyph if no photo. */}
        <div className="absolute inset-0 grid place-items-center">
          {image ? (
            <img src={image} alt="" className="h-full w-full object-cover" />
          ) : (
            <svg viewBox="0 0 100 100" className="h-12 w-12 opacity-50" aria-hidden="true">
              <path d="M50 20 q-18 16 -18 38 q0 14 18 22 q18 -8 18 -22 q0 -22 -18 -38 z"
                    fill="none" stroke="var(--green-dark, #1F4A38)" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M50 32 v40" fill="none" stroke="var(--green-dark, #1F4A38)" strokeWidth="1.5" />
            </svg>
          )}
        </div>

        {/* Badge row — bottom-start, max 2. */}
        {badges?.length > 0 && (
          <div className="absolute bottom-4 flex gap-2" style={{ insetInlineStart: "16px" }}>
            {badges.slice(0, 2).map((b) => (
              <span key={b}
                className="inline-flex items-center px-2 py-1 font-body text-[10px] font-medium"
                style={{
                  letterSpacing: "0.08em",
                  background: b === "חדש" ? "var(--gold)" :
                              b === "מומלץ" ? "var(--color-action-primary)" :
                                              "var(--bg-card)",
                  color: b === "כשר" ? "var(--green-dark, #1F4A38)" : "var(--background)",
                  border: b === "כשר" ? "1px solid var(--border)" : "none",
                }}>
                {b}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className={`grid gap-2 ${expanded ? "p-8" : "p-4"}`}>
        <p className="font-body font-medium text-[11px] text-[var(--fg-muted)]"
           style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}>
          {eyebrow}
        </p>

        <div className="grid grid-cols-[1fr_auto] items-baseline gap-3">
          <h3 className="font-display font-bold text-[var(--text)]"
              style={{ fontSize: expanded ? "28px" : "20px", lineHeight: 1.25 }}>
            {name}
          </h3>
          <span className="inline-flex items-center gap-1 font-body text-[13px] text-[var(--text)]">
            <span className="text-[var(--gold)]">★</span>
            <span style={{ direction: "ltr" }}>{rating}</span>
            <span className="text-[var(--fg-muted)]" style={{ direction: "ltr" }}>({ratingCount})</span>
          </span>
        </div>

        <p className="font-body text-[13px] text-[var(--fg-muted)] inline-flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full"
                style={{ background: isVacation ? "var(--fg-muted)" : "var(--color-action-primary)" }} />
          <span className={isVacation ? "font-italic" : "font-medium text-[var(--text)]"}
                style={isVacation ? { fontStyle: "italic" } : undefined}>
            {isVacation ? "בחופשה" : availability}
          </span>
        </p>

        <p className="font-body text-[12px] text-[var(--fg-muted)]">
          {location} <span className="text-[var(--gold)]">·</span> <span style={{ direction: "ltr" }}>{distance}</span>
        </p>
      </div>
    </article>
  );
}
