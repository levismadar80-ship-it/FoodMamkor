"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
// MEH-2245: the tab is the ROUTE (/events vs /experiences). MEH-2980: a tab
// switch rewrites that route in place (history.pushState, keeping any /en
// prefix) instead of navigating; usePathname follows Back / Forward.
import { usePathname } from "@/i18n/navigation";
import {
  ArrowCounterClockwise,
  ArrowRight,
  CalendarBlank,
  CalendarX,
  CookingPot,
  Plus,
  Rows,
} from "@phosphor-icons/react";
import { useTranslations, useLocale } from "next-intl";
import api from "@/lib/api";
import { optimizeCloudinary } from "@/lib/cloudinary";
import { formatEventDate } from "@/lib/format-date";
import CitySearch from "@/components/CitySearch";
import ChipScrollRow from "@/components/ChipScrollRow";
import CalendarView from "@/components/CalendarView";
// MEH-2497: the date-rail row (and its row normalizer) now lives in one shared
// component, so the home «אירועים קרובים» preview renders the same row.
import EventEntryRow, { toEventEntry } from "@/components/EventEntryRow";
import { EVENT_CATEGORIES, EXPERIENCE_CATEGORIES, withAll } from "@/lib/event-categories";
// MEH-2199 chunk 3: this page shipped the tablist keyboard layer inline in
// chunk 2; /settings then needed the identical behaviour, so it was lifted to
// a shared hook and this file retrofitted onto it. Two copies of the RTL arrow
// mapping would drift, and a drifted arrow direction is invisible in review —
// it reads as a plausible line either way.
import useTabsKeyboard from "@/hooks/useTabsKeyboard";
import ListingHubTabs from "@/components/ListingHubTabs";
import Button from "@/components/ui/Button";

// MEH-134: S10 "The Almanac" visual port. Events API + filter logic +
// date formatting (lib/format-date.js) untouched — layout layer only.
// EventCard rewritten as the date-rail EventEntryRow (components/) (the page's signature
// gesture); experiences render through the SAME EventEntryRow (gold accent),
// so the old experience card is no longer imported here (the route-as-tab
// merge deleted its last route consumer, the old /experiences client, and
// MEH-2248 deleted the component itself). MEH-2771: the calendar view
// lists its month through the same EventEntryRow (renderItem).

