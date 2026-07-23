"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { MagnifyingGlass, MapPin, Plant, Leaf, CaretDown } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import Breadcrumb from "@/components/Breadcrumb";
import ProducerCard from "@/components/ProducerCard";
import ChipScrollRow from "@/components/ChipScrollRow";
import { CATEGORY_ICONS, CATEGORY_STYLES } from "@/lib/category-registry";
import LocationModal from "@/components/LocationModal";
import BackToTop from "@/components/BackToTop";
import { SkeletonProducerGrid } from "@/components/Skeleton";
import { buildChipParams, CHIPS_CONFIG, CHIPS_DEFAULT } from "@/lib/producer-filters";
import { withChipIcons } from "@/lib/chip-icons";
import { useUserCity } from "@/lib/use-user-city";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { CategoriesResponseSchema } from "@/lib/api-schemas";

const FILTER_LIMIT = 100;
const PAGE_SIZE = 24; // matches PER_PAGE in page.jsx

// MEH-1483: the backend-driven sort axis (?sort=). "newest" is the default —
// omitted from the request so the default listing stays byte-identical to
// today's created_at-DESC order; "rating" maps to the backend's avg_rating
// nulls-last ordering. Two options only (over-engineering guard).
const SORT_DEFAULT = "newest";
const SORT_VALUES = ["newest", "rating"];
function initSortFromParams(searchParams) {
  const s = searchParams.get("sort");
  return SORT_VALUES.includes(s) ? s : SORT_DEFAULT; // unknown → default
}

// Display axis = i18n key for the translated label.
// Data axis = `q` value sent to /producers — must stay Hebrew because the
// backend search matches against Hebrew producer name/description columns.
// Translating `q` per locale would zero-match on /en/.
const EMPTY_CATEGORY_CHIPS = [
  { key: "beef", q: "בשר" },
  { key: "cheese", q: "גבינה" },
  { key: "bread", q: "לחם" },
  { key: "vegetables", q: "ירקות" },
  { key: "oil", q: "שמן" },
  { key: "honey", q: "דבש" },
];

function initChipsFromParams(searchParams) {
  const result = { ...CHIPS_DEFAULT };
  for (const chip of CHIPS_CONFIG) {
    if (searchParams.get(chip.key) === "1") result[chip.key] = true;
  }
  return result;
}

