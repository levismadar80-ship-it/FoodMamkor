/* eslint-disable max-lines, max-lines-per-function, max-statements, complexity, no-magic-numbers, react-hooks/set-state-in-effect, react-hooks/immutability, unicorn/consistent-function-scoping, unicorn/prefer-query-selector, unicorn/prefer-global-this, security/detect-object-injection, id-length */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "next-intl";
import { mapKey } from "@/lib/i18n-key-map";
import { getRecentlyViewedIds } from "@/lib/recently-viewed";
import { useUserCity } from "@/lib/use-user-city";
import { buildChipParams } from "@/lib/producer-filters";
import { useOnboarding } from "@/lib/use-onboarding";
import { isFridayMode } from "@/lib/friday-mode";
import { CATEGORY_CARDS, matchCategoryId } from "@/lib/home-categories";

const PAGE_SIZE = 8;
// MEH-521: minimum approved count before showing numeric stats.
const STATS_DISPLAY_THRESHOLD = 5;

/**
 * Custom hook owning the homepage's state, effects, handlers, and
 * derived values. Extracted from app/page.js (MEH-437) so the page
 * component can stay JSX-only.
 *
 * Behavior is bit-identical to the prior inline implementation:
 *   - 13 useState calls in declaration order
 *   - 7 useEffect blocks in declaration order
 *   - 7 handlers (updateURL, loadProducers, handleCategoryCardClick,
 *     handleWhatsAppClick, scrollToProducers, toggleChip, handleNearMe,
 *     handleCitySelected) close over the same state via the same
 *     reference identities they did before extraction
 *   - 7 derived values (visibleProducers, hasMore, categoryCards,
 *     statsProducersCount, statsCategoriesCount, statsLoaded,
 *     newestProducers)
 *   - 2 thin adapter callbacks (handleClearCategory, handleLoadMore)
 *     wrap inline JSX-side calls so the producers grid component
 *     does not need setFilters / setVisibleCount / loadProducers /
 *     buildChipParams / updateURL injected as separate props.
 */
