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
 *           frontend/app/[locale]/page.js (the dynamic({ loading }) consumer).
 * History:  MEH-604 (creation, 2026-05-16 — extracted from HomepageMiniMap
 *             after the inline-export version pulled Leaflet into SSR).
 */

"use client";

import { MapTrifold } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

export default function HomepageMiniMapSkeleton() {
  const t = useTranslations("map.homepage_mini");
  return (
    <section
      aria-label={t("aria")}
      className="mt-6 mb-12 md:mt-12 md:mb-16 px-4 md:px-6"
    >
      <div className="max-w-6xl mx-auto">
        <header className="mb-3 text-center">
          <h2 className="text-xl md:text-2xl font-semibold text-site-text">
            {t("dot_caption")}
          </h2>
          <p className="text-sm text-fg-muted mt-1">{t("dot_subtitle")}</p>
        </header>
        <div className="rounded-[12px] overflow-hidden border border-border h-[320px] md:h-[420px] relative">
          <div className="w-full h-full rounded-[12px] bg-light animate-pulse flex flex-col items-center justify-center gap-3">
            <MapTrifold size={48} weight="duotone" className="text-primary/30" />
            <p className="text-fg-muted text-sm">{t("loading")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