export default function ProducersClient({
  initialItems,
  initialTotal,
  initialPage,
  totalPages,
  perPage,
}) {
  const t = useTranslations("producers");
  const searchParams = useSearchParams();

  // MEH-990: city chip is text-only like the rest of CHIPS_CONFIG (Emoji LOCK,
  // MEH-657) — dropped the 📍 icon string that ChipScrollRow rendered raw.
  const cityChipDef = { key: "city", label: t("filters.city_chip") };

  const [chips, setChips] = useState(() => initChipsFromParams(searchParams));
  const [cityFilter, setCityFilter] = useState(() => searchParams.get("city") || null);
  const [filteredItems, setFilteredItems] = useState(null);
  // MEH-1483: sort axis. `sortOrderRef` mirrors it so the stable-identity
  // callbacks (syncUrl / fetchFiltered / loadNextPage, all useCallback([])) can
  // read the current value without being recreated on every sort change; the
  // ref is set synchronously in handleSortChange (before any callback fires).
  const [sortOrder, setSortOrder] = useState(() => initSortFromParams(searchParams));
  const sortOrderRef = useRef(sortOrder);
  useEffect(() => { sortOrderRef.current = sortOrder; }, [sortOrder]);
  // Unfiltered-mode base list: the SSR page by default; replaced with a freshly
  // fetched sorted page 1 when a non-default sort is active (the [sortOrder]
  // effect below). Infinite-scroll pages accumulate in appendItems on top.
  const [baseItems, setBaseItems] = useState(initialItems);
  const [loading, setLoading] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const { setCity: setUserCity } = useUserCity();
  const mountFetched = useRef(false);

  // Infinite scroll state (unfiltered mode only)
  const [appendItems, setAppendItems] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialPage < totalPages);
  const [nextPage, setNextPage] = useState(initialPage + 1);

  // MEH-159: live total so the counter stays accurate after admin deletes.
  const [liveTotal, setLiveTotal] = useState(initialTotal);
  const sentinelRef = useRef(null);

  const [searchQ, setSearchQ] = useState(() => searchParams.get("q") || "");

  // MEH-1081 (MEH-1077 DISC-04): canonical category axis — chip row backed by
  // ?category=<id>. MEH-1465: multi-select — categoryFilter is now an ARRAY of
  // selected category-id strings, serialized as repeated ?category=<id> (the
  // backend + api paramsSerializer `{ indexes: null }` OR over the list). A
  // legacy single ?category=X deep-link hydrates identically (getAll → ["X"]).
  const [categoryFilter, setCategoryFilter] = useState(
    () => searchParams.getAll("category"),
  );
  const [categories, setCategories] = useState([]);

  // MEH-820: free-text search box driving the existing q filter.
  const [searchInput, setSearchInput] = useState(() => searchQ);
  const searchInputRef = useRef(null);
  const shouldFocus = searchParams.get("focus") === "1";

  // ?focus=1 → focus the input on mount (mirrors SearchClient.jsx:59-63).
  useEffect(() => {
    if (shouldFocus) searchInputRef.current?.focus();
  }, [shouldFocus]);

  // Keep the box in sync when q is cleared elsewhere (🔍 chip ×, clear all).
  useEffect(() => {
    setSearchInput(searchQ);
  }, [searchQ]);

  const hasActiveChips =
    Object.values(chips).some(Boolean) || !!cityFilter || !!searchQ || categoryFilter.length > 0;
  const displayItems = hasActiveChips
    ? (filteredItems ?? [])
    : [...baseItems, ...appendItems];
  const activeChipDefs = CHIPS_CONFIG.filter((c) => chips[c.key]);

  const syncUrl = useCallback(
    // MEH-1081: category rides the same URL sync as chips/city/q.
    // MEH-1084 (MEH-1077 DISC-06): `method` picks the history verb — "push"
    // for a category *selection* (perceived as a new view → Back cancels the
    // category and returns to the prior view), "replace" (default) for chip /
    // city / search refinement and category *clear* (transient — a push there
    // would force a double-Back to escape). The param set written is identical
    // for both verbs, so the MEH-1081/1083 serializer is untouched.
    (chipState, city, q, category, method = "replace") => {
      const params = new URLSearchParams();
      // MEH-1465: category is an array → repeated ?category=<id> (OR union),
      // matching the api paramsSerializer. The `?? []` guards the legacy
      // call-sites (city-× / search-×) that omit the arg (→ no category params).
      for (const id of category ?? []) params.append("category", id);
      for (const chip of CHIPS_CONFIG) {
        if (chipState[chip.key]) params.set(chip.key, "1");
      }
      if (city) params.set("city", city);
      if (q) params.set("q", q);
      // MEH-1483: mirror the active sort to ?sort= (omitted at the default so
      // the plain /producers URL is unchanged). Read from the ref so this
      // callback stays referentially stable.
      if (sortOrderRef.current !== SORT_DEFAULT) params.set("sort", sortOrderRef.current);
      const qs = params.toString();
      // MEH-1294: mirror to the URL via the shallow History API, NOT router.push/
      // replace. A Next navigation here is an RSC round-trip (Phase 0: 2 route
      // ?_rsc per filter action) that also re-suspends the page.jsx Suspense
      // boundary (the MEH-1085 DISC-08 state-reset class). Same-URL guard first;
      // window.location.pathname keeps the locale prefix on /en (the old
      // hardcoded "/producers" dropped it). MEH-1084 push/replace semantics are
      // preserved verbatim: pushState for a category selection (Back cancels it),
      // replaceState for chip/city/search refinement and category clear.
      // REUSES: frontend/app/[locale]/events/EventsClient.jsx:159-170.
      if (typeof window === "undefined") return;
      const current = window.location.search.replace(/^\?/, "");
      if (qs === current) return;
      const path = window.location.pathname;
      const url = qs ? `${path}?${qs}` : path;
      if (method === "push") window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    },
    [],
  );

  const fetchFiltered = useCallback((chipState, city, q, category) => {
    const params = buildChipParams(chipState);
    if (city) params.delivery_city = city;
    if (q) params.q = q;
    // MEH-1465: pass the whole array — api serializes it as repeated ?category=.
    if (category?.length) params.category = category;
    if (Object.keys(params).length === 0) {
      setFilteredItems(null);
      return;
    }
    // MEH-1483: sort added AFTER the no-filters check so a bare sort never
    // keeps the page in filtered mode — clearing the last filter still returns
    // to the unfiltered (infinite-scroll) list, whose sort the effect drives.
    if (sortOrderRef.current !== SORT_DEFAULT) params.sort = sortOrderRef.current;
    setLoading(true);
    api
      .get("/producers", { params: { ...params, limit: FILTER_LIMIT, offset: 0 } })
      .then((r) => {
        const items = Array.isArray(r.data) ? r.data : [];
        setFilteredItems(items);
        trackEvent("producers_filter_results", { count: items.length });
      })
      .catch(() => setFilteredItems([]))
      .finally(() => setLoading(false));
  }, []);

  const loadNextPage = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    api
      .get("/producers", {
        params: {
          limit: PAGE_SIZE,
          offset: (nextPage - 1) * PAGE_SIZE,
          // MEH-1483: carry the active sort into every infinite-scroll page so
          // the order holds across pages (omitted at the default).
          ...(sortOrderRef.current !== SORT_DEFAULT && { sort: sortOrderRef.current }),
        },
      })
      .then((r) => {
        const items = Array.isArray(r.data) ? r.data : [];
        setAppendItems((prev) => [...prev, ...items]);
        // MEH-159: sync total from fresh header on every page load.
        const freshTotal = Number(r.headers["x-total-count"]);
        if (!Number.isNaN(freshTotal) && freshTotal >= 0) setLiveTotal(freshTotal);
        if (items.length < PAGE_SIZE) setHasMore(false);
        else setNextPage((p) => p + 1);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false));
  }, [loadingMore, hasMore, nextPage]);

  // IntersectionObserver — fires when the sentinel enters the viewport.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || hasActiveChips) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadNextPage(); },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, hasActiveChips, loadNextPage]);

  // Fetch on mount if URL already has active chips/search (shared link / back-nav).
  useEffect(() => {
    if (mountFetched.current) return;
    mountFetched.current = true;
    const anyActive =
      Object.values(chips).some(Boolean) || !!cityFilter || !!searchQ || categoryFilter.length > 0;
    if (anyActive) fetchFiltered(chips, cityFilter, searchQ, categoryFilter);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // MEH-1483: keep the unfiltered base list in sync with the sort axis. Keyed on
  // sortOrder ONLY (not on the filters) so toggling a filter never resets the
  // infinite-scroll position — this fires on mount (only for a non-default
  // deep-link) and on every real sort change. It refetches page 1 even while
  // filters are active, so the base is already correct the moment the last
  // filter is cleared. `prevSortRef` skips the default-sort mount no-op so the
  // first paint stays byte-identical to the SSR order.
  const prevSortRef = useRef(sortOrder);
  useEffect(() => {
    const changed = prevSortRef.current !== sortOrder;
    prevSortRef.current = sortOrder;
    if (!changed && sortOrder === SORT_DEFAULT) return; // mount, default → no-op
    setAppendItems([]);
    if (sortOrder === SORT_DEFAULT) {
      // Revert to the exact SSR order + pagination.
      setBaseItems(initialItems);
      setNextPage(initialPage + 1);
      setHasMore(initialPage < totalPages);
      return;
    }
    // No global `loading` flip here — keep the current grid + the sort select
    // visible and swap baseItems in when the sorted page 1 arrives (avoids a
    // skeleton flash + hiding the control the user just used).
    let cancelled = false;
    api
      .get("/producers", { params: { sort: sortOrder, limit: PAGE_SIZE, offset: 0 } })
      .then((r) => {
        if (cancelled) return;
        const items = Array.isArray(r.data) ? r.data : [];
        setBaseItems(items);
        const freshTotal = Number(r.headers["x-total-count"]);
        if (!Number.isNaN(freshTotal) && freshTotal >= 0) setLiveTotal(freshTotal);
        setHasMore(items.length === PAGE_SIZE);
        setNextPage(2);
      })
      .catch(() => {
        if (!cancelled) { setBaseItems([]); setHasMore(false); }
      });
    return () => { cancelled = true; };
  }, [sortOrder, initialItems, initialPage, totalPages]);

  // MEH-1081: load the DB categories for the radio row. Rule-19: shape
  // validated; on parse/network failure the row self-hides (categories=[]).
  useEffect(() => {
    api
      .get("/categories")
      .then((r) => {
        const parsed = CategoriesResponseSchema.safeParse(r.data);
        setCategories(parsed.success ? parsed.data : []);
      })
      .catch(() => {});
  }, []);

  // MEH-159: revalidate total on tab focus so the counter stays fresh if
  // producers were deleted while the user had the tab in the background.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      api.get("/producers/count").then((r) => {
        const n = Number(r.data?.count);
        if (!Number.isNaN(n) && n >= 0) setLiveTotal(n);
      }).catch(() => {});
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  const toggleChip = (key) => {
    const next = { ...chips, [key]: !chips[key] };
    setChips(next);
    syncUrl(next, cityFilter, searchQ, categoryFilter);
    fetchFiltered(next, cityFilter, searchQ, categoryFilter);
    trackEvent("producers_chip_toggle", { chip: key, active: !chips[key] });
  };

  // MEH-1465: multi-select OR. "הכל" ("all") is ChipScrollRow's reset sentinel →
  // clears the whole set; re-tapping a selected category removes it; any other
  // category is added to the union.
  const handleCategorySelect = (key) => {
    let next;
    if (key === "all") next = [];
    else if (categoryFilter.includes(key)) next = categoryFilter.filter((k) => k !== key);
    else next = [...categoryFilter, key];
    setCategoryFilter(next);
    // MEH-1084: ADDING a category is a new view → push (Back removes it);
    // removing one or clearing to baseline is refinement → replace (a push there
    // would need a double-Back to escape).
    const method = next.length > categoryFilter.length ? "push" : "replace";
    syncUrl(chips, cityFilter, searchQ, next, method);
    fetchFiltered(chips, cityFilter, searchQ, next);
    trackEvent("producers_category_filter", { category: next });
  };

  // MEH-1483: sort select. Set the ref synchronously (before syncUrl/fetch read
  // it), flip state (fires the [sortOrder] effect → re-establishes the
  // unfiltered base), and refetch the filtered list in place when filters are
  // active so the visible results re-order immediately.
  const handleSortChange = (e) => {
    const next = SORT_VALUES.includes(e.target.value) ? e.target.value : SORT_DEFAULT;
    if (next === sortOrder) return;
    sortOrderRef.current = next;
    setSortOrder(next);
    syncUrl(chips, cityFilter, searchQ, categoryFilter);
    if (hasActiveChips) fetchFiltered(chips, cityFilter, searchQ, categoryFilter);
    trackEvent("producers_sort_change", { sort: next });
  };

  const handleChipClick = (key) => {
    if (key === "city") {
      if (cityFilter) {
        setCityFilter(null);
        syncUrl(chips, null, searchQ, categoryFilter);
        fetchFiltered(chips, null, searchQ, categoryFilter);
      } else {
        setLocationModalOpen(true);
      }
    } else {
      toggleChip(key);
    }
  };

  const handleCitySelected = (city) => {
    setLocationModalOpen(false);
    setCityFilter(city);
    setUserCity(city);
    syncUrl(chips, city, searchQ, categoryFilter);
    fetchFiltered(chips, city, searchQ, categoryFilter);
    trackEvent("producers_city_filter", { city });
  };

  // MEH-820: submit/Enter → reuse the existing q machinery (no new fetch logic).
  // Empty term flows through the same clear-q path as the 🔍 chip ×.
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const term = searchInput.trim();
    setSearchQ(term);
    syncUrl(chips, cityFilter, term, categoryFilter);
    fetchFiltered(chips, cityFilter, term, categoryFilter);
  };

  const clearAll = () => {
    setChips(CHIPS_DEFAULT);
    setCityFilter(null);
    setSearchQ("");
    setCategoryFilter([]);
    setFilteredItems(null);
    syncUrl(CHIPS_DEFAULT, null, "", []);
    trackEvent("producers_clear_all");
  };

  const cityChip = cityFilter ? { ...cityChipDef, label: cityFilter } : cityChipDef;
  // MEH-1418: Phosphor leading icons on the attribute chips; the city chip has
  // no icon entry, so it passes through text-only (byte-identical).
  const allChips = withChipIcons([...CHIPS_CONFIG, cityChip]);
  const activeKeys = { ...chips, city: !!cityFilter };
  // MEH-1088 Part A: hide dead-end category chips — a category with 0 approved
  // producers is not rendered (fewer chips > disabled chips at this catalog
  // size). Counted client-side from the UNFILTERED loaded catalog (each
  // ProducerListOut carries `categories`), so no new endpoint. Only hidden once
  // the whole catalog is loaded (`!hasMore`); while more pages are unfetched a
  // category whose producers sit on a later page must NOT be hidden, so nothing
  // is filtered until then. "הכל" always shows; a category active via the URL
  // stays visible even at 0 so its active-tag + clear flow keep working.
  const loadedCategoryIds = new Set();
  // MEH-1483: derive from the same source as displayItems (baseItems is the SSR
  // page, or the sorted page 1 when a non-default sort is active) so the
  // MEH-1088 dead-end-category hiding stays consistent with what's rendered.
  for (const p of [...baseItems, ...appendItems]) {
    for (const c of p?.categories ?? []) loadedCategoryIds.add(String(c.id));
  }
  const catalogFullyLoaded = !hasMore;
  const visibleCategories = categories.filter(
    (c) =>
      !catalogFullyLoaded ||
      loadedCategoryIds.has(String(c.id)) ||
      categoryFilter.includes(String(c.id)),
  );
  // MEH-1081: radio row data — "all" sentinel first, then the DB categories.
  // MEH-1441: each DB category gets a 16px leading glyph from CATEGORY_ICONS
  // (keyed by the canonical name = c.name). ChipScrollRow wraps chip.icon in an
  // aria-hidden span. The "all" reset chip stays iconless; an unknown admin
  // category (no CATEGORY_ICONS row) gets no icon — never a Leaf fallback.
  // Category-tint: the INACTIVE chip's glyph is tinted with the category colour
  // (CATEGORY_STYLES[c.name].textColor ?? .color — textColor is the WCAG-safe
  // variant where the pin colour fails 3:1 on white). A category with no
  // CATEGORY_STYLES entry stays currentColor (deliberate — MEH-763 palette lock
  // forbids inventing new category colours). The active chip ignores iconColor
  // (ChipScrollRow) so its glyph stays white.
  const categoryChips = [
    { key: "all", label: t("filters.category_all") },
    ...visibleCategories.map((c) => {
      const Glyph = CATEGORY_ICONS[c.name];
      const style = CATEGORY_STYLES[c.name];
      const iconColor = style ? (style.textColor ?? style.color) : undefined;
      return {
        key: String(c.id),
        label: c.name,
        ...(Glyph ? { icon: <Glyph size={16} />, ...(iconColor ? { iconColor } : {}) } : {}),
      };
    }),
  ];
  const showFilterEmpty =
    hasActiveChips && !loading && filteredItems !== null && filteredItems.length === 0;
  const showPageOverflow =
    !hasActiveChips && baseItems.length === 0 && liveTotal > 0;
  const showCatalogEmpty = !hasActiveChips && liveTotal === 0;
  const showGrid = !loading && !showFilterEmpty && !showPageOverflow && !showCatalogEmpty;

  const counterText = (() => {
    if (!showGrid) return null;
    if (hasActiveChips) return t("discovery.found_count", { count: filteredItems?.length ?? 0 });
    // MEH-1483: baseItems (SSR page, or sorted page 1 when a non-default sort
    // is active) is the effective unfiltered base — matches displayItems. In
    // the default flow baseItems === initialItems (byte-identical).
    const loaded = baseItems.length + appendItems.length;
    // MEH-159: use liveTotal (refreshed on scroll + tab focus) so the counter
    // stays correct after admin deletes producers mid-session.
    return loaded >= liveTotal
      ? t("discovery.all_count", { count: liveTotal })
      : t("discovery.showing_count", { loaded, total: liveTotal });
  })();

  return (
    <>
      <Breadcrumb
        items={[
          { href: "/", label: t("breadcrumb.home") },
          searchQ
            ? { href: "/producers", label: t("breadcrumb.all") }
            : { label: t("breadcrumb.all") },
          ...(searchQ ? [{ label: t("breadcrumb.search", { q: searchQ }) }] : []),
        ]}
        className="mb-4"
      />
      <h1 className="font-headline-lg text-3xl font-bold text-text mb-6">
        {searchQ ? (
          <>
            {t("title.search_results")}{" "}
            <span className="text-primary">&ldquo;{searchQ}&rdquo;</span>
          </>
        ) : (
          t("title.all")
        )}
      </h1>

      {/* MEH-820: free-text search — drives the existing ?q= filter */}
      <form
        role="search"
        onSubmit={handleSearchSubmit}
        className="flex items-center gap-2 mb-3"
      >
        <label htmlFor="producers-search-input" className="sr-only">
          {t("search_input.label")}
        </label>
        <div className="flex-1 flex items-center gap-2 border border-border rounded-full px-4 min-h-[44px] bg-white focus-within:ring-2 focus-within:ring-primary/40">
          <MagnifyingGlass size={18} weight="regular" aria-hidden="true" className="text-fg-muted" />
          <input
            id="producers-search-input"
            ref={searchInputRef}
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("search_input.placeholder")}
            className="flex-1 bg-transparent outline-none text-text placeholder:text-fg-muted text-sm"
          />
        </div>
        <button
          type="submit"
          className="bg-primary text-white px-4 min-h-[44px] rounded-full text-sm font-medium hover:bg-primary-dark transition"
        >
          {t("search_input.submit")}
        </button>
      </form>

      {/* MEH-1081: category radio row — the canonical ?category=<id> axis.
          Self-hides while /categories hasn't resolved (or failed).
          MEH-1186: micro-label above the row names the behavior (category
          selection) vs the toggle row below (attribute filtering). */}
      {categories.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-fg-muted ms-1 mb-1">{t("filters.category_label")}</p>
          <ChipScrollRow
            variant="category"
            chips={categoryChips}
            activeKeys={new Set(categoryFilter)}
            onChipClick={handleCategorySelect}
            fadeBg="#F5F0E8"
          />
        </div>
      )}

      {/* Toggle/attribute chip row — MEH-1186 micro-label "סינון". */}
      <div className="mb-3">
        <p className="text-xs text-fg-muted ms-1 mb-1">{t("filters.filter_label")}</p>
        <ChipScrollRow
          variant="toggle"
          chips={allChips}
          activeKeys={activeKeys}
          onChipClick={handleChipClick}
          fadeBg="#F5F0E8"
        />
      </div>

      {/* Results counter + active filters — MEH-1186: one control line.
          The removable chips (category ×, toggle ×, city ×, search ×) and
          "נקו הכל" sit beside the counter, replacing the full-bleed green
          filter strip. In the zero-result state counterText is null but the
          chips still render so the user can escape the empty state. */}
      {(counterText || hasActiveChips) && (
        <div className="flex flex-wrap items-center gap-2 mb-4 text-sm" aria-live="polite">
          {counterText && <span className="text-fg-muted">{counterText}</span>}
          {counterText && hasActiveChips && (
            <span aria-hidden="true" className="text-border">·</span>
          )}
          {/* MEH-1465 / MEH-1181-A tag-strip rule: a category SELECTION is never
              mirrored as a removable tag on /producers — its exit affordance is
              the "הכל" chip or re-tapping the coloured category chip. Only
              attribute/city/search chips remain removable here; "נקו הכל" still
              clears both dimensions. */}
          {activeChipDefs.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => toggleChip(chip.key)}
              className="inline-flex items-center gap-1 bg-white text-primary border border-primary rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0"
            >
              <span aria-hidden="true" className="text-[10px] font-bold">×</span>
              {chip.label}
            </button>
          ))}
          {cityFilter && (
            <button
              type="button"
              onClick={() => {
                // MEH-1470: thread categoryFilter through so removing the city
                // chip doesn't silently drop the active category selection.
                setCityFilter(null);
                syncUrl(chips, null, searchQ, categoryFilter);
                fetchFiltered(chips, null, searchQ, categoryFilter);
              }}
              className="inline-flex items-center gap-1 bg-white text-primary border border-primary rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0"
            >
              <span aria-hidden="true" className="text-[10px] font-bold">×</span>
              <MapPin size={13} weight="fill" aria-hidden="true" />{cityFilter}
            </button>
          )}
          {searchQ && (
            <button
              type="button"
              data-testid="active-search-chip"
              onClick={() => {
                // MEH-1470: thread categoryFilter through so removing the search
                // chip doesn't silently drop the active category selection.
                setSearchQ("");
                syncUrl(chips, cityFilter, "", categoryFilter);
                fetchFiltered(chips, cityFilter, "", categoryFilter);
              }}
              className="inline-flex items-center gap-1 bg-white text-primary border border-primary rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0"
            >
              <span aria-hidden="true" className="text-[10px] font-bold">×</span>
              <MagnifyingGlass size={13} weight="bold" aria-hidden="true" />{searchQ}
            </button>
          )}
          {hasActiveChips && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-primary underline whitespace-nowrap shrink-0 ms-1"
            >
              {t("filters.clear_all")}
            </button>
          )}
          {/* MEH-1483: backend-driven sort — pushed to the inline-end. Changing
              it re-syncs ?sort=, resets pagination, and refetches (both the
              filtered fetch and infinite-scroll pages). Mirrors the /map sort
              control shape (MapClient.jsx). */}
          <div className="relative inline-flex items-center shrink-0 ms-auto">
            <span className="text-fg-muted" aria-hidden="true">{t("sort.label")}</span>
            <select
              value={sortOrder}
              onChange={handleSortChange}
              aria-label={t("sort.aria_label")}
              data-testid="producers-sort"
              className="appearance-none bg-transparent border-0 font-medium text-primary min-h-[44px] ps-1 pe-6 cursor-pointer rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
            >
              <option value="newest">{t("sort.newest")}</option>
              <option value="rating">{t("sort.top_rated")}</option>
            </select>
            <CaretDown
              size={14}
              weight="bold"
              aria-hidden="true"
              className="pointer-events-none absolute end-1 text-primary"
            />
          </div>
        </div>
      )}

      {/* Content area */}
      {loading ? (
        <SkeletonProducerGrid count={8} />
      ) : showFilterEmpty ? (
        <FilterEmptyState onClear={clearAll} searchQ={searchQ} />
      ) : showPageOverflow ? (
        <PageOverflowState />
      ) : showCatalogEmpty ? (
        <CatalogEmptyState />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-3 xl:grid-cols-4">
            {displayItems.map((p) => (
              <ProducerCard
                key={p.id}
                producer={p}
                referrer="producers-index"
                highlightQuery={searchQ || undefined}
              />
            ))}
          </div>

          {/* Infinite scroll — unfiltered mode only */}
          {!hasActiveChips && (
            <>
              {/* Sentinel: observer triggers loadNextPage when this enters viewport */}
              <div ref={sentinelRef} className="h-px" aria-hidden="true" />
              {loadingMore && (
                <div className="flex justify-center py-8">
                  <div
                    className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"
                    role="status"
                    aria-label={t("discovery.loading_more_aria")}
                  />
                </div>
              )}
              {!hasMore && appendItems.length > 0 && (
                <p className="text-center text-fg-muted text-sm py-8">
                  {t("discovery.all_shown", { count: liveTotal })}
                </p>
              )}
              {/* SEO fallback — shown when JS pagination is still the only option
                  (e.g. user landed directly on page N via URL) */}
              {!hasMore && appendItems.length === 0 && totalPages > 1 && (
                <ServerPageLinks page={initialPage} totalPages={totalPages} />
              )}
            </>
          )}
        </>
      )}

      <LocationModal
        open={locationModalOpen}
        onClose={() => setLocationModalOpen(false)}
        onSelectCity={handleCitySelected}
      />

      {/* MEH-1309: floating back-to-top for the paginated catalog scroll. */}
      <BackToTop />
    </>
  );
}

