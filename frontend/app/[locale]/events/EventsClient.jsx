"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import HubShell from "@/components/HubShell";
import Button from "@/components/ui/Button";
import SectionHeading from "@/components/ui/SectionHeading";
import { SkeletonBlock } from "@/components/Skeleton";

// MEH-134: S10 "The Almanac" visual port. Events API + filter logic +
// date formatting (lib/format-date.js) untouched — layout layer only.
// EventCard rewritten as the date-rail EventEntryRow (components/) (the page's signature
// gesture); experiences render through the SAME EventEntryRow (gold accent),
// so the old experience card is no longer imported here (the route-as-tab
// merge deleted its last route consumer, the old /experiences client, and
// MEH-2248 deleted the component itself). MEH-2771: the calendar view
// lists its month through the same EventEntryRow (renderItem).

// MEH-3013: the MEH-788 hero (photo + scrim) moved to components/HubShell.jsx.

// MEH-869: category sets moved to the shared lib/event-categories.js
// (were duplicated across 5 call-sites). withAll() prepends the "all" chip.
const CATEGORY_KEYS = withAll(EVENT_CATEGORIES);

const EXPERIENCE_CATEGORY_KEYS = withAll(EXPERIENCE_CATEGORIES);

// MEH-2847: clearing an already-empty selection keeps the SAME array, so it
// is not a state change and does not refetch — as setCategory("") on "" was.
const clearCategories = (prev) => (prev.length ? [] : prev);

// MEH-2980: which hub tab a pathname names — null for anything else (tests
// render on "/"). Works with or without the /en prefix.
const tabFromPath = (path) =>
  /\/experiences\/?$/.test(path || "") ? "experiences" : /\/events\/?$/.test(path || "") ? "events" : null;