export function useHomePage() {
  const { user } = useAuth();
  // MEH-471 strangler-fig: downstream consumers (HomeHero etc) still pass
  // old flat keys ("hero_title"). Wave 2 migrates those call sites and
  // this wrap is removed.
  const intlT = useTranslations();
  const t = useCallback((oldKey) => intlT(mapKey(oldKey)), [intlT]);
  const router = useRouter();
  const [producers, setProducers] = useState([]);
  const [homeProducts, setHomeProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  // MEH-517: static SSR-safe defaults — browser APIs (window.location.search,
  // sessionStorage) are read in the initial useEffect below to avoid React
  // #418 hydration mismatches caused by lazy initializers running on the client
  // but not on the server.
  const [filters, setFilters] = useState({ category: "", delivery_city: "", has_delivery: false });
  // MEH-23 — persist visibleCount + scrollY across navigations so the
  // "Load more" expansion isn't lost when a user opens a producer and
  // returns via the back button. Read on mount only; subsequent changes
  // flow through the setter below.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // MEH-607: `null` initial = "not yet fetched" → drives F10 skeleton in
  // page.js. After /stats resolves, value is the response object (or `{}` on
  // error so derived selectors stay safe). Three render states downstream:
  // skeleton (statsLoaded=false), counter (loaded + count >= threshold),
  // fallback/hidden (loaded + below threshold).
  const [stats, setStats] = useState(null);
  const [producersLoading, setProducersLoading] = useState(true);
  const [geoLoading] = useState(false);
  const [chips, setChips] = useState({ kosher: false, organic: false, has_delivery: false, verified: false });
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [showNewUserHint, setShowNewUserHint] = useState(false);
  const { city: userCity, setCity: setUserCity } = useUserCity();
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const { step: onboardStep, advance: onboardAdvance, dismiss: onboardDismiss } = useOnboarding();
  const [step0Visible, setStep0Visible] = useState(false);
  const [fridayMode, setFridayMode] = useState(false);

  useEffect(() => {
    if (onboardStep !== 0) return;
    const t = setTimeout(() => setStep0Visible(true), 2000);
    return () => clearTimeout(t);
  }, [onboardStep]);

  useEffect(() => {
    setFridayMode(isFridayMode());
    const tid = setInterval(() => setFridayMode(isFridayMode()), 60 * 1000);
    return () => clearInterval(tid);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("recently_viewed") && !localStorage.getItem("favorite_hint_shown")) {
      setShowNewUserHint(true);
    }
  }, []);

  useEffect(() => {
    if (!showNewUserHint) return;
    const onStorage = () => {
      if (localStorage.getItem("favorite_hint_shown")) setShowNewUserHint(false);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [showNewUserHint]);

  useEffect(() => {
    // MEH-517: read browser APIs on mount (moved from useState lazy initialisers).
    const p = new URLSearchParams(window.location.search);
    const initFilters = {
      category: p.get("category") || "",
      delivery_city: p.get("city") || "",
      has_delivery: p.get("delivery") === "1",
    };
    const initChips = {
      kosher: p.get("kosher") === "1",
      organic: p.get("organic") === "1",
      has_delivery: p.get("delivery") === "1",
      verified: p.get("verified") === "1",
    };
    const savedCount = Number(window.sessionStorage?.getItem("home_visible_count"));
    if (Number.isFinite(savedCount) && savedCount >= PAGE_SIZE) setVisibleCount(savedCount);
    setFilters(initFilters);
    setChips(initChips);

    api.get("/categories").then((r) => setCategories(r.data)).catch(() => {});
    // Apply any filters + chips already in the URL on first load (shared/bookmarked URLs).
    // Use local vars — state setters above are async and won't be reflected yet.
    const initParams = {};
    if (initFilters.category) initParams.category = initFilters.category;
    if (initFilters.delivery_city) initParams.delivery_city = initFilters.delivery_city;
    const initChipParams = buildChipParams(initChips);
    Object.assign(initParams, initChipParams);
    loadProducers(initParams);
    // Home-kitchen preview — just the 3 most recent, no filter.
    // Full browse + filter lives on /neighbor.
    api
      .get("/home-products")
      .then((r) => setHomeProducts(r.data))
      .catch(() => setHomeProducts([]));
    // MEH-607: on error, set `{}` (not leave `null`) so statsLoaded flips
    // true and the skeleton dismisses — empty result hides the section
    // (showStatsCounter/showStatsFallback both false), which is the same
    // behavior we had before, just CLS-safe (skeleton bridged the gap).
    api.get("/stats").then((r) => setStats(r.data)).catch(() => setStats({}));
    // Task 13 + MEH-11: load recently viewed producer IDs from
    // localStorage. The helper applies a 7-day TTL and gracefully
    // ignores legacy storage shapes.
    const ids = getRecentlyViewedIds();
    if (ids.length > 0) {
      Promise.all(
        ids.map((id) =>
          api.get(`/producers/${id}`).then((r) => r.data).catch(() => null),
        ),
      ).then((results) => setRecentlyViewed(results.filter(Boolean)));
    }
  }, []);

  // MEH-23 — write visibleCount + scrollY to sessionStorage whenever
  // the user expands the list or scrolls. Cheap: debounced via the
  // browser's scroll passive listener; storage writes are string ops.
  useEffect(() => {
    try {
      window.sessionStorage.setItem("home_visible_count", String(visibleCount));
    } catch {
      // private mode — ignore
    }
  }, [visibleCount]);

  // Restore scroll on mount when returning from a producer page. We
  // defer to rAF * 2 so the grid has a chance to render the expanded
  // visibleCount before we call scrollTo.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedY = Number(window.sessionStorage.getItem("home_scroll_y"));
    if (!Number.isFinite(savedY) || savedY <= 0) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.scrollTo(0, savedY));
    });
  }, []);

  // Stash scrollY just before the user navigates away (pagehide fires
  // on both bfcache + hard unload). Read-back happens on next mount.
  useEffect(() => {
    const stash = () => {
      try {
        window.sessionStorage.setItem("home_scroll_y", String(window.scrollY));
      } catch {
        // ignore
      }
    };
    window.addEventListener("pagehide", stash);
    return () => window.removeEventListener("pagehide", stash);
  }, []);

  // Rebuild the URL from the full filter + chip state. Both args are
  // optional — omit to use current state values.
  const updateURL = (newFilters, nextChips) => {
    if (typeof window === "undefined") return;
    const f = newFilters ?? filters;
    const c = nextChips ?? chips;
    const p = new URLSearchParams();
    if (f.category) p.set("category", f.category);
    if (f.delivery_city) p.set("city", f.delivery_city);
    if (c.kosher) p.set("kosher", "1");
    if (c.organic) p.set("organic", "1");
    if (c.has_delivery) p.set("delivery", "1");
    if (c.verified) p.set("verified", "1");
    const qs = p.toString();
    router.replace(qs ? `?${qs}` : "/", { scroll: false });
  };

  const loadProducers = (params = {}) => {
    setProducersLoading(true);
    api
      .get("/producers", { params })
      .then((r) => {
        setProducers(r.data);
        // Only reset visibleCount when the user actually changed filters
        // (i.e. was given `params`). The initial load and the back-from-
        // producer load should keep the restored visibleCount.
        if (Object.keys(params).length > 0) {
          setVisibleCount(PAGE_SIZE);
        }
      })
      .catch(() => {})
      .finally(() => setProducersLoading(false));
  };

  const handleCategoryCardClick = (card) => {
    if (!card.categoryId) return;
    const newCat = String(card.categoryId);
    const newFilters = { ...filters, category: newCat };
    setFilters(newFilters);
    updateURL(newFilters);
    loadProducers({ category: newCat, ...buildChipParams(chips) });
    document.getElementById("producers-grid")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleWhatsAppClick = async (productId) => {
    if (!user) return;
    try {
      await api.post(`/home-products/${productId}/whatsapp-click`);
    } catch {
      // ignore
    }
  };

  const scrollToProducers = () => {
    document.getElementById("producers-grid")?.scrollIntoView({ behavior: "smooth" });
  };

  const toggleChip = (key) => {
    const next = { ...chips, [key]: !chips[key] };
    setChips(next);
    const params = buildChipParams(next);
    if (filters.category) params.category = filters.category;
    if (filters.delivery_city) params.delivery_city = filters.delivery_city;
    const newFilters = key === "has_delivery"
      ? { ...filters, has_delivery: next.has_delivery }
      : filters;
    if (key === "has_delivery") setFilters(newFilters);
    updateURL(newFilters, next);
    loadProducers(params);
  };

  const handleNearMe = () => {
    if (userCity) {
      const newFilters = { ...filters, delivery_city: userCity };
      setFilters(newFilters);
      updateURL(newFilters);
      loadProducers({ delivery_city: userCity, ...buildChipParams(chips) });
      document.getElementById("producers-grid")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    setLocationModalOpen(true);
  };

  const handleCitySelected = (city) => {
    setUserCity(city);
    const newFilters = { ...filters, delivery_city: city };
    setFilters(newFilters);
    updateURL(newFilters);
    loadProducers({ delivery_city: city, ...buildChipParams(chips) });
    document.getElementById("producers-grid")?.scrollIntoView({ behavior: "smooth" });
  };

  // Adapters for the producers-grid component (avoids passing the full
  // setFilters/updateURL/loadProducers/buildChipParams quartet).
  const handleClearCategory = () => {
    const newFilters = { ...filters, category: "" };
    setFilters(newFilters);
    updateURL(newFilters);
    loadProducers(buildChipParams(chips));
  };

  const handleLoadMore = () => setVisibleCount((c) => c + PAGE_SIZE);

  // Advance from Step 0 onboarding tip. Resets the local 2s-delay gate
  // so a future return to step 0 re-arms the delay (matches the original
  // inline `() => { setStep0Visible(false); onboardAdvance(); }`).
  const handleAdvanceFromStep0 = () => {
    setStep0Visible(false);
    onboardAdvance();
  };

  // Derived values
  const visibleProducers = producers.slice(0, visibleCount);
  const hasMore = visibleCount < producers.length;
  const categoryCards = matchCategoryId(CATEGORY_CARDS, categories);
  // MEH-607: statsLoaded gates the F10 skeleton in page.js. Null-safe
  // accessors handle the `stats === null` initial state without crashing
  // (optional chaining + `|| fallback`).
  const statsLoaded = stats !== null;
  const statsProducersCount = stats?.producers_count || producers.length;
  const statsCategoriesCount = stats?.categories_count || categories.length || 6;
  const showStatsCounter = statsLoaded && statsProducersCount >= STATS_DISPLAY_THRESHOLD;
  const showStatsFallback = statsLoaded && !showStatsCounter && statsProducersCount > 0;

  // Newest producers (last 4 by created_at if available, else first 4)
  const newestProducers = producers
    .toSorted((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    .slice(0, 4);

  return {
    // i18n + auth
    t,
    user,
    // raw state
    producers,
    homeProducts,
    categories,
    filters,
    chips,
    visibleCount,
    producersLoading,
    geoLoading,
    recentlyViewed,
    showNewUserHint,
    locationModalOpen,
    setLocationModalOpen,
    fridayMode,
    step0Visible,
    userCity,
    // onboarding
    onboardStep,
    onboardAdvance,
    onboardDismiss,
    // derived
    visibleProducers,
    hasMore,
    categoryCards,
    statsProducersCount,
    statsCategoriesCount,
    statsLoaded,
    showStatsCounter,
    showStatsFallback,
    newestProducers,
    // handlers
    handleNearMe,
    handleCitySelected,
    handleCategoryCardClick,
    handleWhatsAppClick,
    scrollToProducers,
    toggleChip,
    handleClearCategory,
    handleLoadMore,
    handleAdvanceFromStep0,
  };
}
