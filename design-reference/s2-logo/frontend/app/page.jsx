// S4 / MEH-639 — Homepage assembly.
// Server Component. Composes 8 sections per design thesis.
//
// Integration Point 1: <HeroDirectionA /> is the SOLE canonical Hero.
//   No `variant` prop. No conditional eyebrow. Direction B lives in
//   /campaigns/[slug] only — never imported here.
// Integration Point 2: <CategoryGrid /> on homepage receives NO `selected` prop.
//   /explore will pass `selected={activeFilterId}`.
// Integration Point 3: Hero H1 retains period. All section H2s have NO period.
//   See audit table in Phase 5 design thesis.
//
// Background alternation: cream ↔ warm white ↔ cream ↔ warm white ↔ cream ↔
// warm white ↔ cream ↔ dark green. No two cream sections adjacent.

import FloatingNavbar from "@/components/FloatingNavbar";
import HeroDirectionA from "@/components/HeroDirectionA";
import EditorialBreath from "@/components/EditorialBreath";
import CategoryGrid from "@/components/CategoryGrid";
import ProducerCard from "@/components/ProducerCard";
import MeetProducer from "@/components/MeetProducer";
import FadeIn from "@/components/motion/FadeIn";
import Logo from "@/components/Logo";

// Editorial featured selection. Copy hardcoded per CONTENT SYNC v4.1
// (i18n is a later wave — not Session 4 scope).
const FEATURED = [
  {
    name: "מחלבת בן ארי",
    eyebrow: "גבינות · ירושלים",
    location: "כפר חיים",
    distance: "1.2 ק״מ",
    rating: 4.8,
    ratingCount: 124,
    availability: "פעיל היום",
    badges: ["מומלץ"],
    body: "אורן בן-ארי מייצר גבינות מחלב כבשים שמגיע ממשק קטן ביער עירון. הוא מבשל כל לוט ידנית, וכל גבינה אחרת מהקודמת — תלוי באיזה עשב הכבשים אכלו השבוע.",
  },
  {
    name: "מאפיית גרניום",
    eyebrow: "לחמים · תל אביב",
    location: "פלורנטין",
    distance: "0.8 ק״מ",
    rating: 4.9,
    ratingCount: 218,
    availability: "טרי הבוקר",
    badges: ["מומלץ", "חדש"],
    body: "לאה אופה לחם שיפון איטי במאפייה קטנה ברחוב לוינסקי. הבצק עומד שמונה-עשרה שעות לפני שהוא נכנס לתנור — ויש לחם רק עד ארבע.",
  },
];

