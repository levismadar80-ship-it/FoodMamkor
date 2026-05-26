"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import Breadcrumb from "@/components/Breadcrumb";
import ProducerCard from "@/components/ProducerCard";
import ChipScrollRow from "@/components/ChipScrollRow";
import LocationModal from "@/components/LocationModal";
import { SkeletonProducerGrid } from "@/components/Skeleton";
import { buildChipParams, CHIPS_CONFIG, CHIPS_DEFAULT } from "@/lib/producer-filters";
import { useUserCity } from "@/lib/use-user-city";
import { getRecentlyViewedIds } from "@/lib/recently-viewed";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";

const FILTER_LIMIT = 100;
const PAGE_SIZE = 24; // matches PER_PAGE in page.jsx

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
  const router = useRouter();

  const cityChipDef = { key: "city", label: t("filters.city_chip"), icon: "📍" };

  const [chips, setChips] = useState(() => initChipsFromParams(searchParams));
  const [cityFilter, setCityFilter] = useState(() => searchParams.get("city") || null);
  const [filteredItems, setFilteredItems] = useState(null);
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

  const hasActiveChips = Object.values(chips).some(Boolean) || !!cityFilter || !!searchQ;
  const displayItems = hasActiveChips
    ? (filteredItems ?? [])
    : [...initialItems, ...appendItems];
  const activeChipDefs = CHIPS_CONFIG.filter((c) => chips[c.key]);

  const syncUrl = useCallback(
    (chipState, city, q) => {
      const params = new URLSearchParams();
      for (const chip of CHIPS_CONFIG) {
        if (chipState[chip.key]) params.set(chip.key, "1");
      }
      if (city) params.set("city", city);
      if (q) params.set("q", q);
      const qs = params.toString();
      router.replace(qs ? `/producers?${qs}` : "/producers", { scroll: false });
    },
    [router],
  );

  const fetchFiltered = useCallback((chipState, city, q) => {
    const params = buildChipParams(chipState);
    if (city) params.delivery_city = city;
    if (q) params.q = q;
    if (Object.keys(params).length === 0) {
      setFilteredItems(null);
      return;
    }
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
        params: { limit: PAGE_SIZE, offset: (nextPage - 1) * PAGE_SIZE },
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
    const anyActive = Object.values(chips).some(Boolean) || !!cityFilter || !!searchQ;
    if (anyActive) fetchFiltered(chips, cityFilter, searchQ);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    syncUrl(next, cityFilter, searchQ);
    fetchFiltered(next, cityFilter, searchQ);
    trackEvent("producers_chip_toggle", { chip: key, active: !chips[key] });
  };

  const handleChipClick = (key) => {
    if (key === "city") {
      if (cityFilter) {
        setCityFilter(null);
        syncUrl(chips, null, searchQ);
        fetchFiltered(chips, null, searchQ);
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
    syncUrl(chips, city, searchQ);
    fetchFiltered(chips, city, searchQ);
    trackEvent("producers_city_filter", { city });
  };

  const clearAll = () => {
    setChips(CHIPS_DEFAULT);
    setCityFilter(null);
    setSearchQ("");
    setFilteredItems(null);
    syncUrl(CHIPS_DEFAULT, null, "");
    trackEvent("producers_clear_all");
  };

  const cityChip = cityFilter ? { ...cityChipDef, label: cityFilter } : cityChipDef;
  const allChips = [...CHIPS_CONFIG, cityChip];
  const activeKeys = { ...chips, city: !!cityFilter };

  const showFilterEmpty =
    hasActiveChips && !loading && filteredItems !== null && filteredItems.length === 0;
  const showPageOverflow =
    !hasActiveChips && initialItems.length === 0 && liveTotal > 0;
  const showCatalogEmpty = !hasActiveChips && liveTotal === 0;
  const showGrid = !loading && !showFilterEmpty && !showPageOverflow && !showCatalogEmpty;

  const counterText = (() => {
    if (!showGrid) return null;
    if (hasActiveChips) return t("discovery.found_count", { count: filteredItems?.length ?? 0 });
    const loaded = initialItems.length + appendItems.length;
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
      <h1 className="font-headline text-3xl font-bold text-text mb-6">
        {searchQ ? (
          <>
            {t("title.search_results")}{" "}
            <span className="text-primary">&ldquo;{searchQ}&rdquo;</span>
          </>
        ) : (
          t("title.all")
        )}
      </h1>

      {/* Recently viewed strip */}
      <RecentlyViewedStrip />

      {/* Chip row */}
      <ChipScrollRow
        variant="toggle"
        chips={allChips}
        activeKeys={activeKeys}
        onChipClick={handleChipClick}
        fadeBg="#F5F0E8"
        className="mb-3"
      />

      {/* Active filter strip */}
      {hasActiveChips && (
        <div className="flex items-center gap-2 mb-4 overflow-x-auto scrollbar-hide -mx-1 px-1 py-2 bg-green-50 border-y border-border">
          <span className="text-xs text-primary font-semibold whitespace-nowrap shrink-0">
            {t("filters.filter_by")}
          </span>
          {activeChipDefs.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => toggleChip(chip.key)}
              className="inline-flex items-center gap-1 bg-white text-primary border border-primary rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0"
            >
              <span aria-hidden="true" className="text-[10px] font-bold">×</span>
              {chip.icon} {chip.label}
            </button>
          ))}
          {cityFilter && (
            <button
              type="button"
              onClick={() => {
                setCityFilter(null);
                syncUrl(chips, null, searchQ);
                fetchFiltered(chips, null, searchQ);
              }}
              className="inline-flex items-center gap-1 bg-white text-primary border border-primary rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0"
            >
              <span aria-hidden="true" className="text-[10px] font-bold">×</span>
              📍 {cityFilter}
            </button>
          )}
          {searchQ && (
            <button
              type="button"
              onClick={() => {
                setSearchQ("");
                syncUrl(chips, cityFilter, "");
                fetchFiltered(chips, cityFilter, "");
              }}
              className="inline-flex items-center gap-1 bg-white text-primary border border-primary rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0"
            >
              <span aria-hidden="true" className="text-[10px] font-bold">×</span>
              🔍 {searchQ}
            </button>
          )}
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-primary underline whitespace-nowrap shrink-0 ms-1"
          >
            {t("filters.clear_all")}
          </button>
        </div>
      )}

      {/* Counter */}
      {counterText && (
        <p className="text-sm text-fg-muted mb-4" aria-live="polite">
          {counterText}
        </p>
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
    </>
  );
}

function RecentlyViewedStrip() {
  const t = useTranslations("producers.recently_viewed");
  const [producers, setProducers] = useState([]);

  useEffect(() => {
    const ids = getRecentlyViewedIds();
    if (!ids.length) return;
    Promise.all(
      ids.map((id) =>
        api
          .get(`/producers/${id}`)
          .then((r) => r.data)
          .catch(() => null),
      ),
    ).then((results) => setProducers(results.filter(Boolean)));
  }, []);

  if (!producers.length) return null;

  return (
    <section aria-label={t("aria")} className="mb-5">
      <p className="text-xs font-semibold text-fg-muted mb-2 px-0.5">{t("label")}</p>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {producers.map((p) => (
          <Link
            key={p.id}
            href={p.slug ? `/${p.slug}` : `/producer/${p.id}`}
            className="shrink-0 flex items-center bg-white border border-border rounded-full px-3 py-1.5 text-sm text-text hover:border-primary hover:text-primary transition whitespace-nowrap"
          >
            {p.name}
          </Link>
        ))}
      </div>
    </section>
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
        <span className="text-2xl">{searchQ ? "🔍" : "🌱"}</span>
      </div>
      <h2 className="font-headline text-xl font-bold text-text mb-2">
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
        <span className="text-2xl">🌿</span>
      </div>
      <h2 className="font-headline text-xl font-bold text-text mb-2">
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
