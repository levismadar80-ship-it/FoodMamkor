"use client";

import Link from "next/link";
import { Leaf, House } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import FadeInSection from "@/components/FadeInSection";
import HomeProductCard from "@/components/HomeProductCard";

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
                className="font-body whitespace-nowrap text-green-50"
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
 * FOUNDER QUOTE CARD (LAUNCH_CHECKLIST fix 4)
 * Hand-off between the abstract category grid and the concrete
 * producer grid. Establishes personal voice before browse mode.
 */
export function HomeFounderQuote() {
  const t = useTranslations();
  return (
    <FadeInSection className="max-w-4xl mx-auto px-4 mb-8">
      <Link
        href="/about"
        className="group flex items-center gap-6 bg-white rounded-[20px] border border-border p-6 md:p-8 hover:shadow-[0_4px_24px_rgba(46,104,83,0.08)] transition focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center shrink-0" aria-hidden="true">
          <Leaf size={36} weight="duotone" className="text-primary" />
        </div>
        <div className="flex-1">
          <p className="font-headline italic text-text text-lg md:text-xl leading-relaxed mb-2">
            &ldquo;{t("home.founder_quote.text")}&rdquo;
          </p>
          <p className="font-body text-sm text-primary group-hover:underline">
            {t("home.founder_quote.attribution")}
          </p>
        </div>
      </Link>
    </FadeInSection>
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
      <h2 className="font-headline font-bold text-text mb-4" style={{ fontSize: "clamp(22px, 2.5vw, 28px)" }}>
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
                <p className="font-headline font-bold text-sm text-text truncate">{p.name}</p>
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
 * DEFERRED home-product preview (max 3). Hidden until MEH-543 launch.
 * Full browse at /neighbor.
 * Hidden entirely when the products list is empty.
 */
export function HomeKitchenPreview({ products, onWhatsAppClick }) {
  const t = useTranslations();
  if (!products.length) return null;
  return (
    <section
      id="home-kitchen"
      className="max-w-7xl mx-auto px-4 section-y border-t border-border scroll-mt-24"
    >
      <div className="flex items-baseline justify-between mb-6">
        <h2
          className="font-headline font-bold text-text inline-flex items-center gap-2"
          style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }}
        >
          <House size={32} weight="duotone" className="text-primary" aria-hidden="true" />
          {t("home.kitchen.heading")}
        </h2>
        <Link
          href="/neighbor"
          className="text-primary hover:underline text-sm font-medium whitespace-nowrap"
        >
          {t("home.kitchen.see_more")}
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.slice(0, 3).map((hp) => (
          <HomeProductCard
            key={hp.id}
            product={hp}
            onWhatsAppClick={() => onWhatsAppClick(hp.id)}
          />
        ))}
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
    <section className="max-w-7xl mx-auto px-4 section-y">
      <FadeInSection>
        <h2 className="font-headline font-bold text-text text-center mb-10" style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }}>
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
        <h2 className="font-headline font-bold mb-4" style={{ fontSize: "clamp(32px, 4vw, 52px)" }}>
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