function FilterEmptyState({ onClear, searchQ }) {
  const t = useTranslations("producers");
  return (
    <div className="text-center py-16">
      <div
        className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50 mb-4"
        aria-hidden="true"
      >
        {searchQ
          ? <MagnifyingGlass size={28} weight="bold" className="text-primary" aria-hidden="true" />
          : <Plant size={28} weight="fill" className="text-primary" aria-hidden="true" />}
      </div>
      <h2 className="font-headline-md text-xl font-bold text-text mb-2">
        {searchQ
          ? t("empty.no_match_search", { q: searchQ })
          : t("empty.no_match_filters")}
      </h2>
      <p className="text-fg-muted text-sm mb-6">
        {searchQ ? t("empty.search_hint") : t("empty.filters_hint")}
      </p>
      {searchQ && (
        <div className="flex flex-wrap justify-center gap-2 mb-6">
          {EMPTY_CATEGORY_CHIPS.map(({ key, q }) => (
            <Link
              key={key}
              href={`/producers?q=${encodeURIComponent(q)}`}
              className="bg-white border border-border text-text rounded-full px-4 py-1.5 text-sm hover:border-primary hover:text-primary transition"
            >
              {t(`empty.category_chips.${key}`)}
            </Link>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onClear}
        className="bg-primary text-white px-6 py-3 rounded-[12px] font-medium hover:bg-primary-dark transition"
      >
        {t("empty.clear_all_show_all")}
      </button>
    </div>
  );
}

function CatalogEmptyState() {
  const t = useTranslations("producers.catalog_empty");
  // MEH-669: hide the "register as producer" CTA from admins.
  // Server-side guard at backend/app/routers/auth.py:432 enforces; this
  // is defense-in-depth UX. notify_cta link stays visible to everyone.
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  return (
    <div className="text-center py-16">
      <div
        className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50 mb-4"
        aria-hidden="true"
      >
        <Leaf size={28} weight="fill" className="text-primary" aria-hidden="true" />
      </div>
      <h2 className="font-headline-md text-xl font-bold text-text mb-2">
        {t("title")}
      </h2>
      <p className="text-fg-muted text-sm mb-6 max-w-sm mx-auto">
        {t("subtitle")}
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        {!isAdmin && (
          <Link
            href="/register/producer"
            className="bg-primary text-white px-6 py-3 rounded-[12px] font-medium hover:bg-primary-dark transition"
          >
            {t("add_cta")}
          </Link>
        )}
        <Link
          href="/about#newsletter"
          className="border border-primary text-primary px-6 py-3 rounded-[12px] font-medium hover:bg-green-50 transition"
        >
          {t("notify_cta")}
        </Link>
      </div>
    </div>
  );
}

function PageOverflowState() {
  const t = useTranslations("producers.page_overflow");
  return (
    <div className="text-center py-16">
      <p className="text-fg-muted mb-4">{t("message")}</p>
      <Link
        href="/producers"
        className="inline-flex items-center bg-primary text-white px-5 py-2 rounded-[12px] hover:bg-primary-dark transition"
      >
        {t("back_cta")}
      </Link>
    </div>
  );
}

function ServerPageLinks({ page, totalPages }) {
  const t = useTranslations("producers.pagination");
  if (totalPages <= 1) return null;
  const prev =
    page > 1 ? (page - 1 === 1 ? "/producers" : `/producers?page=${page - 1}`) : null;
  const next = page < totalPages ? `/producers?page=${page + 1}` : null;

  return (
    <nav
      aria-label={t("aria")}
      className="flex items-center justify-center gap-3 mt-8 text-sm"
    >
      {prev ? (
        <Link
          href={prev}
          className="border border-border bg-white text-text px-4 py-2 rounded-[12px] hover:bg-green-50 transition"
        >
          {t("prev")}
        </Link>
      ) : (
        <span className="border border-border text-fg-muted px-4 py-2 rounded-[12px] opacity-50">
          {t("prev")}
        </span>
      )}
      <span className="text-fg-muted">{t("page_of", { page, totalPages })}</span>
      {next ? (
        <Link
          href={next}
          className="border border-border bg-white text-text px-4 py-2 rounded-[12px] hover:bg-green-50 transition"
        >
          {t("next")}
        </Link>
      ) : (
        <span className="border border-border text-fg-muted px-4 py-2 rounded-[12px] opacity-50">
          {t("next")}
        </span>
      )}
    </nav>
  );
}
