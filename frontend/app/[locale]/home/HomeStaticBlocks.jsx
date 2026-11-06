"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { Leaf } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import FadeInSection from "@/components/FadeInSection";
import BusinessCtaLink from "@/components/BusinessCtaLink";
import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";
import useScrollAffordance, { ScrollArrows } from "@/hooks/useScrollAffordance";

/**
 * RECENTLY VIEWED (task 13) — horizontal scroll strip of producers
 * the user opened recently (7-day TTL applied by the hook). Hidden
 * when the list is empty. MEH-1391: desktop scroll arrows via the
 * shared useScrollAffordance hook.
 */
export function HomeRecentlyViewed({ items }) {
  const t = useTranslations();
  return (
    <HomeProducerStrip
      items={items}
      heading={t("home.recent.heading")}
      className="pb-10"
      testIds={{
        section: "home-recently-viewed",
        rail: "home-recent-rail",
        card: "home-recent-card",
        image: "home-recent-card-image",
      }}
    />
  );
}

/**
 * MEH-2724 — «המועדפים שלך»: the signed-in user's saved businesses, right
 * under the hero. Same card as «צפית לאחרונה». A separate row only — the main
 * grid keeps one order for everyone (LOCK: nothing personal touches ranking).
 * Hidden when signed out / 0 favorites. While loading it is hidden too,
 * except when `reserve` (MEH-2743: this browser's user had favorites last
 * visit) — then a same-height placeholder holds the space so the page below
 * does not jump when the cards arrive. The server cannot see localStorage, so
 * the placeholder is in the server HTML `hidden`, and an inline script right
 * after it un-hides it before the first paint when the hint (and a session
 * token) are there — measured: un-hiding it only at hydration moved the jump
 * from ~5 s to ~0.7 s instead of removing it. Capped at FAVORITES_STRIP_MAX, then «לכל המועדפים» → /favorites.
 */
export const FAVORITES_STRIP_MAX = 10;
const FAVORITES_PLACEHOLDER_CARDS = 3;
// Key + value must match STRIP_HINT_KEY in lib/favorites-cache.js (tested).
const FAVORITES_PREPAINT_SCRIPT =
  '(function(s){try{if(localStorage.getItem("token")&&localStorage.getItem("fav_strip_hint")==="1")s.hidden=false}catch(e){}})(document.currentScript.previousElementSibling)';

// Server render has no layout effects; this only flips `mounted` on the client.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function HomeFavoritesStrip({ items, reserve = false }) {
  const t = useTranslations();
  // Before mount (server HTML + hydration) the hidden pre-paint placeholder is
  // rendered; right after mount (same frame) `reserve` decides.
  const [mounted, setMounted] = useState(false);
  useIsomorphicLayoutEffect(() => setMounted(true), []);
  return (
    <HomeProducerStrip
      items={items.slice(0, FAVORITES_STRIP_MAX)}
      heading={t("home.favorites_strip.heading")}
      action={
        <Link
          href="/favorites"
          data-testid="home-favorites-all"
          className="shrink-0 whitespace-nowrap text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
        >
          {t("home.favorites_strip.all")}
        </Link>
      }
      className="pt-6 pb-2"
      placeholderCount={reserve || !mounted ? FAVORITES_PLACEHOLDER_CARDS : 0}
      prepaintScript={mounted ? null : FAVORITES_PREPAINT_SCRIPT}
      testIds={{
        section: "home-favorites-strip",
        placeholder: "home-favorites-placeholder",
        rail: "home-favorites-rail",
        card: "home-favorites-card",
        image: "home-favorites-card-image",
      }}
    />
  );
}