// MEH-788: events hero — license-clean Pexels market-produce photo (3:4
// 2400×3200, Pexels Free). Smart-cropped to a wide 16:9 band via g_auto
// (Cloudinary saliency) then CSS cover fills the height-capped band — same
// discipline as the home hero (a downward-angle source under plain center-cover
// would slice the produce). w_1920 downscales the 2400px original (never
// upscales). f_auto,q_auto via the helper — no hardcoded transform string.
// REUSES: app/[locale]/home/HomeHero.jsx:18 (optimizeCloudinary ar + width)
const HERO_MAX_WIDTH = 1920;
const HERO_IMAGE = optimizeCloudinary(
  "https://res.cloudinary.com/dfzpscjks/image/upload/v1782159035/events/hero-market.jpg",
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

// MEH-2847: clearing an already-empty selection keeps the SAME array, so it
// is not a state change and does not refetch — as setCategory("") on "" was.
const clearCategories = (prev) => (prev.length ? [] : prev);

// MEH-2245: one hub behind two routes. `initialTab` is decided by the route
// that mounts this component (/events → "events", /experiences →
// "experiences") — never by a ?tab= query. The old query-string deep-link
// 308s to /experiences in next.config.js redirects().
export default function EventsPage({ initialTab = "events", titles = null }) {
  const t = useTranslations("events.list");
  const tErr = useTranslations("error");
  const tCat = useTranslations("events.categories");
  const tExpCat = useTranslations("events.experience_categories");
  const locale = useLocale();
  // MEH-2980: the route (pathname) is the tab — read it so Back / Forward
  // across an in-place switch land on the right tab.
  const pathname = usePathname();
  const search = useSearchParams();
  const [tab, setTab] = useState(initialTab);
  // View mode — list (default) vs calendar. Independent of tab; applies
  // to whichever data set (events / experiences) is loaded.
  const [view, setView] = useState("list");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  // MEH-2396: a failed load is its own state. Before, the catch did
  // setRows([]) and the page rendered the editorial "אין אירועים" empty
  // state — a false statement when the server simply did not answer.
  const [loadError, setLoadError] = useState(false);
  // MEH-2396: a retry (or a filter change) while an earlier request is still
  // pending must not let that earlier request's late result overwrite the
  // newer one. Each load() takes a ticket; only the latest ticket may commit.
  const loadTicket = useRef(0);
  // MEH-1085 (DISC-08): city + category are deep-linkable — seeded from the
  // URL on mount. A URL category is accepted only when it
  // belongs to the initial tab's vocabulary, so a cross-tab share link can't
  // silently filter to zero rows.
  // MEH-2847: categories are MULTI-select, the /producers behaviour (MEH-1465,
  // ProducersClient.jsx:227): an ARRAY of category keys, OR on the server,
  // carried as repeated ?category=A&category=B. An old single-value link
  // (?category=X) hydrates the same way (getAll → ["X"]). Each value is
  // checked against the vocabulary on its own, so one bad value is dropped
  // without dropping the good ones; duplicates collapse.
  const [city, setCity] = useState(() => search.get("city") || "");
  const [categories, setCategories] = useState(() => {
    const vocab = initialTab === "experiences" ? EXPERIENCE_CATEGORIES : EVENT_CATEGORIES;
    const known = new Set(vocab.map((c) => c.key));
    return [...new Set(search.getAll("category"))].filter((k) => known.has(k));
  });

  // Reset filters when switching tabs — the two tabs have different
  // category vocabularies, so keeping a cross-tab category would
  // silently filter to zero rows. The URL-sync effect below mirrors the
  // reset into the query string.
  // MEH-2245: each tab owns its URL (/events, /experiences).
  // MEH-2980: the switch happens IN PLACE. It used to be router.push, and the
  // two pages are separate force-dynamic routes under [locale], so every tab
  // tap streamed app/[locale]/loading.js over the WHOLE page (hero, tabs and
  // list gone for ~450 ms on a phone, measured on staging), then remounted
  // this component and fetched the list a second time. Now the URL is written
  // with the native history.pushState, which Next (>= 14.1) folds into its
  // router — usePathname follows it and Back / Forward still work — without a
  // server round trip. Deep links and refreshes still hit the real route, so
  // each page keeps its own metadata; only document.title is set here.
  // DO NOT go back to router.push / <Link> navigation for these two tabs —
  // e2e/flows/46-hub-tab-switch.spec.ts reds on the loading flash (MEH-2980).
  const applyTab = (next) => {
    setTab(next);
    setCategories(clearCategories);
    setCity("");
    if (titles?.[next]) document.title = titles[next];
  };

  const switchTab = (next) => {
    if (next === tab) return;
    applyTab(next);
    const current = window.location.pathname;
    const path = /\/(events|experiences)\/?$/.test(current)
      ? current.replace(/\/(events|experiences)\/?$/, `/${next}`)
      : `/${next}`;
    window.history.pushState(null, "", path);
  };

  // MEH-2980: Back / Forward across an in-place switch. The pathname moves
  // without this component remounting, so the tab follows it here. Only the
  // two hub paths move the tab; anything else (tests render on "/") leaves it.
  const routeTab = /\/experiences\/?$/.test(pathname || "")
    ? "experiences"
    : /\/events\/?$/.test(pathname || "")
      ? "events"
      : null;
  useEffect(() => {
    if (routeTab && routeTab !== tab) applyTab(routeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeTab]);

  // MEH-1085 (DISC-08): single URL writer — the query string always mirrors
  // {city, category}, so filters survive refresh/share and the switchTab
  // reset clears them from the URL too — a cross-tab category is never
  // resurrected. Shallow history.replaceState, NOT router.replace: a Next
  // navigation from this mount-time effect re-suspends the useSearchParams
  // boundary (page.js Suspense) and resets client state — the E2E calendar
  // toggle caught exactly that. replaceState keeps it a pure URL mirror
  // (and preserves the locale-prefixed pathname on /en).
  // MEH-2245: `tab` is no longer written — the route carries it.
  useEffect(() => {
    const p = new URLSearchParams();
    if (city) p.set("city", city);
    // MEH-2847: one ?category= per selected key — the /producers format.
    for (const c of categories) p.append("category", c);
    const qs = p.toString();
    const current = window.location.search.replace(/^\?/, "");
    if (qs === current) return;
    const path = window.location.pathname;
    window.history.replaceState(null, "", qs ? `${path}?${qs}` : path);
  }, [city, categories]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, city, categories]);

  const load = async () => {
    const ticket = ++loadTicket.current;
    setLoading(true);
    setLoadError(false);
    try {
      const params = {};
      if (city) params.city = city;
      // MEH-2847: the whole array — lib/api.js serializes it as repeated
      // ?category= (paramsSerializer { indexes: null }); the server ORs it.
      if (categories.length) params.category = categories;
      const endpoint = tab === "experiences" ? "/experiences" : "/events";
      // MEH-2396: lib/api.js sets no timeout, so when the backend hangs (seen
      // 26/10: ~40 s of 502 during a Railway redeploy) the skeleton sat on
      // screen until the proxy gave up. 15 s is per-request on purpose — a
      // global axios timeout would also cut image uploads.
      const r = await api.get(endpoint, { params, timeout: 15000 });
      if (ticket !== loadTicket.current) return; // superseded
      setRows(r.data);
    } catch {
      if (ticket !== loadTicket.current) return; // superseded
      setRows([]);
      setLoadError(true);
    } finally {
      if (ticket === loadTicket.current) setLoading(false);
    }
  };

  const isExp = tab === "experiences";
  // Backward-compatibility alias so the render code keeps using `events`
  // even when the tab is experiences.
  const events = rows;
  const activeCategories = isExp ? EXPERIENCE_CATEGORY_KEYS : CATEGORY_KEYS;
  const categoryLabel = (entry) =>
    isExp ? tExpCat(entry.labelKey) : tCat(entry.labelKey);

  // Chips → shared ChipScrollRow. The wire value for "all" is "" but
  // ChipScrollRow's reset sentinel is "all" — bridge the two so its
  // scroll-pinning behaves like /producers + /map.
  const chips = activeCategories.map((c) => ({
    key: c.key || "all",
    label: categoryLabel(c),
  }));
  // MEH-2847: multi-select, as on /producers (ProducersClient.jsx:498-509).
  // «הכל» clears the set (and is the active chip while it is empty); tapping
  // a selected chip removes it; any other chip is added.
  const activeChipKeys = useMemo(() => new Set(categories), [categories]);
  const onChipClick = (k) => {
    setCategories((prev) => {
      if (k === "all") return clearCategories(prev);
      return prev.includes(k) ? prev.filter((c) => c !== k) : [...prev, k];
    });
  };

  // MEH-2199: one handler per tablist. The hook reads each row's own tabs out
  // of the DOM, so the two rows on this page cannot interfere with each other.
  // MEH-2859: the main tablist's handler moved into ListingHubTabs with the
  // row itself; only the list/calendar view toggle is still this page's own.
  const onViewTabsKeyDown = useTabsKeyboard(setView);

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
    setCategories(clearCategories);
  };

  // MEH-1865: a zero row count means two different things, and the page used
  // to render one surface for both. No new data signal is needed to tell them
  // apart: load() only ever sends city + category, so with NEITHER applied the
  // response IS the dataset for this tab. `filtersActive` therefore decides,
  // and it can only err in the safe direction — a genuinely empty dataset
  // reached WITH a filter on renders the filtered-to-zero surface, whose
  // "clear filters" action then reveals the true empty state one click later.
  // The reverse mistake (hiding the filters on a filtered-to-zero) is the one
  // that traps the reader with no way back but editing the URL, and it cannot
  // happen here.
  const filtersActive = Boolean(city || categories.length);
  // MEH-2396: an error is not a zero. Neither zero surface may render on a
  // failed load, or the page claims a dataset it never received.
  const isZero = !loading && !loadError && events.length === 0;
  const datasetEmpty = isZero && !filtersActive;
  const filteredToZero = isZero && filtersActive;

  return (
    <div>
      {/* no breadcrumb on this list page — no other top-level list
          (/producers, /group-buys) carries one, and «בית › חוויות» on a
          first-level page only repeats the bottom nav. Detail pages keep theirs. */}

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
            <p className="text-xs font-semibold text-green-100">
              {isExp ? t("eyebrow_experiences") : t("eyebrow_events")}
            </p>
            <h1 className="font-headline-display font-black text-3xl md:text-6xl leading-tight text-background mt-1.5 md:mt-3">
              {isExp ? t("h1_experiences") : t("title")}
            </h1>
            <p className="text-base md:text-xl text-background/85 mt-2 leading-snug">
              {isExp ? t("subtitle_experiences") : t("subtitle")}
            </p>
          </div>
        </div>
      </section>

      {/* MEH-2859: the row is now the shared four-tab hub row (events ·
          experiences · group buys · surprise baskets) in
          components/ListingHubTabs.jsx, so /group-buys and /rescue render the
          same one instead of a second copy. `onSelect` keeps this page's
          same-tick local switch for its own two tabs (MEH-2245); the other two
          are plain route changes. The add link moves in as `action`. */}
      <ListingHubTabs
        active={isExp ? "experiences" : "events"}
        onSelect={switchTab}
        action={
          <Link
            href={isExp ? "/producer/dashboard/experiences/new" : "/producer/dashboard/events/new"}
            className="min-w-0 min-h-touch inline-flex items-center text-sm font-medium text-primary hover:underline"
          >
            {isExp ? t("submit_experience") : t("add_event")}
            {/* MEH-990: raw → dingbat → Phosphor ArrowRight; rtl:rotate-180 = reading-forward in he (MEH-938 pattern) */}
            <ArrowRight size={16} weight="bold" aria-hidden="true" className="ms-1 rtl:rotate-180" />
          </Link>
        }
      />

      {/* Toolbar + category chips — the tab's filter controls. MEH-1865: on an
          empty dataset there is nothing to filter and nothing to re-view, so
          the whole control layer is withheld; on a filtered-to-zero it stays,
          because it is the only way back. */}
      {!datasetEmpty && (
        <>
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
                onKeyDown={onViewTabsKeyDown}
              >
                <button
                  role="tab"
                  data-tab-value="list"
                  aria-selected={view === "list"}
                  tabIndex={view === "list" ? 0 : -1}
                  // Label is icon-only on mobile (hidden sm:inline); keep a stable
                  // accessible name on every viewport (MEH-134 — a11y + E2E locator).
                  aria-label={t("view_list")}
                  onClick={() => setView("list")}
                  className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-touch text-sm font-medium transition ${
                    view === "list" ? "bg-primary text-white" : "text-fg-muted hover:text-primary"
                  }`}
                >
                  <Rows size={18} weight={view === "list" ? "fill" : "regular"} />
                  <span className="hidden sm:inline">{t("view_list")}</span>
                </button>
                <button
                  role="tab"
                  data-tab-value="calendar"
                  aria-selected={view === "calendar"}
                  tabIndex={view === "calendar" ? 0 : -1}
                  aria-label={t("view_calendar")}
                  onClick={() => setView("calendar")}
                  className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-touch text-sm font-medium transition ${
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
              activeKeys={activeChipKeys}
              onChipClick={onChipClick}
            />
          </div>
        </>
      )}

      {/* Feed */}
      <section className="max-w-5xl mx-auto px-4 pt-4 pb-16">
        {loading ? (
          <SkeletonRows srLabel={isExp ? t("loading_experiences") : t("loading_events")} />
        ) : loadError ? (
          <LoadError tErr={tErr} onRetry={load} />
        ) : filteredToZero ? (
          <NoResults t={t} onReset={resetFilters} />
        ) : datasetEmpty ? (
          <EmptyState tab={tab} t={t} />
        ) : view === "calendar" ? (
          <CalendarView
            items={events}
            kind={isExp ? "experiences" : "events"}
            renderItem={(row) => (
              <EventEntryRow entry={toEventEntry(row, tab, t)} freeLabel={t("free")} />
            )}
          />
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
                  <span dir="ltr" className="font-english italic text-base font-medium text-accent numeric">
                    {group.yearLabel}
                  </span>
                  <span className="flex-1 h-px bg-border" />
                </div>
                <div>
                  {group.items.map((row) => (
                    <EventEntryRow key={row.id} entry={toEventEntry(row, tab, t)} freeLabel={t("free")} />
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

// Per-tab EMPTY DATASET state — editorial, not apologetic. Phosphor glyph in
// gold, headline + body. MEH-1865: this surface now renders only when nothing
// exists for the tab, so the events tab's old "clear the filter" button is gone
// — with no filter applied it was a no-op, and it is a filter control on the
// one state whose whole point is that there is nothing to filter. The heading
// and body are untouched. What replaces it is the one forward action that is
// real on BOTH tabs when the shelf is bare: go look at the businesses.
function EmptyState({ tab, t }) {
  const isExp = tab === "experiences";
  const Icon = isExp ? CookingPot : CalendarX;
  return (
    <div data-testid="events-empty-dataset" className="flex flex-col items-center text-center px-6 py-16">
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
      <div className="mt-6 flex flex-col items-center gap-4 w-full">
        {isExp && (
          <Link
            href="/producer/dashboard/experiences/new"
            className="w-full max-w-[260px] inline-flex items-center justify-center gap-2 bg-primary text-white text-sm font-semibold px-5 py-3 rounded-sm"
          >
            <Plus size={18} weight="bold" />
            {t("empty_experiences_cta")}
          </Link>
        )}
        <Link
          href="/producers"
          data-testid="events-browse-producers"
          className="min-h-touch inline-flex items-center text-sm font-semibold text-primary underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current"
        >
          {t("empty_browse_producers")}
        </Link>
      </div>
      <span aria-hidden="true" className="mt-6 w-9 h-0.5 bg-accent/50 rounded-full" />
    </div>
  );
}

// LOAD FAILED (MEH-2396) — the request timed out or errored. Same shape as
// NoResults (fact + one action), because the reader's situation is the same:
// the chrome is still there, one click puts the page back on track. The
// filter controls stay for the same reason they stay on filtered-to-zero.
// Strings are the shared `error.*` pair — no copy of its own.
function LoadError({ tErr, onRetry }) {
  return (
    <div data-testid="events-load-error" role="alert" className="flex flex-col items-center text-center px-6 py-16">
      <h2 className="font-headline-md text-2xl font-bold text-text max-w-[22ch] leading-snug">
        {tErr("generic")}
      </h2>
      <Button
        type="button"
        onClick={onRetry}
        data-testid="events-retry"
        variant="primary" size="sm" className="mt-6"
      >
        <ArrowCounterClockwise size={18} />
        {tErr("retry")}
      </Button>
    </div>
  );
}

// FILTERED TO ZERO (MEH-1865) — rows exist for this tab, the active filters
// matched none of them. Deliberately NOT the editorial empty state above: the
// filter controls stay on screen alongside this, so all it owes the reader is
// the fact and the undo. Same tab, same chrome, one click back to results.
function NoResults({ t, onReset }) {
  return (
    <div data-testid="events-no-results" className="flex flex-col items-center text-center px-6 py-16">
      <h2 className="font-headline-md text-2xl font-bold text-text max-w-[22ch] leading-snug">
        {t("no_results_title")}
      </h2>
      <Button
        type="button"
        onClick={onReset}
        data-testid="events-clear-filters"
        variant="primary" size="sm" className="mt-6"
      >
        <ArrowCounterClockwise size={18} />
        {t("no_results_cta")}
      </Button>
    </div>
  );
}

// Loading skeleton — mirrors the rail geometry so the layout doesn't jump
// on hydrate. Cream-toned (opacity-on-cream per ADR-019), not gray blocks.
function SkeletonRows({ srLabel }) {
  return (
    // MEH-1957: role="status" is what makes aria-label permitted here. Without
    // a role this is a generic div, and aria-label on one is `aria-prohibited-attr`
    // (serious) — only reachable while the skeleton is on screen, so warm loads
    // never showed it. Mirrors app/[locale]/loading.js:8-12.
    <div role="status" aria-busy="true" aria-label={srLabel}>
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
