"use client";

import { useTranslations } from "next-intl";

/**
 * Module:   EditorialBreath
 * Purpose:  §06 magazine "breath" between the stats strip (§05) and the
 *           category grid (§07) — a calm full-width pull-quote inviting the
 *           visitor to get to know the people behind the food. Centered single
 *           column, identical on mobile and desktop, no card.
 * Does NOT: fetch data, take props, or own its copy (lives in
 *           home.editorial_breath.* in messages/he.json + en.json). Purely
 *           presentational — for the grid that follows see HomeCategoryGrid.jsx.
 * Related:  HomeCategoryGrid.jsx:87 (mirrored: dir="ltr" gold Cormorant numeral,
 *           font-english italic text-accent) + HomeCategoryGrid.jsx:40 (display
 *           headline + inline clamp()); admin/help/page.jsx:33 (t.rich pattern).
 * History:  MEH-733 (creation). EN copy mirrors HE pending i18n wave MEH-472.
 */
export function EditorialBreath() {
  const t = useTranslations();
  return (
    // Cream surface inherits the global paper-noise overlay (globals.css:55).
    // padding-block: --space-12/--space-20 mockup (72/120px) → nearest tokens.
    <section className="bg-background px-4 py-4xl md:py-6xl">
      {/* Centered single column — centering is the allowed RTL exception. */}
      <div className="max-w-3xl mx-auto flex flex-col items-center text-center">
        {/* Gold Cormorant numeral, LTR-isolated — REUSES: HomeCategoryGrid.jsx:87. */}
        <span dir="ltr" className="font-english italic font-semibold text-accent text-[18px] leading-none mb-md">
          06
        </span>
        {/* 40×1px gold rule @55% opacity (numeral→rule = --space-2 ≈ 12px = mb-md). */}
        <span aria-hidden="true" className="block w-10 h-px bg-accent/55 mb-3xl" />
        {/* Pull-quote — NO trailing period; emphasis word in --accent via t.rich.
            rule→quote = --space-8 ≈ 48px (mb-3xl on the rule above). */}
        <p
          className="font-headline-lg font-medium text-text"
          style={{ fontSize: "clamp(32px, 4vw, 54px)", lineHeight: 1.28 }}
        >
          {t.rich("home.editorial_breath.quote", {
            accent: (chunks) => <span className="text-accent">{chunks}</span>,
          })}
        </p>
      </div>
    </section>
  );
}
