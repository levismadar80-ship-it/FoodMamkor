"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowCounterClockwise,
  Basket,
  CalendarBlank,
  CalendarX,
  CookingPot,
  Drop,
  MapTrifold,
  Path,
  Plant,
  Plus,
  Rows,
  Storefront,
} from "@phosphor-icons/react";
import { useTranslations, useLocale } from "next-intl";
import api from "@/lib/api";
import { optimizeCloudinary } from "@/lib/cloudinary";
import { formatEventDate } from "@/lib/format-date";
import CitySearch from "@/components/CitySearch";
import Breadcrumb from "@/components/Breadcrumb";
import ChipScrollRow from "@/components/ChipScrollRow";
import CalendarView from "@/components/CalendarView";
import { EVENT_CATEGORIES, EXPERIENCE_CATEGORIES, withAll } from "@/lib/event-categories";

// MEH-134: S10 "The Almanac" visual port. Events API + filter logic +
// date formatting (lib/format-date.js) untouched — layout layer only.
// EventCard rewritten as the date-rail EntryRow (the page's signature
// gesture); experiences render through the SAME EntryRow (gold accent),
// so ExperienceCard.jsx is no longer imported here (still owns
// /experiences + /mine). Calendar view keeps CalendarView as-is.

// MEH-788: events hero — license-clean Unsplash market-produce flat-lay (4:3
// 3000×2250, Unsplash License). Smart-cropped to a wide 16:9 band via g_auto
// (Cloudinary saliency) then CSS cover fills the height-capped band — same
// discipline as the home hero (a downward-angle source under plain center-cover
// would slice the produce). w_1920 downscales the 3000px original (never
// upscales). f_auto,q_auto via the helper — no hardcoded transform string.
// REUSES: app/[locale]/home/HomeHero.jsx:18 (optimizeCloudinary ar + width)
const HERO_MAX_WIDTH = 1920;
const HERO_IMAGE = optimizeCloudinary(
  "https://res.cloudinary.com/dfzpscjks/image/upload/v1781214591/staging/pick-unsplash-1507048331197.jpg",
  { aspectRatio: "16:9", width: HERO_MAX_WIDTH }
);

// MEH-788: green hero scrim — the green-900 (#143228 ≡ rgb(20 50 40)) analogue
// of HomeHero's warm `--scrim-ink` (globals.css). Inline (not a globals.css
// utility) to keep the wire inside EventsClient.jsx per the MEH-788 scope, and
// green (not warm ink) to carry the page's existing primary-dark hero identity.
// Bottom-anchored band: H1 sits in the lower third (α ≥ .72), subtitle lower
// still (α ≥ .88), so white text holds ≥ 4.5:1 over ANY g_auto crop. Worst case
// = a blown-white highlight under the H1 top line at α ≈ .72 → ≈ 5.7:1 ≥ 4.5.
const HERO_SCRIM =
  "linear-gradient(to top," +
  "rgb(20 50 40 / 0.92) 0%," +
  "rgb(20 50 40 / 0.88) 50%," +
  "rgb(20 50 40 / 0.72) 72%," +
  "rgb(20 50 40 / 0.30) 88%," +
  "rgb(20 50 40 / 0) 100%)";

// MEH-869: category sets moved to the shared lib/event-categories.js
// (were duplicated across 5 call-sites). withAll() prepends the "all" chip.
const CATEGORY_KEYS = withAll(EVENT_CATEGORIES);

const EXPERIENCE_CATEGORY_KEYS = withAll(EXPERIENCE_CATEGORIES);

// Category glyph per wire value (Phosphor only — ADR-013). Falls back to
// CalendarBlank for any unmapped/free-text category.
const CATEGORY_ICON = {
  "סדנה": CookingPot,
  "סיור": Path,
  "שוק": Storefront,
  "קטיף": Basket,
  "טעימות": Drop,
  "בישול": CookingPot,
  "תזונה": Plant,
  "סיור אוכל": MapTrifold,
  "חקלאות": Plant,
};

function formatTime(t) {
  if (!t) return "";
  return t.slice(0, 5);
}

