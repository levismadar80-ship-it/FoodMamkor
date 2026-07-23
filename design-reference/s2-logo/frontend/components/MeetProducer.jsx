// S4 / MEH-639 — Meet a Producer. ONE producer story, magazine feature register.
// 60/40 image+text split on desktop, stacked on mobile.
//
// Period rule (Integration Point 3, resolved): H2 = "מאחורי הקלעים" — recommended
// over "הכירי את [שם]". Wayfinding tone, no period. Magazine-feature label.
// See audit table in S4 design thesis for rationale.
//
// Server Component.

import FadeIn from "./motion/FadeIn";

export default function MeetProducer({ producer }) {
  const p = producer || {
    name: "יעל מקטיף",
    location: "כפר חיים, עמק חפר",
    category: "ירקות וחממות",
    slug: "yael-meketif",
    // Placeholder image — replaced with real producer photo after MEH-602.
    image: null,
    pullQuote: "אני לא יודעת לגדל ירקות בלי לדבר איתם. הם רואים מי מטפח אותם.",
    body1: "יעל מגדלת חמש שורות של עגבניות, פלפלים וחציל בעמק חפר. את הזרעים היא שומרת משנה לשנה — אותם זרעים שהוריה גידלו לפני שלושים שנה.",
    body2: "היא מוכרת ישירות במשק, בלי משווקים, בלי קופסאות פלסטיק. מי שמגיע יודע למה הוא בא: ירק שלא ראה רכבת קירור, ושיחה של עשר דקות על למה השנה הייתה יבשה.",
  };

  return (
    <section
      data-screen-label="05 Meet a Producer"
      data-om-validate="meet-producer"
      className="bg-[var(--background)]"
    >
      <div className="mx-auto max-w-[1280px] px-6 py-[96px] md:py-[128px] md:px-12">
        <FadeIn>
          {/* Eyebrow — wayfinding device, gold rule. */}
          <span
            className="inline-flex items-center gap-3 font-body font-medium text-[11px] text-[var(--fg-muted)] mb-6"
            style={{ letterSpacing: "0.18em", textTransform: "uppercase" }}
          >
            <span aria-hidden="true" className="h-px w-8 bg-[var(--gold)] opacity-70" />
            <span>מאמר — בית עסק</span>
          </span>

          {/* H2 — wayfinding tone, NO period. Section 5 resolution. */}
          <h2
            className="font-display font-black text-[var(--text)] mb-2"
            style={{
              fontSize: "clamp(32px, 4vw, 56px)",
              lineHeight: 1.05,
              letterSpacing: "0em",
            }}
          >
            מאחורי הקלעים
          </h2>

          <p
            className="font-italic text-[var(--gold)] mb-12 md:mb-16"
            style={{ fontStyle: "italic", fontWeight: 500, fontSize: "clamp(18px, 1.6vw, 22px)" }}
          >
            {p.name} <span className="text-[var(--fg-muted)]">— {p.category} · {p.location}</span>
          </p>

          {/* 60/40 split desktop, stacked mobile. */}
          <div className="grid gap-8 md:gap-16 md:grid-cols-[6fr_4fr] md:items-start">
            {/* Image cell — full-bleed within column. */}
            <div
              className="relative bg-[var(--bg-card)] border border-[var(--border)] grid place-items-center"
              style={{ aspectRatio: "4 / 5", borderRadius: "var(--radius-lg, 24px)" }}
            >
              {p.image ? (
                <img src={p.image} alt={p.name}
                     className="absolute inset-0 h-full w-full object-cover rounded-[inherit]" />
              ) : (
                <PlaceholderGlyph />
              )}
            </div>

            {/* Story column. */}
            <div className="grid gap-6">
              {/* Pull quote — Cormorant italic, gold quote marks. */}
              <blockquote
                className="font-italic text-[var(--text)] relative"
                style={{
                  fontStyle: "italic",
                  fontSize: "clamp(20px, 2vw, 28px)",
                  lineHeight: 1.4,
                  fontWeight: 500,
                }}
              >
                <span className="absolute -top-2 -start-2 text-[var(--gold)] font-italic" style={{ fontStyle: "italic", fontSize: "2.4em", lineHeight: 1 }} aria-hidden="true">״</span>
                {p.pullQuote}
              </blockquote>

              <p className="font-body text-[16px] text-[var(--text)]" style={{ lineHeight: 1.7 }}>
                {p.body1}
              </p>
              <p className="font-body text-[16px] text-[var(--text)]" style={{ lineHeight: 1.7 }}>
                {p.body2}
              </p>

              <a
                href={`/producer/${p.slug}`}
                className="inline-flex items-center gap-2 mt-2 font-body font-medium text-[14px] text-[var(--color-action-primary)] underline decoration-[var(--gold)] decoration-1 underline-offset-[6px] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-quart)] hover:text-[var(--color-action-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--color-action-primary-hover)]"
              >
                קראי עוד על {p.name}
                <span aria-hidden="true">←</span>
              </a>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

function PlaceholderGlyph() {
  // Hand-drawn leaf + sun — same DNA as CategoryGrid glyphs, kin to S2 marks.
  return (
    <svg viewBox="0 0 240 300" className="h-2/3 w-2/3 opacity-50" aria-hidden="true">
      <g fill="none" stroke="var(--green-dark, #1F4A38)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="170" cy="80" r="22" />
        <path d="M170 50 v-12 M170 122 v12 M140 80 h-12 M212 80 h-12 M150 60 l-8 -8 M198 60 l8 -8 M150 100 l-8 8 M198 100 l8 8" />
        <path d="M70 240 q0 -100 80 -140 q-10 80 -50 120 q-20 16 -30 20 z" />
        <path d="M120 130 q-30 50 -50 110" />
      </g>
    </svg>
  );
}
