// @ts-check
/**
 * Module:   HomeHolidayShelf
 * Purpose:  The homepage holiday shelf (MEH-3993): around a holiday, an
 *           editorial row of 3–5 businesses that match the holiday's search
 *           (chanuka → «שמן זית»), with an eyebrow, a serif heading, a subline
 *           and a link to all the results. Renders nothing below 3 businesses.
 * Touches:  GET /producers?q=<holiday query>&limit=5, once, when the shelf
 *           comes near the viewport (a home page load that never scrolls down
 *           sends no request — the suite and the visitors share one per-IP
 *           limit, testing.md «E2E flake prevention»). GET /holiday-mode for
 *           the admin override.
 * Does NOT: take part in the banner single-slot (MEH-879). Until MEH-3993 this
 *           was HolidayBanner, an alert card in that slot with a colour per
 *           holiday and a close button; it is content now, so it has no close
 *           button, keeps nothing in localStorage and uses brand tokens only.
 * Related:  lib/holidays.js (which holiday, which query), HomeSeasonalNow.jsx
 *           (the self-hiding section and the 3-business rule this repeats),
 *           HomeWhatsOn.jsx (the near-viewport fetch and the sideways row).
 * History:  MEH-55 (banner) · MEH-879 (single-slot) · MEH-3986 (dismissal) ·
 *           MEH-3993 (shelf).
 */
"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getActiveHoliday } from "@/lib/holidays";
import { ProducersFeedSchema } from "@/lib/schemas";
import ProducerCard from "@/components/ProducerCard";
import SectionHeading from "@/components/ui/SectionHeading";
import api from "@/lib/api";
import useNearViewport from "@/hooks/useNearViewport";
import { SEASONAL_MIN_PRODUCERS } from "./HomeSeasonalNow";

/** At most this many cards; the link carries the rest. */
export const HOLIDAY_SHELF_MAX = 5;
/** Same preload distance as the «מה קורה» rows (HomeWhatsOn.jsx:70). */
const PRELOAD_MARGIN = "600px 0px";

export default function HomeHolidayShelf() {
  const t = useTranslations("group_buys.holiday_banner");
  // MEH-2741: the holiday's own words live under `holidays.<key>`.
  const tHoliday = useTranslations("holidays");
  const [holiday, setHoliday] = useState(null);
  const [rows, setRows] = useState(/** @type {any[]} */ ([]));

  useEffect(() => {
    // MEH-882: the date-based holiday resolves without the network; the admin
    // override (/holiday-mode) only replaces it.
    setHoliday(getActiveHoliday());
    api
      .get("/holiday-mode")
      .then((r) => {
        if (r.data?.enabled && r.data?.key) {
          const forced = getActiveHoliday(r.data.key);
          if (forced) setHoliday(forced);
        }
      })
      .catch(() => { /* fail-open — the date-based holiday stands */ });
  }, []);

  const query = holiday?.searchParams?.q;
  // Observe only while there is a holiday to fetch for.
  const [sentinelRef, near] = useNearViewport(PRELOAD_MARGIN, !!holiday);
  useEffect(() => {
    if (!near || !query) return undefined;
    let alive = true;
    api
      .get("/producers", { params: { q: query, limit: HOLIDAY_SHELF_MAX } })
      .then((r) => {
        const parsed = ProducersFeedSchema.safeParse(r.data);
        if (alive) setRows(parsed.success ? parsed.data.slice(0, HOLIDAY_SHELF_MAX) : []);
      })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [near, query]);

  if (!holiday) return null;
  // Nothing on screen until there are enough businesses; the 1px sentinel is
  // what lets the shelf know the reader is getting close.
  if (rows.length < SEASONAL_MIN_PRODUCERS) {
    return <div ref={sentinelRef} aria-hidden="true" className="h-px" />;
  }

  const key = holiday.key;
  const name = tHoliday(`${key}.name`);
  // A holiday without shelf words of its own falls back to the words it
  // already has: heading → name, subline → tagline, link → cta.
  const heading = tHoliday.has(`${key}.shelf_heading`) ? tHoliday(`${key}.shelf_heading`) : name;
  const eyebrow = holiday.upcoming ? t("eyebrow", { name }) : name;
  const href = `/producers?q=${encodeURIComponent(query)}`;

  return (
    <section
      className="max-w-7xl mx-auto px-4 pb-10"
      // MEH-991: VRT hides this date-dependent section (e2e/visual/parity.css).
      data-testid="home-holiday-shelf"
      aria-labelledby="home-holiday-shelf-heading"
    >
      {/* The eyebrow + 32×1px gold rule of HomeCategoryGrid.jsx:65 — the
          home's one eyebrow pattern. Hidden when it would repeat the heading. */}
      {eyebrow !== heading && (
        <span className="flex items-center gap-3 font-medium text-2xs text-accent mb-1">
          {eyebrow}
          <span className="inline-block w-8 h-px bg-accent" aria-hidden="true" />
        </span>
      )}
      <SectionHeading id="home-holiday-shelf-heading">{heading}</SectionHeading>
      <p className="mt-1 text-[15px] text-fg-muted">{tHoliday(`${key}.tagline`)}</p>
      {/* A phone scrolls the row sideways (HomeWhatsOn.jsx:575); from lg it is
          a 3-up grid like «עכשיו בעונה», and cards 4–5 stay for the phone. */}
      <ul className="mt-4 flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-proximity -mx-4 px-4 scroll-px-4 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0">
        {rows.map((p) => (
          <li key={p.id} className="w-[78%] shrink-0 snap-start sm:w-80 lg:w-auto lg:[&:nth-child(n+4)]:hidden">
            <ProducerCard producer={p} referrer="home-holiday" />
          </li>
        ))}
      </ul>
      <div className="mt-1">
        {/* DESIGN.md «Text links look tappable without hover» (MEH-2831). */}
        <Link
          href={href}
          className="inline-flex items-center gap-1 min-h-touch text-sm font-semibold text-primary underline underline-offset-4 hover:text-primary-dark rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {tHoliday(`${key}.cta`)}
          <ArrowLeft size={16} className="ltr:rotate-180" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