// MEH-2847 / MEH-2980: the URL's ?category= values that belong to `tab`'s
// vocabulary (one bad value is dropped without dropping the good ones).
const categoriesFor = (tab, values) => {
  const vocab = tab === "experiences" ? EXPERIENCE_CATEGORIES : EVENT_CATEGORIES;
  const known = new Set(vocab.map((c) => c.key));
  return [...new Set(values)].filter((k) => known.has(k));
};

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
  // MEH-2980: the PATH wins over the prop. After an in-place switch, Next
  // keeps the first route's tree in that history entry, so a Back from some
  // other page can restore /events with the /experiences page mounted.
  const [tab, setTab] = useState(() => tabFromPath(pathname) || initialTab);
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
  // MEH-2984: read from window.location in a mount effect, NOT useSearchParams.
  // useSearchParams forced a <Suspense> in both pages and, to keep the H1 in
  // the server HTML, `force-dynamic` (MEH-2878) — and a force-dynamic route
  // cannot be prefetched, so arriving from /group-buys or /rescue streamed the
  // whole-page loader. Without it both pages are ISR like /group-buys.
  // `urlReady` holds the first fetch (and the URL writer) until the filters
  // are read, so a deep link still costs exactly one request.
  const [city, setCity] = useState("");
  const [categories, setCategories] = useState([]);
  const [urlReady, setUrlReady] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setCity(p.get("city") || "");
    setCategories(categoriesFor(tabFromPath(window.location.pathname) || tab, p.getAll("category")));
    setUrlReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // The old remount reset the view; keep that (MEH-2980 AC: states unchanged).
    setView("list");
  };

  const switchTab = (next) => {
    if (next === tab) return;
    applyTab(next);
    const current = window.location.pathname;
    const path = /\/(events|experiences)\/?$/.test(current)
      ? current.replace(/\/(events|experiences)\/?$/, `/${next}`)
      : `/${next}`;
    window.history.pushState(null, "", path);
    if (titles?.[next]) document.title = titles[next];
  };

  // MEH-2980: Back / Forward across an in-place switch. The pathname moves
  // without this component remounting, so the tab follows it here.
  // - Read window.location, not the hook value: usePathname lags our own
  //   pushState (Next applies it in a transition), so on a quick A→B→A the
  //   hook can still say B while the URL already says A.
  // - On a history move the URL is the truth for the filters too: the entry
  //   may carry ?city= / ?category= that the reset never saw (Back to
  //   /events?city=X must filter by X, not show the city in the bar only).
  useEffect(() => {
    const urlTab = tabFromPath(window.location.pathname);
    if (urlTab && titles?.[urlTab]) document.title = titles[urlTab];
    if (!urlTab || urlTab === tab) return;
    const p = new URLSearchParams(window.location.search);
    setTab(urlTab);
    setView("list");
    setCity(p.get("city") || "");
    setCategories(categoriesFor(urlTab, p.getAll("category")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // MEH-1085 (DISC-08): single URL writer — the query string always mirrors
  // {city, category}, so filters survive refresh/share and the switchTab
  // reset clears them from the URL too — a cross-tab category is never
  // resurrected. Shallow history.replaceState, NOT router.replace: a Next
  // navigation from here would remount the page and reset client state — the
  // E2E calendar toggle caught exactly that. replaceState keeps it a pure URL
  // mirror (and preserves the locale-prefixed pathname on /en).
  // MEH-2245: `tab` is no longer written — the route carries it.
  // MEH-2984: not before the mount effect has read the URL — the first commit
  // still holds empty filters and would wipe a deep link's query.
  useEffect(() => {
    if (!urlReady) return;
    const p = new URLSearchParams();
    if (city) p.set("city", city);
    // MEH-2847: one ?category= per selected key — the /producers format.
    for (const c of categories) p.append("category", c);
    const qs = p.toString();
    const current = window.location.search.replace(/^\?/, "");
    if (qs === current) return;
    const path = window.location.pathname;
    window.history.replaceState(null, "", qs ? `${path}?${qs}` : path);
  }, [urlReady, city, categories]);

  useEffect(() => {
    if (!urlReady) return; // MEH-2984: one request, with the URL's filters
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlReady, tab, city, categories]);

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

      {/* MEH-3013: hero + tab row come from the shared HubShell, so all four
          hub tabs keep one frame (components/HubShell.jsx). */}
      {/* MEH-2859: the row is now the shared four-tab hub row (events ·
          experiences · group buys · surprise baskets) in
          components/ListingHubTabs.jsx, so /group-buys and /rescue render the
          same one instead of a second copy. `onSelect` keeps this page's
          same-tick local switch for its own two tabs (MEH-2245); the other two
          are plain route changes. The add link moves in as `action`. */}
      <HubShell
        active={isExp ? "experiences" : "events"}
        eyebrow={isExp ? t("eyebrow_experiences") : t("eyebrow_events")}
        title={isExp ? t("h1_experiences") : t("title")}
        subtitle={isExp ? t("subtitle_experiences") : t("subtitle")}
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
                  <SectionHeading size="content" className="leading-none">
                    {group.monthLabel}
                  </SectionHeading>
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
        <Icon size={32} />
      </div>
      {/* MEH-858 F4: empty-state title is h2 (was h4) — only heading under the
          page h1 when the feed is empty, so h1 → h2 with no skip. */}
      <SectionHeading size="content" className="mt-5 max-w-[22ch] leading-snug">
        {isExp ? t("empty_experiences_title") : t("empty_events_title")}
      </SectionHeading>
      <p className="text-sm text-fg-muted mt-2.5 max-w-[30ch] leading-relaxed">
        {isExp ? t("empty_experiences_body") : t("empty_events_body")}
      </p>
      <div className="mt-6 flex flex-col items-center gap-4 w-full">
        {isExp && (
          <Link
            href="/producer/dashboard/experiences/new"
            className="w-full max-w-[260px] inline-flex items-center justify-center gap-2 bg-primary text-white text-sm font-semibold px-5 py-3 rounded-full"
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
      <SectionHeading size="content" className="max-w-[22ch] leading-snug">
        {tErr("generic")}
      </SectionHeading>
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
      <SectionHeading size="content" className="max-w-[22ch] leading-snug">
        {t("no_results_title")}
      </SectionHeading>
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
            <SkeletonBlock className="w-8 h-8 rounded" />
            <SkeletonBlock className="w-7 h-2.5 rounded" />
          </div>
          <div className="py-5 ps-3 pe-4 grid gap-2.5">
            <SkeletonBlock className="w-12 h-2.5 rounded" />
            <SkeletonBlock className="w-3/4 h-4 rounded" />
            <SkeletonBlock className="w-1/2 h-3 rounded" />
            <SkeletonBlock className="w-24 h-5 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