export default function HomePage() {
  return (
    <main dir="rtl" className="bg-[var(--background)] text-[var(--text)] font-body">
      <FloatingNavbar />

      {/* 01 — Hero. Cream. */}
      <HeroDirectionA />

      {/* 02 — Editorial Breath. Warm white. The page turn. */}
      <EditorialBreath />

      {/* 03 — Categories. Cream. Integration Point 2: no `selected` prop. */}
      <CategoryGrid />

      {/* 04 — Featured Producers. Warm white. Image-forward, 1-paragraph editorial. */}
      <section
        data-screen-label="04 Featured Producers"
        data-om-validate="featured-producers"
        className="bg-[var(--bg-card)]"
      >
        <div className="mx-auto max-w-[1280px] px-6 py-[96px] md:py-[128px] md:px-12">
          <FadeIn>
            <header className="grid gap-3 mb-12 md:mb-16">
              <span className="inline-flex items-center gap-3 font-body font-medium text-[11px] text-[var(--fg-muted)]"
                    style={{ letterSpacing: "0.18em", textTransform: "uppercase" }}>
                <span aria-hidden="true" className="h-px w-8 bg-[var(--gold)] opacity-70" />
                <span>השבוע</span>
              </span>
              {/* H2 — wayfinding, NO period. */}
              <h2 className="font-display font-black text-[var(--text)]"
                  style={{ fontSize: "clamp(32px, 4vw, 56px)", lineHeight: 1.05 }}>
                בתי עסק מומלצים השבוע
              </h2>
              <p className="font-display font-normal text-[var(--fg-muted)] max-w-[48ch]"
                 style={{ fontSize: "clamp(16px, 1.4vw, 19px)", lineHeight: 1.5 }}>
                שניים <em className="font-italic not-italic text-[var(--gold)]" style={{ fontStyle: "italic" }}>—</em> נבחרים אישית, לא אלגוריתם.
              </p>
            </header>

            {/* 1-up on mobile, 2-up on md+. Cards in "expanded" layout with paragraph below. */}
            <div className="grid gap-12 md:gap-10 md:grid-cols-2">
              {FEATURED.map((p) => (
                <FadeIn key={p.name} as="article">
                  <ProducerCard producer={p} layout="expanded" />
                  <p className="mt-6 font-body text-[15px] text-[var(--text)] max-w-[44ch]"
                     style={{ lineHeight: 1.7 }}>
                    {p.body}
                  </p>
                </FadeIn>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* 05 — Meet a Producer. Cream. One story, magazine feature. */}
      <MeetProducer />

      {/* 06 — How It Works. Warm white. 3 steps, no H2 (numerals speak). */}
      <section
        data-screen-label="06 How It Works"
        data-om-validate="how-it-works"
        id="how-it-works"
        className="bg-[var(--bg-card)]"
      >
        <div className="mx-auto max-w-[1280px] px-6 py-[96px] md:py-[128px] md:px-12">
          <FadeIn>
            <span className="inline-flex items-center gap-3 font-body font-medium text-[11px] text-[var(--fg-muted)] mb-12"
                  style={{ letterSpacing: "0.18em", textTransform: "uppercase" }}>
              <span aria-hidden="true" className="h-px w-8 bg-[var(--gold)] opacity-70" />
              <span>איך זה עובד</span>
            </span>

            <ol className="grid gap-12 md:gap-8 md:grid-cols-3 mt-4">
              {[
                {
                  num: "01",
                  verb: "מצאי",
                  body: "גלי בתי עסק קרובים אלייך.",
                  glyph: (
                    <>
                      <circle cx="56" cy="48" r="20" />
                      <path d="M70 62 l16 16" />
                      <circle cx="56" cy="48" r="6" className="fill-gold" />
                    </>
                  ),
                },
                {
                  num: "02",
                  verb: "צרי קשר",
                  body: "דברי ישירות עם בית העסק — בוואטסאפ, בטלפון או באינסטגרם.",
                  glyph: (
                    <>
                      <path d="M20 20 h64 q8 0 8 8 v32 q0 8 -8 8 h-32 l-16 16 v-16 h-16 q-8 0 -8 -8 v-32 q0 -8 8 -8 z" />
                      <path d="M36 40 h32" />
                      <path d="M36 52 h20" />
                    </>
                  ),
                },
                {
                  num: "03",
                  verb: "קבלי",
                  body: "האוכל מגיע אלייך טרי. כל בית עסק כאן עומד מאחורי מה שהוא מציע.",
                  glyph: (
                    <>
                      <path d="M28 36 h56 l-6 50 q-1 8 -9 8 h-26 q-8 0 -9 -8 z" />
                      <path d="M40 36 v-8 q0 -8 8 -8 h16 q8 0 8 8 v8" />
                      <path d="M44 56 h24" />
                      <path d="M44 70 h24" />
                    </>
                  ),
                },
              ].map((step, i) => (
                <FadeIn key={step.num} delay={i * 80} as="li">
                  <div className="grid gap-4">
                    {/* Hand-drawn glyph — same DNA as CategoryGrid (line art, gold accent). */}
                    <div className="h-[88px] w-[88px]">
                      <svg viewBox="0 0 108 108" className="h-full w-full" aria-hidden="true">
                        <g style={{ fill: "none", stroke: "var(--green-dark, #1F4A38)", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" }}>
                          {step.glyph}
                        </g>
                        <style>{`.fill-gold { fill: var(--gold); stroke: var(--gold); }`}</style>
                      </svg>
                    </div>
                    <span className="font-italic font-medium text-[var(--gold)] text-[28px]"
                          style={{ fontStyle: "italic", direction: "ltr" }}>
                      {step.num}
                    </span>
                    <h3 className="font-display font-bold text-[var(--text)]"
                        style={{ fontSize: "28px", lineHeight: 1.2 }}>
                      {step.verb}
                    </h3>
                    <p className="font-body text-[15px] text-[var(--fg-muted)] max-w-[34ch]"
                       style={{ lineHeight: 1.65 }}>
                      {step.body}
                    </p>
                  </div>
                </FadeIn>
              ))}
            </ol>
          </FadeIn>
        </div>
      </section>

      {/* 07 — For Business. Cream, with thin gold rule above (mirror Hero, closure). */}
      <section
        data-screen-label="07 For Business"
        data-om-validate="for-business"
        className="bg-[var(--background)] relative"
      >
        {/* Thin gold rule above — magazine closing device, mirrors Hero opening. */}
        <div aria-hidden="true" className="absolute inset-x-0 top-0 mx-auto h-px max-w-[120px] bg-[var(--gold)] opacity-70" />

        <div className="mx-auto max-w-[1280px] px-6 py-[112px] md:py-[160px] md:px-12">
          <FadeIn>
            <div className="grid gap-8 max-w-[820px]">
              <span className="inline-flex items-center gap-3 font-body font-medium text-[11px] text-[var(--fg-muted)]"
                    style={{ letterSpacing: "0.18em", textTransform: "uppercase" }}>
                <span>לבעלות עסק</span>
              </span>

              {/* H2 — question + invitation, NO trailing period. */}
              <h2 className="font-display font-black text-[var(--text)]"
                  style={{ fontSize: "clamp(36px, 5vw, 72px)", lineHeight: 1.05, letterSpacing: "0em" }}>
                יש לך עסק<span className="text-[var(--gold)]">?</span>{" "}
                <span className="font-italic font-medium text-[var(--fg-muted)]" style={{ fontStyle: "italic" }}>
                  בואי אלינו
                </span>
              </h2>

              <p className="font-display font-normal text-[var(--text)] max-w-[52ch]"
                 style={{ fontSize: "clamp(17px, 1.5vw, 22px)", lineHeight: 1.55 }}>
                אם יש לך עסק שמייצר אוכל אמיתי <em className="font-italic not-italic text-[var(--gold)]" style={{ fontStyle: "italic" }}>—</em> נשמח להכיר.
                מהמקור הוא הבית של בעלות עסק קטנות בישראל. כל עסק נבחר אישית, ומקבל עמוד מלא עם תמונות וסיפור.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-4">
                <a
                  href="/register/producer"
                  className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-[var(--color-action-primary)] px-6 py-3 font-body font-medium text-[15px] text-[var(--background)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-quart)] hover:bg-[var(--color-action-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--color-action-primary-hover)]"
                >
                  הוסיפי את העסק שלך
                  <span aria-hidden="true" style={{ fontFamily: "var(--font-italic)", fontStyle: "italic", color: "#E7C88A" }}>↗</span>
                </a>
                <a
                  href="/about#for-business"
                  className="inline-flex min-h-[48px] items-center px-4 py-3 font-body font-medium text-[14px] text-[var(--text)] underline decoration-[var(--gold)] decoration-1 underline-offset-[6px] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-quart)] hover:text-[var(--color-action-primary)]"
                >
                  מי אנחנו
                </a>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Optional page-number element (Chimero) — magazine spine number.
          Sits in the breath above the Footer. Earns its place: structural,
          not decorative — labels this as Vol 01 of the homepage as a publication. */}
      <div
        aria-hidden="true"
        className="bg-[var(--background)] mx-auto max-w-[1280px] px-6 md:px-12 pb-12 md:pb-16 flex justify-start"
      >
        <span className="font-italic text-[10px] text-[var(--gold)]"
              style={{ fontStyle: "italic", letterSpacing: "0.04em", direction: "ltr" }}>
          מהמקור <span className="text-[var(--fg-muted)]">·</span> 01
        </span>
      </div>

      {/* 08 — Footer. Dark green-900 per CONTENT SYNC v4.1. */}
      <footer
        data-screen-label="08 Footer"
        data-om-validate="footer"
        className="bg-[var(--green-900)] text-[var(--background)]"
        dir="rtl"
      >
        <div className="mx-auto max-w-[1280px] px-6 py-[80px] md:px-12 md:py-[112px]">
          <div className="grid gap-12 md:grid-cols-[1fr_auto] md:items-start md:gap-16">
            <div className="grid gap-6 max-w-[52ch]">
              <Logo variant="on-dark" />
              <p className="font-display text-[var(--background)] opacity-90"
                 style={{ fontSize: "clamp(20px, 2vw, 26px)", lineHeight: 1.4, fontWeight: 400 }}>
                {/* Tagline — Period rule audit: this is a tagline (not H2),
                    a declarative brand statement. Period preserved. */}
                ישר מהמקור אלייך <em className="font-italic not-italic text-[#E7C88A]" style={{ fontStyle: "italic" }}>—</em>{" "}
                בתי עסק מקומיים, כולם במקום אחד.
              </p>
            </div>

            <nav aria-label="footer" className="grid gap-3 font-body text-[14px]">
              {[
                { href: "/explore", label: "גלי" },
                { href: "/map", label: "מפה" },
                { href: "/about", label: "אודות" },
                { href: "/register/producer", label: "הוסיפי עסק" },
              ].map((l) => (
                <a key={l.href} href={l.href}
                   className="text-[var(--background)] opacity-80 hover:opacity-100 transition-opacity">
                  {l.label}
                </a>
              ))}
            </nav>
          </div>

          <div className="mt-16 pt-8 border-t border-[rgba(245,240,232,0.15)] flex flex-wrap items-baseline justify-between gap-4">
            <p className="font-body text-[12px] text-[var(--background)] opacity-60"
               style={{ letterSpacing: "0.04em" }}>
              © 2026 מהמקור <span className="text-[#E7C88A]">·</span> נעשה באהבה בישראל 🌿
            </p>
            <a href="https://instagram.com/meha_makor"
               className="font-italic text-[13px] text-[#E7C88A]"
               style={{ fontStyle: "italic", direction: "ltr" }}>
              @meha_makor
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