// Normalize an event OR experience row into one shape the rail renderer
// understands. Field names diverge between the two APIs; the accent
// ("green" event / "gold" experience) drives the species styling.
function toEntry(row, tab) {
  const isExp = tab === "experiences";
  return {
    id: row.id,
    title: row.title,
    date: row.event_date,
    time: row.event_time,
    who: isExp ? row.host?.name : row.producer_name,
    city: row.city,
    category: row.category,
    price: isExp ? row.price_per_person : row.price,
    description: row.description,
    accent: isExp ? "gold" : "green",
    href: isExp ? `/experiences/${row.id}` : `/events/${row.id}`,
  };
}

export default function EventsPage() {
  const t = useTranslations("events.list");
  const tCat = useTranslations("events.categories");
  const tExpCat = useTranslations("events.experience_categories");
  const locale = useLocale();
  const search = useSearchParams();
  const router = useRouter();
  // Tab state lives in the URL so /events?tab=experiences is a real
  // deep-link and survives refresh / share / bookmark.
  const initialTab = search.get("tab") === "experiences" ? "experiences" : "events";
  const [tab, setTab] = useState(initialTab);
  // View mode — list (default) vs calendar. Independent of tab; applies
  // to whichever data set (events / experiences) is loaded.
  const [view, setView] = useState("list");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");

  // Reset filters when switching tabs — the two tabs have different
  // category vocabularies, so keeping a cross-tab category would
  // silently filter to zero rows.
  const switchTab = (next) => {
    if (next === tab) return;
    setTab(next);
    setCategory("");
    setCity("");
    const qs = next === "experiences" ? "?tab=experiences" : "";
    router.replace(`/events${qs}`, { scroll: false });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, city, category]);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (city) params.city = city;
      if (category) params.category = category;
      const endpoint = tab === "experiences" ? "/experiences" : "/events";
      const r = await api.get(endpoint, { params });
      setRows(r.data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const isExp = tab === "experiences";
  // Backward-compatibility alias so the render code keeps using `events`
  // even when the tab is experiences.
  const events = rows;
  const activeCategories = isExp ? EXPERIENCE_CATEGORY_KEYS : CATEGORY_KEYS;
  const categoryLabel = (entry) =>
    isExp ? tExpCat(entry.labelKey) : tCat(entry.labelKey);

  // Chips → shared ChipScrollRow (radio semantics). The wire value for
  // "all" is "" but ChipScrollRow's reset sentinel is "all" — bridge the
  // two so its scroll-pinning behaves like /producers + /map.
  const chips = activeCategories.map((c) => ({
    key: c.key || "all",
    label: categoryLabel(c),
  }));
  const activeChipKey = category === "" ? "all" : category;
  const onChipClick = (k) => setCategory(k === "all" ? "" : k);

  // Group rows into consecutive month buckets (same logic as before —
  // restyled into the month-divider). Stores month + year labels split so
  // the year can render in Cormorant italic per the FINAL.
  const groupedByMonth = useMemo(() => {
    const groups = [];
    const index = {};
    for (const row of events) {
      const monthLabel = formatEventDate(row.event_date, locale, { month: "long" });
      const yearLabel = formatEventDate(row.event_date, locale, { year: "numeric" });
      const key = `${yearLabel}-${monthLabel}`;
      if (index[key] == null) {
        index[key] = groups.length;
        groups.push({ key, monthLabel, yearLabel, items: [] });
      }
      groups[index[key]].items.push(row);
    }
    return groups;
  }, [events, locale]);

  const resetFilters = () => {
    setCity("");
    setCategory("");
  };

  return (
    <div>
      {/* Breadcrumb — stays on cream so it reads on the dark desktop hero
          below without recoloring the shared component. */}
      <div className="max-w-5xl mx-auto px-4 pt-4">
        <Breadcrumb items={[{ href: "/", label: t("breadcrumb_home") }, { label: t("breadcrumb_events") }]} />
      </div>

      {/* Header — type-led per tab, now a full-bleed Ken Burns produce hero
          (MEH-788). Image on all viewports; the green HERO_SCRIM band holds the
          H1 + subtitle ≥ AA over any g_auto crop. Reuses the home-hero motion
          (kenburns-right, globals.css) — honours prefers-reduced-motion via the
          global off-switch (animation:none) + <MotionConfig reducedMotion>. */}
      <section className="relative isolate w-full overflow-hidden h-[clamp(240px,34svh,300px)] md:h-[clamp(300px,40svh,380px)]">
        {/* Ken Burns layer — decorative produce photo. inset -5% gives the
            ≤1.08 zoom drift room. REUSES: app/[locale]/home/HomeHero.jsx:67 */}
        <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
          <div
            className="kenburns-right absolute"
            style={{
              inset: "-5%",
              backgroundImage: `url(${HERO_IMAGE})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }}
          />
        </div>

        {/* green scrim band (HERO_SCRIM) — H1 + subtitle stay ≥ AA over the photo */}
        <div className="absolute inset-0" aria-hidden="true" style={{ backgroundImage: HERO_SCRIM }} />

        {/* Text — bottom-anchored on the scrim; start-aligned (RTL right). */}
        <div className="absolute inset-x-0 bottom-0 px-4 pb-6 md:px-14 md:pb-10 text-background">
          <div className="max-w-5xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-green-100">
              {isExp ? t("eyebrow_experiences") : t("eyebrow_events")}
            </p>
            <h1 className="font-headline-display font-bold text-3xl md:text-6xl leading-tight text-background mt-1.5 md:mt-3">
              {isExp ? t("h1_experiences") : t("title")}
            </h1>
            <p className="text-base md:text-xl text-background/85 mt-2 leading-snug">
              {isExp ? t("subtitle_experiences") : t("subtitle")}
            </p>
          </div>
        </div>
      </section>

      {/* Tabs — producer events vs community experiences + per-tab add */}
      <div className="max-w-5xl mx-auto px-4 pt-4">
        <div role="tablist" className="flex items-end gap-4 border-b border-border">
          <button
            role="tab"
            aria-selected={!isExp}
            onClick={() => switchTab("events")}
            className={`pb-3 pt-2 min-h-[44px] inline-flex items-center text-sm md:text-base font-semibold border-b-2 -mb-px transition ${
              !isExp ? "border-primary text-primary" : "border-transparent text-fg-muted hover:text-primary"
            }`}
          >
            {t("tab_events")}
          </button>
          <button
            role="tab"
            aria-selected={isExp}
            onClick={() => switchTab("experiences")}
            className={`pb-3 pt-2 min-h-[44px] inline-flex items-center text-sm md:text-base font-semibold border-b-2 -mb-px transition ${
              isExp ? "border-primary text-primary" : "border-transparent text-fg-muted hover:text-primary"
            }`}
          >
            {t("tab_experiences")}
          </button>
          <Link
            href={isExp ? "/experiences/new" : "/producer/dashboard/events/new"}
            className="ms-auto self-center min-h-[44px] inline-flex items-center text-sm font-medium text-primary hover:underline"
          >
            {isExp ? t("submit_experience") : t("add_event")} →
          </Link>
        </div>
      </div>

      {/* Toolbar — city search + list/calendar view toggle */}
      <div className="max-w-5xl mx-auto px-4 pt-4">
        <div className="flex items-center gap-2 md:gap-3">
          <CitySearch
            id="events-city"
            label={t("filter_city_label")}
            value={city}
            onChange={setCity}
            placeholder={t("filter_city_placeholder")}
            className="flex-1 md:max-w-xs"
          />
          <div
            role="tablist"
            aria-label={t("view_mode_label")}
            className="inline-flex shrink-0 rounded-full border border-border bg-surface-card overflow-hidden"
          >
            <button
              role="tab"
              aria-selected={view === "list"}
              // Label is icon-only on mobile (hidden sm:inline); keep a stable
              // accessible name on every viewport (MEH-134 — a11y + E2E locator).
              aria-label={t("view_list")}
              onClick={() => setView("list")}
              className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[44px] text-sm font-medium transition ${
                view === "list" ? "bg-primary text-white" : "text-fg-muted hover:text-primary"
              }`}
            >
              <Rows size={18} weight={view === "list" ? "fill" : "regular"} />
              <span className="hidden sm:inline">{t("view_list")}</span>
            </button>
            <button
              role="tab"
              aria-selected={view === "calendar"}
              aria-label={t("view_calendar")}
              onClick={() => setView("calendar")}
              className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[44px] text-sm font-medium transition ${
                view === "calendar" ? "bg-primary text-white" : "text-fg-muted hover:text-primary"
              }`}
            >
              <CalendarBlank size={18} weight={view === "calendar" ? "fill" : "regular"} />
              <span className="hidden sm:inline">{t("view_calendar")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Category chips — shared ChipScrollRow (rounded-md, MEH-764). */}
      <div className="max-w-5xl mx-auto px-4 pt-3">
        <ChipScrollRow
          variant="category"
          chips={chips}
          activeKey={activeChipKey}
          onChipClick={onChipClick}
          // brand cream — shared ChipScrollRow fade API, matches
          // ProducersClient.jsx:264 + HomeProducersGrid.jsx:70.
          fadeBg="#F5F0E8"
        />
      </div>

      {/* Feed */}
      <section className="max-w-5xl mx-auto px-4 pt-4 pb-16">
        {loading ? (
          <SkeletonRows srLabel={isExp ? t("loading_experiences") : t("loading_events")} />
        ) : events.length === 0 ? (
          <EmptyState tab={tab} t={t} onReset={resetFilters} />
        ) : view === "calendar" ? (
          <CalendarView items={events} linkPrefix={isExp ? "/experiences" : "/events"} />
        ) : (
          <div className="space-y-2">
            {groupedByMonth.map((group) => (
              <section key={group.key}>
                <div className="flex items-baseline gap-2.5 pt-6 pb-1.5">
                  {/* MEH-858 F4: month divider is the h2 rung (was a span) so
                      the outline is h1 → h2 → h3 with no skipped level. */}
                  <h2 className="font-headline-md text-2xl font-bold text-text leading-none">
                    {group.monthLabel}
                  </h2>
                  <span className="font-english italic text-base font-medium text-accent numeric">
                    {group.yearLabel}
                  </span>
                  <span className="flex-1 h-px bg-border" />
                </div>
                <div>
                  {group.items.map((row) => (
                    <EntryRow key={row.id} entry={toEntry(row, tab)} freeLabel={t("free")} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// The date-rail row — the page's signature gesture. Date leads (Frank
// Ruhl day numeral on a colored tick down the start edge); Latin
// numerals (time, price) are Cormorant italic, Hebrew stays upright.
function EntryRow({ entry, freeLabel }) {
  const locale = useLocale();
  const isExp = entry.accent === "gold";
  const Icon = CATEGORY_ICON[entry.category] ?? CalendarBlank;
  const accentText = isExp ? "text-accent" : "text-primary";
  const tickBg = isExp ? "bg-accent" : "bg-primary";
  const catChip = isExp ? "bg-accent/10 text-accent" : "bg-green-50 text-primary";
  const day = formatEventDate(entry.date, locale, { day: "2-digit" });
  const weekday = formatEventDate(entry.date, locale, { weekday: "long" });
  const month = formatEventDate(entry.date, locale, { month: "long" });
  const time = formatTime(entry.time);
  const meta = [entry.who, entry.city].filter(Boolean).join(" · ");
  const isFree = !(entry.price > 0);

  return (
    <Link
      href={entry.href}
      className="relative grid grid-cols-[64px_1fr] md:grid-cols-[104px_1fr] border-b border-border transition hover:bg-surface-card"
    >
      {/* species tick — start edge, full height */}
      <span aria-hidden="true" className={`absolute start-0 inset-y-0 w-[3px] ${tickBg}`} />
      {/* date rail */}
      <div className="py-4 md:py-5 grid justify-items-center content-start gap-0.5">
        <span className="font-headline-display font-bold text-3xl md:text-5xl leading-none text-text numeric">
          {day}
        </span>
        <span className="text-xs font-semibold text-fg-muted mt-1">{weekday}</span>
        <span className="text-[10px] text-fg-muted">{month}</span>
        {time && (
          <span dir="ltr" className={`font-english italic text-sm mt-1 numeric ${accentText}`}>
            {time}
          </span>
        )}
      </div>
      {/* body */}
      <div className="py-4 md:py-5 ps-3 pe-4 min-w-0">
        {/* MEH-858 F5: category eyebrow removed — it duplicated the pill chip
            below (and uppercase tracking was a no-op on Hebrew). The glyph now
            leads the chip, so the category shows once, still with its icon. */}
        <h3 className="font-headline-md text-lg md:text-2xl font-bold text-text leading-snug">
          {entry.title}
        </h3>
        {meta && <p className="text-sm text-fg-muted mt-1">{meta}</p>}
        {entry.description && (
          <p className="text-sm text-text/85 line-clamp-2 mt-2 leading-relaxed">{entry.description}</p>
        )}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {entry.category && (
            <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ${catChip}`}>
              <Icon size={12} weight="bold" aria-hidden="true" />
              {entry.category}
            </span>
          )}
          {isFree ? (
            <span className={`ms-auto text-sm font-semibold ${accentText}`}>{freeLabel}</span>
          ) : (
            <span dir="ltr" className={`ms-auto font-english italic font-semibold numeric ${accentText}`}>
              {`₪${entry.price}`}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// Per-tab empty state — editorial, not apologetic. Phosphor glyph in
// gold, headline + body + a single real forward action (filter reset on
// events; add-experience on experiences).
function EmptyState({ tab, t, onReset }) {
  const isExp = tab === "experiences";
  const Icon = isExp ? CookingPot : CalendarX;
  return (
    <div className="flex flex-col items-center text-center px-6 py-16">
      <div className="grid place-items-center w-[76px] h-[76px] rounded-full bg-accent/10 border border-accent/25 text-accent">
        <Icon size={36} />
      </div>
      {/* MEH-858 F4: empty-state title is h2 (was h4) — only heading under the
          page h1 when the feed is empty, so h1 → h2 with no skip. */}
      <h2 className="font-headline-md text-2xl font-bold text-text mt-5 max-w-[22ch] leading-snug">
        {isExp ? t("empty_experiences_title") : t("empty_events_title")}
      </h2>
      <p className="text-sm text-fg-muted mt-2.5 max-w-[30ch] leading-relaxed">
        {isExp ? t("empty_experiences_body") : t("empty_events_body")}
      </p>
      <div className="mt-6 w-full max-w-[260px]">
        {isExp ? (
          <Link
            href="/experiences/new"
            className="w-full inline-flex items-center justify-center gap-2 bg-primary text-white text-sm font-semibold px-5 py-3 rounded-full"
          >
            <Plus size={18} weight="bold" />
            {t("empty_experiences_cta")}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onReset}
            className="w-full inline-flex items-center justify-center gap-2 bg-primary text-white text-sm font-semibold px-5 py-3 rounded-full"
          >
            <ArrowCounterClockwise size={18} weight="bold" />
            {t("empty_events_cta")}
          </button>
        )}
      </div>
      <span aria-hidden="true" className="mt-6 w-9 h-0.5 bg-accent/50 rounded-full" />
    </div>
  );
}

// Loading skeleton — mirrors the rail geometry so the layout doesn't jump
// on hydrate. Cream-toned (opacity-on-cream per ADR-019), not gray blocks.
function SkeletonRows({ srLabel }) {
  return (
    <div aria-busy="true" aria-label={srLabel}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="grid grid-cols-[64px_1fr] md:grid-cols-[104px_1fr] border-b border-border">
          <div className="py-5 grid justify-items-center content-start gap-2">
            <span className="w-8 h-8 rounded bg-border/60 animate-pulse" />
            <span className="w-7 h-2.5 rounded bg-border/60 animate-pulse" />
          </div>
          <div className="py-5 ps-3 pe-4 grid gap-2.5">
            <span className="w-12 h-2.5 rounded bg-border/60 animate-pulse" />
            <span className="w-3/4 h-4 rounded bg-border/60 animate-pulse" />
            <span className="w-1/2 h-3 rounded bg-border/60 animate-pulse" />
            <span className="w-24 h-5 rounded-full bg-border/60 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
