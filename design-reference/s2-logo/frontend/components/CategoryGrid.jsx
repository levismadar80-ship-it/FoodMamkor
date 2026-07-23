// S3 P3 v8 / MEH-638 — Category Grid (2+4 asymmetric, hand-drawn glyphs).
// Reused VERBATIM from approved S3 P3 v8 — only extension is the `selected` prop.
//
// Integration Point 2 (S4 / MEH-639):
//   selected?: string  — when passed, that card renders with 2px solid
//                        --green-500 border (a SINGLE signal, distinguishable
//                        from the 1px hover border).
//   Homepage usage: <CategoryGrid /> — no prop passed.
//   /explore usage: <CategoryGrid selected={activeFilterId} />
//
// Server Component — pure render; no client state.

import FadeIn from "./motion/FadeIn";

const CATEGORIES = [
  {
    id: "meat",
    num: "01",
    name: "בשר, עוף ודגים",
    href: "/explore?cat=meat",
    hero: true,
    glyph: (
      // Fish silhouette + tail + dorsal arc
      <>
        <path d="M22 60 q14 -22 44 -22 q26 0 36 22 q-10 22 -36 22 q-30 0 -44 -22 z" />
        <path d="M86 50 l16 -8 v36 l-16 -8" />
        <circle cx="46" cy="56" r="2" className="fill-gold" />
        <path d="M52 60 q8 -4 16 0" />
      </>
    ),
  },
  {
    id: "veg",
    num: "02",
    name: "ירקות, פירות ומשקים",
    href: "/explore?cat=veg",
    hero: true,
    glyph: (
      <>
        <path d="M44 44 L60 100 L76 44 Z" />
        <path d="M50 56 h20" />
        <path d="M48 68 h24" />
        <path d="M48 80 h24" />
        <path d="M50 38 q-4 -10 4 -16 q6 -2 10 4" />
        <path d="M70 38 q4 -10 -4 -16 q-6 -2 -10 4" />
      </>
    ),
  },
  {
    id: "dairy",
    num: "03",
    name: "חלב וגבינות",
    href: "/explore?cat=dairy",
    glyph: (
      <>
        <path d="M22 78 L60 32 L98 78 Z" />
        <path d="M22 78 L98 78 L98 88 L22 88 Z" />
        <circle cx="50" cy="64" r="3" />
        <circle cx="70" cy="58" r="2.5" />
        <circle cx="60" cy="74" r="2" />
        <path d="M44 102 q4 -6 8 0 q4 6 8 0" />
      </>
    ),
  },
  {
    id: "bread",
    num: "04",
    name: "לחמים ואפייה",
    href: "/explore?cat=bread",
    glyph: (
      <>
        <path d="M24 72 q0 -22 36 -22 q36 0 36 22 v8 q0 4 -4 4 h-64 q-4 0 -4 -4 z" />
        <path d="M40 70 q4 -10 8 0" />
        <path d="M56 68 q4 -10 8 0" />
        <path d="M72 70 q4 -10 8 0" />
        <path d="M48 36 q2 -6 0 -10" />
        <path d="M60 32 q2 -6 0 -10" />
        <path d="M72 36 q2 -6 0 -10" />
      </>
    ),
  },
  {
    id: "oils",
    num: "05",
    name: "שמנים ודבש",
    href: "/explore?cat=oils",
    glyph: (
      <>
        <path d="M52 28 h16 v12 q12 6 12 22 v32 q0 6 -6 6 h-28 q-6 0 -6 -6 v-32 q0 -16 12 -22 z" />
        <path d="M52 60 h16" />
        <circle cx="60" cy="74" r="3" className="fill-gold" />
      </>
    ),
  },
  {
    id: "soap",
    num: "06",
    name: "טיפוח וסבונים",
    href: "/explore?cat=soap",
    glyph: (
      <>
        <rect x="30" y="60" width="60" height="32" rx="4" />
        <path d="M40 72 h40" />
        <path d="M40 80 h40" />
        <path d="M60 60 q-8 -16 0 -32" />
        <path d="M60 36 q-8 4 -12 0" />
        <path d="M60 44 q8 4 12 0" />
        <path d="M60 52 q-8 4 -10 0" />
      </>
    ),
  },
];

