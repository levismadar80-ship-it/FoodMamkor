"use client";

import Link from "next/link";
import { Leaf } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import FadeInSection from "@/components/FadeInSection";
import { optimizeCloudinary } from "@/lib/cloudinary";

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
 * MEET A PRODUCER (P5 §10) — MEH-542, Direction A · split (design pass lock).
 * A magazine feature on ONE בית עסק — photo beside an editorial story, larger
 * and warmer than a ProducerCard (that stays the grid unit).
 *
 * Data-driven by design: `featured` is an editorial object authored per
 * feature — null/missing ⇒ the section renders NOTHING (the prod state until
 * a real business is featured). No fictional placeholder content ships; the
 * design's persona example copy stays in the freeze file only. Frame copy
 * (eyebrow / heading / CTA patterns) is locked from the freeze via
 * home.featured.*.
 *
 * @param {?{
 *   quote: string,        // feature headline — display line, no terminal period
 *   story: string,        // short narrative paragraph (body prose, keeps periods)
 *   name: string,         // first name — interpolated into both CTAs
 *   attribution: string,  // "שם מלא · עסק, עיר" meta line (middle-dot rhythm)
 *   category?: string,
 *   city?: string,
 *   photo?: string,       // Cloudinary URL — helper applies f_auto,q_auto
 *   href?: string,        // producer-page target; meet-CTA hidden without it
 *   writeHref?: string,   // WhatsApp target; write-CTA hidden without it
 * }} props.featured
 */
export function HomeFeaturedProducer({ featured }) {
  const t = useTranslations("home.featured");
  if (!featured) return null;
  const photo = featured.photo
    ? optimizeCloudinary(featured.photo, { aspectRatio: "5:6", width: 900 })
    : null;
  const meta = [featured.name, [featured.category, featured.city].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(" · ");
  return (
    <section className="max-w-6xl mx-auto px-4 md:px-12 section-y">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-10 items-center">
        {/* photo — leading/start column (Direction A: image leads, 5:6) */}
        <FadeInSection className="md:col-span-5">
          <figure className="relative m-0 rounded-lg bg-surface-card border border-border p-2">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt={featured.name}
                loading="lazy"
                className="aspect-[5/6] w-full rounded-md object-cover"
              />
            ) : (
              // tonal plate fallback — never a broken <img> (IMG-01 pattern)
              <div className="aspect-[5/6] rounded-md bg-background-alt" aria-hidden="true" />
            )}
          </figure>
        </FadeInSection>

        {/* editorial text — end column */}
        <FadeInSection className="md:col-span-7" delay={0.1}>
          <p className="text-sm font-medium tracking-[0.14em] text-fg-muted mb-1">{t("eyebrow")}</p>
          <h2 className="font-headline-md text-xl font-bold text-text mb-4">{t("heading")}</h2>
          {meta && <p className="text-sm text-fg-muted mb-3">{meta}</p>}
          <p
            className="font-headline-lg font-bold text-text leading-snug mb-4"
            style={{ fontSize: "clamp(24px, 3vw, 36px)" }}
          >
            {featured.quote}
          </p>
          {featured.story && (
            <p className="text-text/85 leading-relaxed mb-5 max-w-xl">{featured.story}</p>
          )}
          {featured.attribution && (
            <p className="text-sm text-fg-muted mb-6">{featured.attribution}</p>
          )}
          <div className="flex flex-wrap items-center gap-4">
            {featured.href && (
              <Link
                href={featured.href}
                className="inline-block bg-primary text-white px-6 py-2.5 rounded-[8px] hover:bg-primary-dark transition font-medium"
              >
                {t("cta_meet", { name: featured.name })}
              </Link>
            )}
            {featured.writeHref && (
              <a
                href={featured.writeHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline decoration-accent underline-offset-4 hover:text-primary-dark transition"
              >
                {t("cta_write", { name: featured.name })}
              </a>
            )}
          </div>
        </FadeInSection>
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
