"use client";

import Link from "next/link";
import Image from "next/image";
import { Leaf, ArrowLeft } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import FadeInSection from "@/components/FadeInSection";
import { optimizeCloudinary } from "@/lib/cloudinary";

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
              className="shrink-0 w-[160px] bg-background border border-border rounded-[12px] overflow-hidden transition group"
            >
              <div className="relative w-full h-[100px] bg-green-50 overflow-hidden">
                {imgSrc ? (
                  <Image
                    src={imgSrc}
                    alt={p.name}
                    fill
                    sizes="160px"
                    className="object-cover group-hover:scale-105 transition duration-300"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-primary">
                    <Leaf size={32} aria-hidden="true" />
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
    ? optimizeCloudinary(featured.photo, { aspectRatio: "4:5", width: 900 })
    : null;
  const meta = [featured.name, [featured.category, featured.city].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(" · ");
  return (
    <section className="max-w-6xl mx-auto px-4 md:px-12 section-y">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-10 items-center">
        {/* photo — leading/start column (Direction A: image leads, 4:5) */}
        <FadeInSection className="md:col-span-5">
          {/* MEH-991 (HOME-23): FREEZE §10 — framed 4:5, radius 16, --light loading
              fill, SOLID caption chip bottom/inline-start (blur dropped per FREEZE §10.4). */}
          <figure className="relative m-0 rounded-2xl bg-surface-card border border-border p-2">
            {photo ? (
              <Image
                src={photo}
                alt={featured.name}
                width={500}
                height={625}
                sizes="(max-width: 768px) 100vw, 42vw"
                className="aspect-[4/5] w-full rounded-xl object-cover"
              />
            ) : (
              // tonal plate fallback — never a broken <img> (IMG-01 pattern)
              <div className="aspect-[4/5] rounded-xl bg-green-50" aria-hidden="true" />
            )}
            {meta && (
              <figcaption className="absolute bottom-4 start-4 max-w-[85%] truncate bg-surface-card border border-border rounded-full px-3 py-1 text-[12px] text-text">
                {meta}
              </figcaption>
            )}
          </figure>
        </FadeInSection>

        {/* editorial text — end column */}
        <FadeInSection className="md:col-span-7" delay={0.1}>
          <p className="flex items-center gap-3 text-sm font-medium tracking-[0.14em] text-accent mb-1">
            {t("eyebrow")}
            <span className="inline-block w-8 h-px bg-accent" aria-hidden="true" />
          </p>
          <h2 className="font-headline-md text-xl font-bold text-text mb-4">{t("heading")}</h2>
          {/* MEH-991 (HOME-23): meta moved into the on-image caption chip per FREEZE §10. */}
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
        {/* MEH-788 copy-Δ: P5-v2 lock split the old heading into eyebrow
            ("איך זה עובד", matches the anchor id) + H2 ("שלושה צעדים"). */}
        <p className="text-sm font-medium tracking-[0.14em] text-fg-muted text-center mb-2">
          {t("home.how_it_works.eyebrow")}
        </p>
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
 * COMPARISON TEASER — MEH-841 (supersedes MEH-525 placement). The full
 * comparison moved to /about as an early narrative beat; here only a calm
 * one-line teaser remains, linking to /about. S4 voice: cream surface,
 * hairline-free, gold accent on the link only — flat, no shadows. Static.
 */
export function HomeComparisonTeaser() {
  const t = useTranslations("home.comparison_teaser");
  return (
    <section className="max-w-3xl mx-auto px-4 section-y text-center">
      <FadeInSection>
        <p className="text-sm font-medium tracking-[0.14em] text-fg-muted mb-2">
          {t("eyebrow")}
        </p>
        <h2
          className="font-headline-lg font-bold text-text mb-5"
          style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }}
        >
          {t("heading")}
        </h2>
        <Link
          href="/about"
          className="inline-flex items-center gap-2 text-accent font-medium hover:underline"
        >
          {t("cta")}
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
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
        {/* MEH-788 copy-Δ: P5-v2 lock carries 3 body lines (recognition-first,
            then curation, then the closing nudge) — body prose keeps periods. */}
        <p className="text-green-50/90 text-lg mb-2 max-w-xl mx-auto">
          {t("home.cta.body_l1")}
        </p>
        <p className="text-green-50/90 text-lg mb-2 max-w-xl mx-auto">
          {t("home.cta.body_l2")}
        </p>
        <p className="text-green-50/90 text-lg mb-8 max-w-xl mx-auto">
          {t("home.cta.body_l3")}
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
