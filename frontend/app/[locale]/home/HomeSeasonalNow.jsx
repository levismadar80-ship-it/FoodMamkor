/**
 * Module:   HomeSeasonalNow
 * Purpose:  The "עכשיו בעונה" homepage module — an editorially curated strip of
 *           businesses whose seasonal mark has not expired. Renders nothing at
 *           all below the 3-business threshold.
 * Touches:  Nothing. Pure presentation over the rows the server shell already
 *           fetched from GET /producers?in_season=true.
 * Does NOT: decide WHO is in season (that is `producers.in_season_until`, set
 *           by an admin) and does NOT filter by date — the API answered that
 *           question already, against the Israel calendar day.
 * Related:  app/[locale]/page.js (the fetch), home/HomeClient.jsx (the slot),
 *           home/HomeStaticBlocks.jsx:19 (HomeRecentlyViewed — the self-hiding
 *           section pattern this follows).
 * History:  MEH-1287 chunk B (creation).
 *
 * A new file rather than a sixth export in HomeStaticBlocks.jsx, which is
 * already 296 lines against the repo's `max-lines: 250` budget — adding a
 * module there deepens an existing lint debt to save a file.
 */
"use client";

import { useTranslations } from "next-intl";
import ProducerCard from "@/components/ProducerCard";

// ADDENDUM-4 §category A. THREE, not one: a curated "now in season" strip
// showing a single business reads as an ad for that business rather than as an
// editorial selection, and the module's whole claim is that somebody chose
// among options. Below the threshold the section does not render — no heading,
// no empty state, nothing to explain (the card: "אם אין בחירה פעילה — המודול
// לא מרונדר").
export const SEASONAL_MIN_PRODUCERS = 3;

export default function HomeSeasonalNow({ producers }) {
  const t = useTranslations();
  const rows = Array.isArray(producers) ? producers : [];
  if (rows.length < SEASONAL_MIN_PRODUCERS) return null;
  return (
    <section
      className="max-w-7xl mx-auto px-4 pb-10"
      data-testid="home-seasonal-now"
      aria-labelledby="home-seasonal-now-heading"
    >
      <h2
        id="home-seasonal-now-heading"
        className="font-headline-md text-headline-md text-text mb-4"
      >
        {t("home.seasonal.heading")}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map((p) => (
          <ProducerCard key={p.id} producer={p} referrer="home-seasonal" />
        ))}
      </div>
    </section>
  );
}