function HomeProducerStrip({
  items, heading, action = null, className, testIds, placeholderCount = 0, prepaintScript = null,
}) {
  // Hook must run unconditionally (rules of hooks) — before the empty-list return.
  const affordance = useScrollAffordance();
  // MEH-1976: producer id → the image src that failed to load. Keyed rather
  // than a single boolean because these render inside a .map() — one shared
  // flag would blank every sibling when a single image 401s (MEH-1925).
  // Same rules-of-hooks constraint as `affordance` above: declared before the
  // early return, not after it.
  const [failedImgs, setFailedImgs] = useState({});
  if (!items.length && !placeholderCount) return null;
  // MEH-2743: still loading → the same section with empty card frames, so the
  // height matches the loaded strip (no jump when the real cards replace it).
  const placeholder = !items.length;
  // Pre-paint mode: hidden in the server HTML; the script after it may un-hide
  // it (suppressHydrationWarning covers that one attribute).
  const prepaint = placeholder && Boolean(prepaintScript);
  return (
    <>
    <section
      className={`max-w-7xl mx-auto px-4 ${className}`}
      data-testid={placeholder ? testIds.placeholder : testIds.section}
      aria-busy={placeholder || undefined}
      hidden={prepaint || undefined}
      suppressHydrationWarning={prepaint || undefined}
    >
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h2 className="font-headline-md text-headline-md text-text">
          {heading}
        </h2>
        {action}
      </div>
      {/* MEH-1391: relative wrapper hosts the absolute arrow pair. */}
      <div className="relative">
        <ScrollArrows affordance={affordance} />
        <div
          ref={affordance.scrollRef}
          data-testid={testIds.rail}
          className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide -mx-1 ps-1 after:content-[''] after:shrink-0 after:w-4"
        >
          {placeholder &&
            Array.from({ length: placeholderCount }, (_, i) => (
              <div
                key={i}
                aria-hidden="true"
                className="shrink-0 w-[160px] bg-background border border-border rounded-md overflow-hidden"
              >
                <div className="w-full h-[100px] bg-green-50 animate-pulse" />
                <div className="p-2.5">
                  <p className="font-headline-md font-bold text-sm truncate invisible">&nbsp;</p>
                  <p className="text-xs truncate invisible">&nbsp;</p>
                </div>
              </div>
            ))}
          {items.map((p) => {
          const href = p.slug ? `/${p.slug}` : `/producer/${p.id}`;
          const imgSrc = optimizeCloudinary(p.images?.[0], { aspectRatio: IMAGE_RATIOS.strip, width: 320 });
          return (
            <Link
              key={p.id}
              href={href}
              data-testid={testIds.card}
              className="shrink-0 w-[160px] bg-background border border-border rounded-md overflow-hidden transition group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
            >
              <div className="relative w-full h-[100px] bg-green-50 overflow-hidden" data-testid={testIds.image}>
                {imgSrc && failedImgs[p.id] !== imgSrc ? (
                  <Image
                    src={imgSrc}
                    alt={p.name}
                    fill
                    sizes="160px"
                    className="object-cover group-hover:scale-105 transition duration-300"
                    onError={() => setFailedImgs((prev) => ({ ...prev, [p.id]: imgSrc }))}
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
      </div>
    </section>
    {prepaint && <script dangerouslySetInnerHTML={{ __html: prepaintScript }} />}
    </>
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
 * (eyebrow / CTA patterns) is locked from the freeze via home.featured.*.
 *
 * @param {?{
 *   quote: string,        // feature headline — display line, no terminal period
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
  // MEH-1976: above the `if (!featured)` early return — hooks cannot be
  // conditional. Holds the src that failed so a new photo clears it on render.
  const [failedSrc, setFailedSrc] = useState(null);
  if (!featured) return null;
  const photo = featured.photo
    ? optimizeCloudinary(featured.photo, { aspectRatio: IMAGE_RATIOS.featured, width: 900 })
    : null;
  // The tonal-plate branch below is described as "never a broken <img>", which
  // held only for a MISSING url. A url that 401s (MEH-1925) reached the <Image>
  // and rendered the broken glyph on the homepage. Now it falls through here.
  const photoFailed = failedSrc !== null && failedSrc === photo;
  // MEH-2441 (Sapir 27/10, design-distinct): the feature sits on a full-bleed
  // brand-green band below the businesses grid, so the home page has one
  // strong colour moment instead of cream all the way down. The place leads
  // (cream /90 — gold-on-dark text is 4.04:1, under AA), then the name large,
  // then the business's own line as a quote.
  // The "מאחורי הקלעים" sub-heading and the long description were dropped —
  // the band carries one line of the business's voice, the producer page
  // carries the story.
  const place = [featured.city, featured.category].filter(Boolean).join(" · ");
  return (
    <section className="bg-primary text-background" data-testid="home-featured">
      <div className="max-w-7xl mx-auto px-4 md:px-12 py-12 md:py-20">
        <div className="relative pt-4 mb-8">
          <span className="absolute top-0 start-0 w-10 h-[2px] bg-gold-on-dark" aria-hidden="true" />
          <h2 className="font-headline-lg text-2xl md:text-4xl font-black text-background">{t("eyebrow")}</h2>
        </div>
        {/* The column gap is in px on purpose: twelve columns carry eleven
            gaps, so a rem gap grows elevenfold with the reader's text size
            (150% text at 768px made the row 792px wide). 48px = gap-12 at the
            default size, so nothing moves there. */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-y-12 md:gap-x-[48px] items-end">
          <FadeInSection className="md:col-span-7">
            {photo && !photoFailed ? (
              <Image
                src={photo}
                alt={featured.name}
                width={900}
                height={675}
                sizes="(max-width: 768px) 100vw, 58vw"
                className="aspect-[4/3] w-full object-cover"
                onError={() => setFailedSrc(photo)}
              />
            ) : (
              // tonal plate fallback — never a broken <img> (IMG-01 pattern)
              <div className="aspect-[4/3] bg-primary-dark" aria-hidden="true" data-testid="home-featured-plate" />
            )}
          </FadeInSection>
          <FadeInSection className="md:col-span-5 flex flex-col gap-4" delay={0.1}>
            {place && (
              // Cream, not gold: gold-on-dark on bg-primary is 4.04:1, under AA
              // for 13px text. The gold stays on the rule, quote border and link.
              <p className="text-sm font-semibold text-background/90" data-testid="home-featured-place">
                {place}
              </p>
            )}
            {/* h3 under the "היכרות" h2, so heading navigation reaches the business. */}
            <h3 className="font-headline-lg font-black text-4xl md:text-6xl leading-none text-background [word-break:keep-all] [overflow-wrap:anywhere]">
              {featured.name}
            </h3>
            <p className="font-headline-md font-medium text-xl md:text-2xl leading-snug border-s-2 border-gold-on-dark ps-4">
              {featured.quote}
            </p>
            {featured.attribution && (
              <p className="text-sm text-background/90">{featured.attribution}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {featured.href && (
                <Link
                  href={featured.href}
                  className="font-semibold text-background underline decoration-gold-on-dark underline-offset-4 hover:text-gold-on-dark transition rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-on-dark"
                >
                  {t("cta_meet", { name: featured.name })}
                </Link>
              )}
              {featured.writeHref && (
                <a
                  href={featured.writeHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-background/90 underline decoration-gold-on-dark underline-offset-4 hover:text-gold-on-dark transition rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-on-dark"
                >
                  {t("cta_write", { name: featured.name })}
                </a>
              )}
            </div>
          </FadeInSection>
        </div>
      </div>
    </section>
  );
}

/**
 * CTA — "הוסיפי את העסק שלך". Static, prop-free.
 */
export function HomeCTA() {
  const t = useTranslations();
  // MEH-1041: HOME-28 light-warm treatment — cream surface, gold rule + green-pill CTA (was dark band + white button).
  return (
    <section className="bg-background text-text py-20" data-testid="home-cta">
      <div className="max-w-3xl mx-auto px-4 text-center">
        <h2 className="font-headline-display text-headline-display mb-4">
          {t("home.cta.heading")}
        </h2>
        {/* MEH-788 copy-Δ: P5-v2 lock carries 3 body lines (recognition-first,
            then curation, then the closing nudge) — body prose keeps periods. */}
        <p className="text-fg-muted text-lg mb-2 max-w-xl mx-auto">
          {t("home.cta.body_l1")}
        </p>
        <p className="text-fg-muted text-lg mb-2 max-w-xl mx-auto">
          {t("home.cta.body_l2")}
        </p>
        <p className="text-fg-muted text-lg mb-8 max-w-xl mx-auto">
          {t("home.cta.body_l3")}
        </p>
        {/* MEH-1489: auth-state-aware CTA (producer -> dashboard, admin -> hidden). */}
        <BusinessCtaLink
          href="/register/producer"
          className="inline-block bg-primary text-white px-8 py-3 rounded-sm hover:bg-primary-dark transition font-medium"
        >
          {t("home.cta.button")}
        </BusinessCtaLink>
      </div>
    </section>
  );
}
