/**
 * Module:   HomepageMiniMapSkeleton
 * Purpose:  SSR-able loading fallback for the HomepageMiniMap dynamic import
 *           on the homepage. Reserves height on first paint (before JS
 *           hydrates) so the above-the-fold slot has zero CLS.
 * Touches:  Nothing — pure JSX, no client-only APIs.
 * Does NOT: Render the live map (that's HomepageMiniMap.jsx, ssr:false because
 *           Leaflet touches `window` at module-eval time). This file MUST stay
 *           Leaflet-free so it can be imported synchronously into a server
 *           component without breaking SSR.
 * Related:  frontend/components/HomepageMiniMap.jsx (the live render — same
 *             dimensions + chrome, must stay in lockstep),
 *           frontend/components/HomepageMiniMapLazy.jsx (the consumer — the
 *             placeholder until scroll, and the dynamic import's `loading`).
 * History:  MEH-604 (creation, 2026-05-16 — extracted from HomepageMiniMap
 *             after the inline-export version pulled Leaflet into SSR);
 *           MEH-2850 C (the «open full map» row, so the box is the map's box).
 */

"use client";

import { ArrowRight, MapTrifold } from "@phosphor-icons/react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import SectionHeading from "@/components/ui/SectionHeading";

// MEH-2850 C: `sectionRef` lets HomepageMiniMapLazy watch this very box with
// an IntersectionObserver — no wrapper element, so the DOM order the home
// specs read (the mini-map as the businesses grid's next block) is unchanged.
export default function HomepageMiniMapSkeleton({ sectionRef = null } = {}) {
  const t = useTranslations("map.homepage_mini");
  return (
    <section
      ref={sectionRef}
      aria-label={t("aria")}
      className="mt-6 mb-12 md:mt-12 md:mb-16 px-4 md:px-6"
      data-testid="home-minimap"
    >
      <div className="max-w-6xl mx-auto">
        <header className="mb-3 text-center">
          <SectionHeading>
            {t("dot_caption")}
          </SectionHeading>
          {/* MEH-2635: subtitle removed here too. The skeleton must keep the
              same box as the loaded map — dropping the line from one and not
              the other is itself a layout shift. */}
        </header>
        <div className="rounded-md overflow-hidden border border-border h-[320px] md:h-[420px] relative">
          <div className="w-full h-full rounded-md bg-green-50 animate-pulse flex flex-col items-center justify-center gap-3">
            <MapTrifold size={48} className="text-primary/30" />
            <p className="text-fg-muted text-sm">{t("loading")}</p>
          </div>
        </div>
        {/* MEH-2850 C: the same «open full map» row as HomepageMiniMap.jsx —
            without it the section grew ~32px when the map arrived, and since
            the map now loads during scroll that jump happens in view. The
            link also works before Leaflet loads. */}
        <div className="mt-3 text-center">
          <Link
            href="/map"
            className="inline-flex items-center gap-1 text-primary hover:text-primary-dark text-sm font-medium"
          >
            {t("open_full")}
            <ArrowRight size={16} weight="bold" aria-hidden="true" className="rtl:rotate-180" />
          </Link>
        </div>
      </div>
    </section>
  );
}