/**
 * CategoryGrid
 * @param {{ selected?: string }} props
 *   When `selected` matches a category id, that card renders the 2px solid
 *   --green-500 border state. Single signal — distinct from 1px hover border.
 *   Homepage passes no prop. /explore passes the active filter id.
 */
export default function CategoryGrid({ selected }) {
  return (
    <section
      data-screen-label="03 Categories"
      data-om-validate="category-grid"
      id="categories"
      className="bg-[var(--background)]"
    >
      <div className="mx-auto max-w-[1280px] px-6 py-[96px] md:py-[128px] md:px-12">
        <FadeIn>
          <header className="grid gap-3 mb-12 md:mb-16">
            {/* Eyebrow — wayfinding, no count. Gold rule + label. */}
            <span
              className="inline-flex items-center gap-3 font-body font-medium text-[11px] text-[var(--fg-muted)]"
              style={{ letterSpacing: "0.18em", textTransform: "uppercase" }}
            >
              <span aria-hidden="true" className="h-px w-8 bg-[var(--gold)] opacity-70" />
              <span>קטגוריות</span>
            </span>

            {/* H2 — wayfinding tone, NO period (period rule). */}
            <h2
              className="font-display font-black text-[var(--text)]"
              style={{
                fontSize: "clamp(32px, 4vw, 56px)",
                lineHeight: 1.05,
                letterSpacing: "0em",
              }}
            >
              גלי לפי קטגוריה
            </h2>

            <p
              className="font-display font-normal text-[var(--fg-muted)] max-w-[48ch]"
              style={{ fontSize: "clamp(16px, 1.4vw, 19px)", lineHeight: 1.5 }}
            >
              ישר מבית העסק <em className="font-italic not-italic text-[var(--gold)]" style={{ fontStyle: "italic" }}>—</em> בלי מתווכים.
            </p>
          </header>

          {/* Asymmetric grid: 2 hero cards (each spans 2 of 4 cols, 16:9 glyph) +
              4 balance cards (1 col each, 1:1 glyph). Tablet: 2×3 uniform.
              Mobile: vertical stack. */}
          <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
            {CATEGORIES.map((c) => {
              const isSelected = selected === c.id;
              const isHero = c.hero;
              return (
                <a
                  key={c.id}
                  href={c.href}
                  data-cat-id={c.id}
                  className={[
                    "group block bg-[var(--bg-card)]",
                    "transition-colors duration-[var(--duration-base)] ease-[var(--ease-quart)]",
                    // Border: hover/rest = 1px; selected (Integration Point 2) = 2px.
                    isSelected
                      ? "border-[2px] border-solid border-[var(--green-500)]"
                      : "border border-[var(--border)] hover:border-[var(--green-500)]",
                    // Hero spans 2 cols on lg (desktop 1280+); balance is 1 col.
                    isHero ? "lg:col-span-2" : "",
                  ].join(" ")}
                  aria-current={isSelected ? "true" : undefined}
                >
                  <div
                    className="grid place-items-center bg-[var(--background)] relative"
                    style={{
                      aspectRatio: isHero ? "16 / 9" : "1 / 1",
                    }}
                  >
                    <svg
                      viewBox="0 0 120 120"
                      className={isHero ? "h-[140px] w-[140px]" : "h-[80px] w-[80px]"}
                      aria-hidden="true"
                    >
                      <g
                        style={{ fill: "none", stroke: "var(--green-dark, #1F4A38)", strokeWidth: isHero ? 2 : 1.5, strokeLinecap: "round", strokeLinejoin: "round" }}
                      >
                        {c.glyph}
                      </g>
                      <style>{`.fill-gold { fill: var(--gold); stroke: var(--gold); }`}</style>
                    </svg>
                  </div>

                  <div className={`flex flex-col items-center gap-2 ${isHero ? "px-6 pt-8 pb-6" : "px-4 pt-6 pb-4"} text-center`}>
                    <span
                      className="font-italic text-[var(--gold)]"
                      style={{ fontStyle: "italic", fontWeight: 500, fontSize: isHero ? "28px" : "20px", direction: "ltr" }}
                    >
                      {c.num}
                    </span>
                    <h3
                      className="font-display text-[var(--text)]"
                      style={{
                        fontSize: isHero ? "32px" : "19px",
                        fontWeight: isHero ? 900 : 700,
                        lineHeight: 1.2,
                      }}
                    >
                      {c.name}
                    </h3>
                  </div>
                </a>
              );
            })}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
