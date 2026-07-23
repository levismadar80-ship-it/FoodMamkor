// MEH-638 / S3 P1 v2 — Hero, Direction A (typography-only, cream).
// Canonical homepage Hero. NO `variant` prop — Direction B lives in a separate
// <HeroDirectionB /> used only at /campaigns/[slug] (Integration Point 1).
//
// Server Component — no client state.
//
// Period rule (Integration Point 3): Hero H1 retains period — the ONLY heading
// in the homepage that does. It anchors the declarative opening.

export default function HeroDirectionA() {
  return (
    <section
      data-screen-label="01 Hero"
      data-om-validate="hero-direction-a"
      className="relative bg-[var(--background)]"
    >
      {/* Top offset accounts for FloatingNavbar overlap (transparent default state).
          Navbar height ≈ 80–104px desktop, 68–84px mobile incl. shell padding. */}
      <div className="mx-auto max-w-[1280px] px-6 pt-[152px] pb-[120px] md:px-12 md:pt-[176px] md:pb-[160px]">
        <div className="grid gap-8 md:gap-10">
          {/* H1 — declarative two-clause anchor. Period intentional (period rule). */}
          <h1
            className="font-display font-black text-[var(--text)]"
            style={{
              fontSize: "clamp(40px, 7.5vw, 96px)",
              lineHeight: 1.05,
              letterSpacing: "0em",
            }}
          >
            <span className="block">אוכל מקומי<span className="text-[var(--gold)]">.</span></span>
            <span
              className="block font-italic font-medium text-[var(--fg-muted)]"
              style={{ fontStyle: "italic", fontSize: "0.78em" }}
            >
              במקום אחד<span className="text-[var(--gold)]">.</span>
            </span>
          </h1>

          {/* Sub — Frank Ruhl 400, editorial register. */}
          <p
            className="font-display font-normal text-[var(--fg-muted)] max-w-[36ch]"
            style={{ fontSize: "clamp(18px, 1.6vw, 24px)", lineHeight: 1.45 }}
          >
            בתי עסק קטנים בישראל <em className="font-italic not-italic" style={{ fontStyle: "italic" }}>—</em>{" "}
            <strong className="font-display font-bold text-[var(--text)]">ישר מהמקור.</strong>
          </p>

          {/* CTAs — primary link to /explore, secondary anchor to How It Works.
              No handlers; href-only. Primary uses the green pill from MEH-655. */}
          <div className="mt-2 flex flex-wrap items-center gap-3 md:gap-4">
            <a
              href="/explore"
              className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-[var(--color-action-primary)] px-6 py-3 font-body font-medium text-[15px] text-[var(--background)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-quart)] hover:bg-[var(--color-action-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--color-action-primary-hover)]"
            >
              גילוי עסקים קרובים
              <span aria-hidden="true" style={{ fontFamily: "var(--font-italic)", fontStyle: "italic", color: "#E7C88A" }}>↗</span>
            </a>
            <a
              href="#how-it-works"
              className="inline-flex min-h-[48px] items-center px-4 py-3 font-body font-medium text-[14px] text-[var(--green-dark,var(--text))] underline decoration-[var(--gold)] decoration-1 underline-offset-[6px] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-quart)] hover:text-[var(--color-action-primary)]"
            >
              איך זה עובד
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
