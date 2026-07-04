// S4 / MEH-639 — Editorial Breath. The "page turn" between Hero and Categories.
// Typographic-only section: one pull quote, generous whitespace, no CTA, no image.
// Background alternates to --bg-card (warm white) — first colour shift after Hero.
//
// Server Component (Framer Motion wrapper is the client edge — see /motion/FadeIn).
// Period rule: no H2; quote is a sentence, period closes the thought (DS rule).

import FadeIn from "./motion/FadeIn";

export default function EditorialBreath() {
  return (
    <section
      data-screen-label="02 Editorial Breath"
      data-om-validate="editorial-breath"
      className="bg-[var(--bg-card)]"
    >
      <div className="mx-auto max-w-[920px] px-6 py-[96px] md:py-[160px] md:px-12 text-center">
        <FadeIn>
          {/* Decorative top rule — gold hairline, magazine spread device. */}
          <div className="mx-auto mb-12 h-px w-16 bg-[var(--gold)] opacity-60" aria-hidden="true" />

          <blockquote
            className="font-italic text-[var(--text)] mx-auto"
            style={{
              fontStyle: "italic",
              fontSize: "clamp(24px, 3vw, 36px)",
              lineHeight: 1.4,
              fontWeight: 500,
              letterSpacing: "0em",
              maxWidth: "28ch",
            }}
          >
            אחרי שיודעים מאיפה לקנות <span className="text-[var(--gold)]">—</span> אי אפשר לחזור לאחור.
          </blockquote>

          <cite
            className="mt-8 inline-block font-body text-[13px] text-[var(--fg-muted)] not-italic"
            style={{ letterSpacing: "0.04em" }}
          >
            <span className="text-[var(--gold)]">—</span> ספיר, מייסדת מהמקור
          </cite>

          <div className="mx-auto mt-12 h-px w-16 bg-[var(--gold)] opacity-60" aria-hidden="true" />
        </FadeIn>
      </div>
    </section>
  );
}
