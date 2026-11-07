"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import BusinessCtaLink from "@/components/BusinessCtaLink";
import { INERT_PRESENT } from "@/lib/inert-attr";

/**
 * Module:   JoinStickyBar
 * Purpose:  The /join sticky «מצטרפים» bar (MEH-2799). It appears only after the
 *           hero CTA has left the viewport and hides again before the closing
 *           band arrives, so exactly one «מצטרפים» is ever on screen — phone
 *           and desktop.
 * Does NOT: share code with StickyContactBar. That bar is bound to a producer
 *           (per-channel icon + href, WhatsApp beacon, review count, vacation
 *           dimming); this one has a fixed target. The PATTERN is mirrored —
 *           fixed full-width bar, hairline top border, inert while hidden,
 *           safe-area padding, no blur — which #4118's Phase 0 judged the
 *           smaller diff over an extraction.
 * Related:  app/[locale]/producer/[id]/components/StickyContactBar.jsx (the
 *           pattern); lib/inert-attr.js (MEH-2253: the one `inert` value right
 *           in both React runtimes); app/[locale]/join/page.js (the two
 *           markers this observes: [data-join-hero-cta], [data-join-closing]).
 * History:  MEH-2799 (creation).
 *
 * WHERE IT SITS: on phones the BottomNav pill owns the bottom edge
 * (BottomNav.jsx publishes its height as --bottom-nav-clearance), so the bar
 * rides directly above it; the fallback is the pill's expanded height, as every
 * other consumer of that var uses. From md the pill is hidden and the bar is
 * flush. The z-index is a bare class (z-40), below the pill (1000), the cookie
 * banner (1100) and the chat launcher, and above page content.
 */

// The closing band's own CTA takes over ~90px before the band reaches the viewport.
const CLOSING_LEAD_PX = 90;

export default function JoinStickyBar() {
  const t = useTranslations("join");
  const [heroPassed, setHeroPassed] = useState(false);
  const [closingNear, setClosingNear] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const hero = document.querySelector("[data-join-hero-cta]");
    const closing = document.querySelector("[data-join-closing]");
    const observers = [];
    if (hero) {
      const io = new IntersectionObserver(
        (entries) => {
          // The LAST entry is the current state; a fast scroll can queue several.
          const entry = entries[entries.length - 1];
          setHeroPassed(!entry.isIntersecting && entry.boundingClientRect.top < 0);
        },
        { threshold: 0 },
      );
      io.observe(hero);
      observers.push(io);
    }
    if (closing) {
      const io = new IntersectionObserver(
        // Intersecting the viewport grown 90px downward = the band is close.
        // Above the viewport (top < 0) = we are past it, in the footer.
        (entries) => {
          const entry = entries[entries.length - 1];
          setClosingNear(entry.isIntersecting || entry.boundingClientRect.top < 0);
        },
        { rootMargin: `0px 0px ${CLOSING_LEAD_PX}px 0px`, threshold: 0 },
      );
      io.observe(closing);
      observers.push(io);
    }
    return () => observers.forEach((io) => io.disconnect());
  }, []);

  const visible = heroPassed && !closingNear;

  return (
    <div
      data-testid="join-sticky-bar"
      data-visible={visible ? "true" : "false"}
      className={`vv-pin fixed inset-x-0 z-40 border-t border-border bg-background bottom-[var(--bottom-nav-clearance,calc(4.5rem+env(safe-area-inset-bottom,0px)))] md:bottom-0 md:pb-[env(safe-area-inset-bottom,0px)] transition-[opacity,transform,visibility] duration-200 ease-out motion-reduce:transition-none ${
        visible ? "visible translate-y-0 opacity-100" : "invisible pointer-events-none translate-y-4 opacity-0"
      }`}
      // MEH-1333 / MEH-2253: hidden = out of the tab order and the a11y tree.
      inert={!visible ? INERT_PRESENT : undefined}
    >
      {/* The bottom-END corner belongs to the chat launcher (rtl.md, MEH-1135),
          and it floats over this bar. So the content is grouped at the START
          and the END is left empty: pe-20 clears the 56px phone launcher at its
          16px inset; from md the group simply stops well short of the desktop
          pill. Measured at 390 + 1280 before this: the launcher covered «מצטרפים». */}
      <div
        data-testid="join-sticky-content"
        className="mx-auto flex max-w-5xl items-center justify-start gap-3 py-3 ps-4 pe-20 sm:ps-6 md:gap-5 md:pe-6"
      >
        <BusinessCtaLink
          href="/register/producer"
          data-testid="join-sticky-cta"
          className="inline-flex shrink-0 items-center rounded-lg bg-primary px-6 py-2.5 font-medium text-background transition hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
        >
          {t("cta")}
        </BusinessCtaLink>
        <p className="min-w-0 text-sm text-fg-muted">{t("meta_line")}</p>
      </div>
    </div>
  );
}
