"use client";

import Link from "next/link";
import { Leaf } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import FadeInSection from "@/components/FadeInSection";

// PREMIUM_DESIGN: hype tags that scroll in the marquee between sections.
// Tag display labels resolve via home.marquee.* — preserving the order
// matters for the loop animation. The keys are the data axis.
const MARQUEE_KEYS = [
  "tag_unprocessed",
  "tag_pasture",
  "tag_organic",
  "tag_sourdough",
  "tag_extra_virgin",
  "tag_fresh_real",
  "tag_verified",
  "tag_local",
];

/**
 * MARQUEE STRIP (PREMIUM_DESIGN)
 * Infinite scrolling hype tags between categories + producers.
 * The list is rendered twice so the -50% translate loops cleanly.
 * Pauses on hover; respects prefers-reduced-motion.
 */
export function HomeMarquee() {
  const t = useTranslations("home.marquee");
  return (
    <div
      className="bg-primary overflow-hidden marquee-edge-fade"
      style={{
        padding: "14px 0",
        borderTop: "1px solid rgba(255,255,255,0.1)",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
      }}
      aria-hidden="true"
    >
      <div className="marquee-track">
        {[0, 1].map((loop) => (
          <div key={loop} className="flex items-center" style={{ gap: "48px" }}>
            {MARQUEE_KEYS.map((key) => (
              <span
                key={`${loop}-${key}`}
                className="font-body-md whitespace-nowrap text-green-50"
                style={{
                  fontSize: 14,
                  letterSpacing: "0.06em",
                }}
              >
                {t(key)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * FEATURE BAND (S14 · MEH-788 Phase-3) — position 06 "texture moment".
 * The editorial hand-off (quote → /about) restyled as the background-alt step
 * that breaks the typography run: hand-cut seams both ends, quote at start,
 * framed 3:2 IMG-03 plate + offset panel at end (5/7 grid desktop, stacked
 * mobile). Copy is UNCHANGED (existing home.founder_quote.* — the S14 copy Δ
 * reconciliation is separate/pending).
 */
export function HomeFounderQuote() {
  const t = useTranslations();
  return (
    <>
      {/* hand-cut seam — cream → background-alt (DS gesture №4, globals.css) */}
      <div className="seam-cut" aria-hidden="true" />
      <section className="bg-background-alt">
        <div className="max-w-6xl mx-auto px-4 md:px-12 py-12 md:py-16">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-10 items-center">
            {/* quote — start (5 cols) */}
            <FadeInSection className="md:col-span-5">
              {/* gold rule marker (decorative — no new copy) */}
              <span className="block w-10 h-px bg-accent mb-4" aria-hidden="true" />
              <Link
                href="/about"
                className="group block focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md"
              >
                <p className="font-headline-md italic text-text text-xl md:text-2xl leading-relaxed mb-2">
                  &ldquo;{t("home.founder_quote.text")}&rdquo;
                </p>
                <p className="font-body-md text-sm text-primary group-hover:underline">
                  {t("home.founder_quote.attribution")}
                </p>
              </Link>
            </FadeInSection>

            {/* IMG-03 plate — end (7 cols). Framed 3:2 inset: warm-white mat +
                hairline + an offset cream panel behind it (depth by overlap,
                zero shadows). FEATURE_ID still pending → tonal fallback inside
                the mat (never a broken <img>); drop a lazy <img>
                (optimizeCloudinary, ar 3:2) in the inner frame when it lands. */}
            <FadeInSection className="md:col-span-7" delay={0.1}>
              <figure className="relative m-0">
                <div
                  className="absolute -bottom-3 -end-3 w-full h-full rounded-lg bg-background border border-border"
                  aria-hidden="true"
                />
                <div className="relative rounded-lg bg-surface-card border border-border p-2">
                  {/* IMG-03 empty state: tonal background-alt plate (no leaf
                      box). A lazy <img> drops in here when the Cloudinary
                      FEATURE_ID is provided. */}
                  <div className="aspect-[3/2] rounded-md bg-background-alt" aria-hidden="true" />
                </div>
              </figure>
            </FadeInSection>
          </div>
        </div>
      </section>
      {/* hand-cut seam — background-alt → cream */}
      <div className="seam-cut flip" aria-hidden="true" />
    </>
  );
}

/**
 * RECENTLY VIEWED (task 13) — horizontal scroll strip of producers
 * the user opened recently (7-day TTL applied by the hook). Hidden
 * when the list is empty.
 */
export function HomeRecentlyViewed({ items }) {
  const t = useTranslations();
  if (!items.length) return null;
  return (
    <section className="max-w-7xl mx-auto px-4 pb-10">
      <h2 className="font-headline-md font-bold text-text mb-4" style={{ fontSize: "clamp(22px, 2.5vw, 28px)" }}>
        {t("home.recent.heading")}
      </h2>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide -mx-1 ps-1 after:content-[''] after:shrink-0 after:w-4">
        {items.map((p) => {
          const href = p.slug ? `/${p.slug}` : `/producer/${p.id}`;
          const imgSrc = p.images?.[0];
          return (
            <Link
              key={p.id}
              href={href}
              className="shrink-0 w-[160px] bg-background border border-border rounded-[12px] overflow-hidden hover:shadow-md transition group"
            >
              <div className="relative w-full h-[100px] bg-green-50 overflow-hidden">
                {imgSrc ? (
                  <img
                    src={imgSrc}
                    alt={p.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-primary">
                    <Leaf size={32} weight="duotone" aria-hidden="true" />
                  </div>
                )}
              </div>
              <div className="p-2.5">
                <p className="font-headline-md font-bold text-sm text-text truncate">{p.name}</p>
                <p className="text-xs text-fg-muted truncate">{p.city}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/**
 * HOW IT WORKS — three-step explainer block.
 */
export function HomeHowItWorks() {
  const t = useTranslations();
  return (
    // id="how-it-works" — anchor target for the hero "איך זה עובד" link (MEH-643).
    <section id="how-it-works" className="max-w-7xl mx-auto px-4 section-y">
      <FadeInSection>
        <h2 className="font-headline-lg font-bold text-text text-center mb-10" style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }}>
          {t("home.how_it_works.heading")}
        </h2>
      </FadeInSection>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
        {[
          { step: "01", title: t("home.how_it_works.step01_title"), text: t("home.how_it_works.step01_text") },
          { step: "02", title: t("home.how_it_works.step02_title"), text: t("home.how_it_works.step02_text") },
          { step: "03", title: t("home.how_it_works.step03_title"), text: t("home.how_it_works.step03_text") },
        ].map((step, idx) => (
          <FadeInSection key={step.step} delay={idx * 0.12}>
            <div className="font-english text-5xl text-accent mb-2">{step.step}</div>
            <h3 className="font-headline-md text-2xl font-bold mb-2">{step.title}</h3>
            <p className="text-text/85 leading-relaxed">{step.text}</p>
          </FadeInSection>
        ))}
      </div>
    </section>
  );
}

// MEH-525: row key order is the locked editorial order — do not re-sort.
const COMPARISON_ROWS = ["row1", "row2", "row3"];

/**
 * COMPARISON STRIP — MEH-525 (copy LOCK 2026-06-13). Sits between How It
 * Works and the For Business CTA. Two columns (סופר | מהמקור), 3 rows,
 * S4 voice: cream page surface, hairline borders only, gold accent on the
 * brand column — F1 flat, no shadows. Static, prop-free.
 */
export function HomeComparison() {
  const t = useTranslations("home.comparison");
  return (
    <section className="max-w-7xl mx-auto px-4 section-y">
      <FadeInSection>
        <p className="text-sm font-medium tracking-[0.14em] text-fg-muted text-center mb-2">
          {t("eyebrow")}
        </p>
        <h2
          className="font-headline-lg font-bold text-text text-center mb-10"
          style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }}
        >
          {t("heading")}
        </h2>
      </FadeInSection>
      <FadeInSection>
        <div className="max-w-3xl mx-auto border-y border-border divide-y divide-border" role="table" aria-label={t("heading")}>
          <div role="row" className="grid grid-cols-2">
            <div role="columnheader" className="py-3 pe-4 text-sm font-medium text-fg-muted">
              {t("col_super")}
            </div>
            <div role="columnheader" className="py-3 ps-4 text-sm font-medium text-accent border-s border-border">
              {t("col_brand")}
            </div>
          </div>
          {COMPARISON_ROWS.map((row) => (
            <div key={row} role="row" className="grid grid-cols-2">
              <div role="cell" className="py-5 pe-4 text-fg-muted leading-relaxed">
                {t(`${row}_super`)}
              </div>
              <div role="cell" className="py-5 ps-4 text-text font-medium leading-relaxed border-s border-border">
                {t(`${row}_brand`)}
              </div>
            </div>
          ))}
        </div>
      </FadeInSection>
    </section>
  );
}

/**
 * CTA — "הוסיפי את העסק שלך". Static, prop-free.
 */
export function HomeCTA() {
  const t = useTranslations();
  return (
    <section className="bg-primary-dark text-white py-20">
      <div className="max-w-3xl mx-auto px-4 text-center">
        <h2 className="font-headline-display font-bold mb-4" style={{ fontSize: "clamp(32px, 4vw, 52px)" }}>
          {t("home.cta.heading")}
        </h2>
        <p className="text-green-50/90 text-lg mb-8 max-w-xl mx-auto">
          {t("home.cta.body")}
        </p>
        <Link
          href="/register/producer"
          className="inline-block bg-white text-primary px-8 py-3 rounded-[12px] hover:bg-green-50 transition font-medium"
        >
          {t("home.cta.button")}
        </Link>
      </div>
    </section>
  );
}
