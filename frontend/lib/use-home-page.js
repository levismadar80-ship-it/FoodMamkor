"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { getRecentlyViewedIds } from "@/lib/recently-viewed";
import { useUserCity } from "@/lib/use-user-city";
import { buildChipParams } from "@/lib/producer-filters";
import { useOnboarding } from "@/lib/use-onboarding";
import { isFridayMode } from "@/lib/friday-mode";
import { CATEGORY_CARDS, matchCategoryId } from "@/lib/home-categories";

const PAGE_SIZE = 8;

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
 *   - 6 derived values (visibleProducers, hasMore, categoryCards,
 *     statsProducersCount, statsCategoriesCount, newestProducers)
 *   - 2 thin adapter callbacks (handleClearCategory, handleLoadMore)
 *     wrap inline JSX-side calls so the producers grid component
 *     does not need setFilters / setVisibleCount / loadProducers /
 *     buildChipParams / updateURL injected as separate props.
 */
export function useHomePage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [producers, setProducers] = useState([]);
  const [homeProducts, setHomeProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState(() => {
    if (typeof window === "undefined") return { category: "", delivery_city: "", has_delivery: false };
    const p = new URLSearchParams(window.location.search);
    return {
      category: p.get("category") || "",
      delivery_city: p.get("city") || "",
      has_delivery: p.get("delivery") === "1",
    };
  });
  // MEH-23 — persist visibleCount + scrollY across navigations so the
  // "Load more" expansion isn't lost when a user opens a producer and
  // returns via the back button. Read on mount only; subsequent changes
  // flow through the setter below.
  const [visibleCount, setVisibleCount] = useState(() => {
    if (typeof window === "undefined") return PAGE_SIZE;
    const saved = Number(window.sessionStorage?.getItem("home_visible_count"));
    return Number.isFinite(saved) && saved >= PAGE_SIZE ? saved : PAGE_SIZE;
  });
  const [stats, setStats] = useState({ producers_count: 0, categories_count: 0 });
  const [producersLoading, setProducersLoading] = useState(true);
  const [geoLoading, setGeoLoading] = useState(false);
  const [chips, setChips] = useState(() => {
    if (typeof window === "undefined") return { kosher: false, organic: false, has_delivery: false, verified: false };
    const p = new URLSearchParams(window.location.search);
    return {
      kosher: p.get("kosher") === "1",
      organic: p.get("organic") === "1",
      has_delivery: p.get("delivery") === "1",
      verified: p.get("verified") === "1",
    };
  });
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
    api.get("/categories").then((r) => setCategories(r.data)).catch(() => {});
    // Apply any filters + chips already in the URL on first load (shared/bookmarked URLs).
    const initParams = {};
    if (filters.category) initParams.category = filters.category;
    if (filters.delivery_city) initParams.delivery_city = filters.delivery_city;
    const initChipParams = buildChipParams(chips);
    Object.assign(initParams, initChipParams);
    loadProducers(initParams);
    // Home-kitchen preview — just the 3 most recent, no filter.
    // Full browse + filter lives on /neighbor.
    api
      .get("/home-products")
      .then((r) => setHomeProducts(r.data))
      .catch(() => setHomeProducts([]));
    api.get("/stats").then((r) => setStats(r.data)).catch(() => {});
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

  // Derived values
  const visibleProducers = producers.slice(0, visibleCount);
  const hasMore = visibleCount < producers.length;
  const categoryCards = matchCategoryId(CATEGORY_CARDS, categories);
  const statsProducersCount = stats.producers_count || producers.length;
  const statsCategoriesCount = stats.categories_count || categories.length || 6;

  // Newest producers (last 4 by created_at if available, else first 4)
  const newestProducers = [...producers]
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
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
  };
}
