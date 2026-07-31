/* eslint-disable max-lines, max-lines-per-function, max-statements, complexity, no-magic-numbers, react-hooks/set-state-in-effect, react-hooks/immutability, unicorn/consistent-function-scoping, unicorn/prefer-query-selector, unicorn/prefer-global-this, id-length */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "next-intl";
import { mapKey } from "@/lib/i18n-key-map";
import { getRecentlyViewedIds } from "@/lib/recently-viewed";
import { useUserCity } from "@/lib/use-user-city";
import { DELIVERY_DAYS } from "@/lib/delivery-days";
import { getUserLocation, setUserLocation } from "@/lib/user-location";
import { showToast } from "@/lib/toast";
import { buildChipParams } from "@/lib/producer-filters";
// MEH-1774: attribute chips deep-link to /producers instead of filtering here.
// The LOCALE-AWARE router is required, not the next/navigation one imported
// above: under localePrefix "as-needed" a bare push("/producers?…") drops an
// /en session onto the default locale — the class MEH-1157 closed on the
// dashboard login redirect.
import { useRouter as useLocaleRouter } from "@/i18n/navigation";
import { trackEvent } from "@/lib/analytics";
import { useOnboarding } from "@/lib/use-onboarding";
import { isFridayMode } from "@/lib/friday-mode";
import { CATEGORY_CARDS, matchCategoryId } from "@/lib/home-categories";
import { selectFeaturedProducer } from "@/lib/featured-producer";
import { findRegionForCity } from "@/data/regions";
import {
  CategoriesResponseSchema,
  StatsSchema,
  ProducerSchema,
  ProducersResponseSchema,
  RandomProducerSchema,
} from "@/lib/api-schemas";

const PAGE_SIZE = 8;
// MEH-1387: cap the home grid at ONE "עוד בתי עסק" expansion. Once
// visibleCount hits the cap the grid swaps the load-more button for a
// link to /producers (the full listing owns deep browsing, not home).
// Exported so HomeProducersGrid can compare against visibleCount.
export const LOAD_MORE_CAP = PAGE_SIZE * 2;
// MEH-521: minimum approved count before showing numeric stats.
const STATS_DISPLAY_THRESHOLD = 5;
// MEH-1692: minimum approved count before the trust band's LEAD line stops
// being a sentence and becomes a count ("{N} בתי עסק · כל אחד נבחר אישית").
// Deliberately higher than STATS_DISPLAY_THRESHOLD above — that one gates the
// quiet secondary stats line, this one decides what the band LEADS with, and a
// low number leading is negative social proof. Two thresholds, two jobs; do not
// collapse them.
const TRUST_COUNT_THRESHOLD = 25;
// MEH-1269: "קרוב אליי" geo radius (km). First pass at 15; the empty-guard
// widens to 30 once before giving up and showing all (mirrors the MEH-970
// never-blank philosophy on /map).
const GEO_RADIUS_KM = 15;
const GEO_RADIUS_KM_RETRY = 30;

/**
 * Custom hook owning the homepage's state, effects, handlers, and
 * derived values. Extracted from app/page.js (MEH-437) so the page
 * component can stay JSX-only.
 *
 * Behavior is bit-identical to the prior inline implementation:
 *   - 13 useState calls in declaration order
 *   - 7 useEffect blocks in declaration order
 *   - handlers (updateURL, loadProducers, handleWhatsAppClick,
 *     scrollToProducers, navigateToChip, handleNearMe, handleCitySelected)
 *     close over the same state via the same reference identities they
 *     did before extraction. MEH-1774 renamed toggleChip → navigateToChip:
 *     the attribute chips stopped filtering in place and became deep-links
 *     to /producers. handleCategoryCardClick was removed in
 *     MEH-1080 — category cards are real links to /producers?category=
 *     now; the ?category= deep-link path below stays for old shared URLs.
 *   - 6 derived values (visibleProducers, hasMore, categoryCards,
 *     statsProducersCount, statsCategoriesCount, statsLoaded)
 *     — was 7; MEH-1688 dropped newestProducers with the section it fed.
 *   - 2 thin adapter callbacks (handleClearCategory, handleLoadMore)
 *     wrap inline JSX-side calls so the producers grid component
 *     does not need setFilters / setVisibleCount / loadProducers /
 *     buildChipParams / updateURL injected as separate props.
 */
export function useHomePage() {
  const { user } = useAuth();
  // MEH-1288: real navigation to a random producer page (a page change, unlike
  // the MEH-1293 same-URL History-API mirroring below — push is correct here).
  const router = useRouter();
  // MEH-1774: locale-preserving push for the chip deep-link (see import note).
  const localeRouter = useLocaleRouter();
  // MEH-471 strangler-fig: downstream consumers (HomeHero etc) still pass
  // old flat keys ("hero_title"). Wave 2 migrates those call sites and
  // this wrap is removed.
  const intlT = useTranslations();
  const t = useCallback((oldKey) => intlT(mapKey(oldKey)), [intlT]);
  const [producers, setProducers] = useState([]);
  // MEH-1487: region fallback — { regionName, producers } when a delivery_city
  // filter returned 0 AND the city belongs to a region in data/regions.js;
  // null otherwise. Drives the "בתי עסק שמגיעים לאזור" section in the empty state.
  const [regionFallback, setRegionFallback] = useState(null);
  const [categories, setCategories] = useState([]);
  // MEH-517: static SSR-safe defaults — browser APIs (window.location.search,
  // sessionStorage) are read in the initial useEffect below to avoid React
  // #418 hydration mismatches caused by lazy initializers running on the client
  // but not on the server.
  // MEH-1645: delivery_day — a refinement of the delivery_city filter (one
  // canonical Hebrew day, lib/delivery-days.js). Only meaningful WITH a city:
  // the day row is progressive-disclosure UI, so a day can never be set
  // without a city, and clearing the city clears the day.
  const [filters, setFilters] = useState({ category: "", delivery_city: "", has_delivery: false, delivery_day: "" });
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
  // MEH-1269: geoLoading is now real — true while getCurrentPosition + the geo
  // fetch are in flight, so the HomeHero home.hero.searching ("בחיפוש...")
  // spinner actually shows (previously a dead const with no setter).
  const [geoLoading, setGeoLoading] = useState(false);
  // MEH-1269: {lat, lng} while a geographic "קרוב אליי" filter is active, else
  // null. Drives the dismissible ActiveFilterChip above the grid. Mutually
  // exclusive with filters.delivery_city (the explicit city-choice mode).
  const [geoFilter, setGeoFilter] = useState(null);
  // MEH-1282 (GAP A): persistent flag set when a "קרוב אליי" search finds nothing
  // at either radius and falls back to the full list. The MEH-1269 toast alone
  // was too transient — its final state (chip cleared, full list shown) read as
  // "nothing happened". This drives a persistent inline notice in the grid.
  // Cleared on the next successful geo search, city choice, or any chip/category
  // /location filter action.
  const [geoEmptyNotice, setGeoEmptyNotice] = useState(false);
  // MEH-1259: organic chip removed from the home filter row (self-declared
  // organic is no longer a public filter — חוק תוצרת אורגנית 2005).
  const [chips, setChips] = useState({ kosher: false, has_delivery: false, verified: false });
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
      // MEH-1645 (MEH-1083 pattern): ?day= survives refresh/share — but only
      // beside a city (a day-only URL would be an invisible filter, the
      // MEH-1269 lesson) AND only a canonical value: a crafted ?day= would
      // 422 on the backend, which loadProducers swallows into a silently
      // stale grid. Same whitelist the API validates against.
      delivery_day:
        p.get("city") && DELIVERY_DAYS.includes(p.get("day")) ? p.get("day") : "",
    };
    // MEH-1083: hydrate all 7 CHIPS_CONFIG keys — gluten_free/vegan/
    // lactose_free filtered results without surviving refresh/share
    // (MEH-1077 DISC-02).
    const initChips = {
      kosher: p.get("kosher") === "1",
      // MEH-1259: organic no longer hydrated — chip + filter removed.
      gluten_free: p.get("gluten_free") === "1",
      vegan: p.get("vegan") === "1",
      vegetarian: p.get("vegetarian") === "1",  // MEH-1438
      lactose_free: p.get("lactose_free") === "1",
      has_delivery: p.get("delivery") === "1",
      verified: p.get("verified") === "1",
    };
    const savedCount = Number(window.sessionStorage?.getItem("home_visible_count"));
    // MEH-1387: clamp a restored count to the cap — sessions saved before the
    // cap existed (or tampered values) must not restore an over-cap grid.
    if (Number.isFinite(savedCount) && savedCount >= PAGE_SIZE) {
      setVisibleCount(Math.min(savedCount, LOAD_MORE_CAP));
    }
    setFilters(initFilters);
    setChips(initChips);

    // Rule-19: validate the shape before trusting it; on parse failure
    // keep categories empty (same as the network-error branch below).
    api
      .get("/categories")
      .then((r) => {
        const parsed = CategoriesResponseSchema.safeParse(r.data);
        setCategories(parsed.success ? parsed.data : []);
      })
      .catch(() => {});
    // Apply any filters + chips already in the URL on first load (shared/bookmarked URLs).
    // Use local vars — state setters above are async and won't be reflected yet.
    const initParams = {};
    if (initFilters.category) initParams.category = initFilters.category;
    if (initFilters.delivery_city) initParams.delivery_city = initFilters.delivery_city;
    if (initFilters.delivery_day) initParams.delivery_day = initFilters.delivery_day;
    const initChipParams = buildChipParams(initChips);
    Object.assign(initParams, initChipParams);
    loadProducers(initParams);
    // MEH-607: on error, set `{}` (not leave `null`) so statsLoaded flips
    // true and the skeleton dismisses (CLS-safe — skeleton bridged the gap).
    // MEH-879/881: with stats `{}` the trust band shows the verification
    // LEAD alone (home.trust.lead); the count secondary stays hidden
    // because showStatsCounter is false (< threshold).
    // Rule-19: a malformed /stats payload degrades to {} the same way as the
    // network-error branch — lead-only, never crashes the counter.
    api
      .get("/stats")
      .then((r) => {
        const parsed = StatsSchema.safeParse(r.data);
        setStats(parsed.success ? parsed.data : {});
      })
      .catch(() => setStats({}));
    // Task 13 + MEH-11: load recently viewed producer IDs from
    // localStorage. The helper applies a 7-day TTL and gracefully
    // ignores legacy storage shapes.
    const ids = getRecentlyViewedIds();
    if (ids.length > 0) {
      Promise.all(
        ids.map((id) =>
          api
            .get(`/producers/${id}`)
            // Rule-19: a malformed producer is dropped (null), then
            // filtered out by `.filter(Boolean)` below — never rendered.
            .then((r) => {
              const parsed = ProducerSchema.safeParse(r.data);
              return parsed.success ? parsed.data : null;
            })
            .catch(() => null),
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
    // MEH-1645: day serialized only beside its city (never a day-only URL).
    if (f.delivery_city && f.delivery_day) p.set("day", f.delivery_day);
    if (c.kosher) p.set("kosher", "1");
    // MEH-1259: organic param no longer written — chip + filter removed.
    // MEH-1083: diet keys were missing from the serializer — param names
    // match the chip keys (delivery stays the legacy short name).
    if (c.gluten_free) p.set("gluten_free", "1");
    if (c.vegan) p.set("vegan", "1");
    if (c.vegetarian) p.set("vegetarian", "1");  // MEH-1438
    if (c.lactose_free) p.set("lactose_free", "1");
    if (c.has_delivery) p.set("delivery", "1");
    if (c.verified) p.set("verified", "1");
    const qs = p.toString();
    // MEH-1293: mirror to the URL via the shallow History API, NOT router.replace.
    // A router.replace — even to the SAME URL (geo lat/lng are intentionally NOT
    // persisted, so a geo apply produces an identical qs) — issues an RSC
    // round-trip that invalidates the router cache and lands mid-scroll, killing
    // the near-me smooth scroll (Phase 0: 1 ?_rsc per click; ×5 mash → scroll
    // interrupted, grid left the viewport). Same-URL guard + window.location
    // (locale-safe on /en, fixes the old hardcoded "/" locale drop).
    // REUSES: frontend/app/[locale]/events/EventsClient.jsx:159-170 (MEH-1085 DISC-08).
    const current = window.location.search.replace(/^\?/, "");
    if (qs === current) return;
    const path = window.location.pathname;
    window.history.replaceState(null, "", qs ? `${path}?${qs}` : path);
  };

  const loadProducers = (params = {}) => {
    setProducersLoading(true);
    api
      .get("/producers", { params })
      .then((r) => {
        // Rule-19: validate the home grid feed (NOT the map feed — that's
        // MEH-779). On parse failure show an empty grid rather than
        // crashing on a malformed row.
        const parsed = ProducersResponseSchema.safeParse(r.data);
        setProducers(parsed.success ? parsed.data : []);
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

  // MEH-1487: region fallback. When an explicit delivery_city filter returns
  // zero results AND the city belongs to a region, fetch the businesses that
  // deliver anywhere in that region (delivery_cities=<region cities>) and
  // surface them as an editorial discovery section in the empty state.
  // Editorial framing only — NOT a delivery-eligibility check.
  useEffect(() => {
    const city = filters.delivery_city;
    if (producersLoading) return;
    if (!city || producers.length > 0) {
      setRegionFallback(null);
      return;
    }
    const region = findRegionForCity(city);
    if (!region) {
      setRegionFallback(null);
      return;
    }
    let cancelled = false;
    api
      .get("/producers", { params: { delivery_cities: region.cities } })
      .then((r) => {
        const parsed = ProducersResponseSchema.safeParse(r.data);
        const list = parsed.success ? parsed.data : [];
        if (!cancelled) {
          setRegionFallback(
            list.length ? { regionName: region.name, producers: list } : null,
          );
        }
      })
      .catch(() => {
        if (!cancelled) setRegionFallback(null);
      });
    return () => {
      cancelled = true;
    };
  }, [producers, producersLoading, filters.delivery_city]);

  // MEH-1080: handleCategoryCardClick removed — homepage category cards are
  // real <Link>s to /producers?category=<id> (HomeCategoryGrid.jsx); no
  // in-place category filtering is triggered from the cards anymore. The
  // ?category= deep-link support (initFilters + updateURL + the grid's
  // active pill/clear) is kept for backward compat with old shared URLs.

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

  // MEH-1774: an attribute chip is a DEEP-LINK, not an in-place filter. One
  // canonical filtering surface — /producers owns the attribute axis (Baymard:
  // attribute filtering is a product-list capability; home is the entry layer),
  // so a tap navigates there with the filter already applied instead of
  // filtering the home grid. Same shape MEH-1080 gave the category cards.
  //
  // The param is built HERE and NOT via buildChipParams, deliberately:
  // buildChipParams emits a boolean `true` (producer-filters.js:38) while
  // ProducersClient.initChipsFromParams tests `get(chip.key) === "1"`
  // (ProducersClient.jsx:53). Reusing it would produce `?vegan=true`, and the
  // chip would stay dark on arrival with no error anywhere — a silent failure.
  //
  // No key-mapping table is needed and one would be dead code: initChipsFromParams
  // iterates the SAME CHIPS_CONFIG array this row renders from, so `?<chip.key>=1`
  // round-trips for all 7 keys by construction — `has_delivery` included. The
  // `?delivery=1` short name is home's OWN serializer (updateURL below) and is
  // deliberately untouched here: home's reading of attribute params is out of
  // scope for this ticket (MEH-1083).
  const navigateToChip = (key) => {
    // MEH-1282: still a filter action — clear the geo-empty notice before leaving,
    // so a back-navigation doesn't land on a stale near-me notice.
    setGeoEmptyNotice(false);
    trackEvent("home_chip_navigate", { chip: key });
    localeRouter.push(`/producers?${key}=1`);
  };

  // MEH-1269: geographic listing fetch with a one-shot empty-guard. Runs the
  // GEO_RADIUS_KM query; on zero rows it widens ONCE to GEO_RADIUS_KM_RETRY; if
  // STILL empty it drops the geo filter and reloads the full (non-geo) listing
  // with a toast — the grid is never left blank without a message (mirrors the
  // MapClient.jsx MEH-970 never-blank philosophy). Owns producersLoading +
  // geoLoading for the whole sequence.
  const loadProducersGeo = (lat, lng) => {
    setGeoLoading(true);
    setProducersLoading(true);
    const chipParams = buildChipParams(chips);
    const catParam = filters.category ? { category: filters.category } : {};
    const fetchAtRadius = (radius) =>
      api
        .get("/producers", {
          params: { lat, lng, radius_km: radius, ...catParam, ...chipParams },
        })
        .then((r) => {
          const parsed = ProducersResponseSchema.safeParse(r.data);
          return parsed.success ? parsed.data : [];
        });
    fetchAtRadius(GEO_RADIUS_KM)
      .then((rows) => (rows.length > 0 ? rows : fetchAtRadius(GEO_RADIUS_KM_RETRY)))
      .then((rows) => {
        if (rows.length > 0) {
          // MEH-1282: a successful geo search clears any prior empty notice.
          setGeoEmptyNotice(false);
          setProducers(rows);
          setVisibleCount(PAGE_SIZE);
          return;
        }
        // Empty even at the widened radius → abandon geo, show everything.
        setGeoFilter(null);
        loadProducers({ ...catParam, ...chipParams });
        showToast.info(t("home.producers.geo_empty"));
        // MEH-1282 (GAP A): persist the outcome inline — the toast alone left
        // the final state indistinguishable from "nothing happened".
        setGeoEmptyNotice(true);
      })
      .catch(() => {})
      .finally(() => {
        setProducersLoading(false);
        setGeoLoading(false);
      });
  };

  // MEH-1269: apply the geo filter's shared side effects — clear the (mutually
  // exclusive) city filter, stash {lat,lng} for the chip, refresh the URL
  // (lat/lng are intentionally NOT persisted — over-engineering guard), and
  // scroll to the grid.
  const applyGeoFilter = ({ lat, lng }) => {
    // MEH-1645: the day rides the city filter — geo mode clears both.
    const newFilters = { ...filters, delivery_city: "", delivery_day: "" };
    setFilters(newFilters);
    setGeoFilter({ lat, lng });
    updateURL(newFilters);
    document.getElementById("producers-grid")?.scrollIntoView({ behavior: "smooth" });
  };

  // MEH-1269: "קרוב אליי" is real geolocation now (was an invisible
  // delivery_city localStorage filter). A cached sessionStorage fix filters
  // immediately; otherwise the click IS explicit consent, so we prompt the
  // browser directly. PERMISSION_DENIED (code 1) falls back to the existing
  // city modal; technical failures (codes 2/3) toast and stay put.
  const handleNearMe = () => {
    // MEH-1293: idempotence guard — if a geo filter is already active, another
    // near-me click must NOT re-fetch or re-write history (that was the
    // multi-click storm). Just re-scroll to the already-filtered grid. The
    // chip ✕ (handleClearLocation) stays the only reset path.
    if (geoFilter) {
      scrollToProducers();
      return;
    }
    const cached = getUserLocation();
    if (cached) {
      applyGeoFilter(cached);
      loadProducersGeo(cached.lat, cached.lng);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationModalOpen(true);
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        // Persist the GPS fix → card distance labels light up (ProducerCard.jsx
        // reads it via useUserLocation), same contract as LocationModal.
        setUserLocation(latitude, longitude);
        applyGeoFilter({ lat: latitude, lng: longitude });
        loadProducersGeo(latitude, longitude);
      },
      (err) => {
        setGeoLoading(false);
        if (err?.code === 1) {
          setLocationModalOpen(true);
        } else {
          showToast.info(t("home.hero.geo_failure"));
        }
      },
    );
  };

  const handleCitySelected = (city) => {
    setUserCity(city);
    // MEH-1269: an explicit city choice exits geo mode (chip swaps geo → city).
    setGeoFilter(null);
    // MEH-1282: a city choice supersedes the empty-near-me notice.
    setGeoEmptyNotice(false);
    const newFilters = { ...filters, delivery_city: city };
    setFilters(newFilters);
    updateURL(newFilters);
    // MEH-1645: an active day refinement survives a city switch — it is an
    // explicit choice, visible in the chip, and re-applies to the new city.
    loadProducers({
      delivery_city: city,
      ...(newFilters.delivery_day ? { delivery_day: newFilters.delivery_day } : {}),
      ...buildChipParams(chips),
    });
    document.getElementById("producers-grid")?.scrollIntoView({ behavior: "smooth" });
  };

  // MEH-1645: set / toggle-off the delivery-day refinement. Selecting the
  // active day again clears it.
  //
  // MEH-1771: the day row is now ALWAYS rendered (ghost state without a
  // city), so this is reachable with no city set. A day still requires a
  // city — filtering by day alone returns meaningless results — so instead
  // of the old silent `return`, ask for the missing precondition: open the
  // LocationModal. Same modal handleDeliveryCta opens, and its onSelectCity
  // IS handleCitySelected, so the pick flows through the one existing path;
  // no new city-application path is introduced here.
  const handleDaySelected = (day) => {
    if (!filters.delivery_city) {
      setLocationModalOpen(true);
      return;
    }
    setGeoEmptyNotice(false);
    const next = filters.delivery_day === day ? "" : day;
    const newFilters = { ...filters, delivery_day: next };
    setFilters(newFilters);
    updateURL(newFilters);
    loadProducers({
      delivery_city: newFilters.delivery_city,
      ...(next ? { delivery_day: next } : {}),
      ...buildChipParams(chips),
    });
  };

  // MEH-1643: hero "משלוחים אליי" CTA. With a saved user_city, apply the
  // EXISTING delivery_city path — handleCitySelected already owns the MEH-1485
  // write-back (setUserCity), the MEH-1269 geo mutual-exclusion, the
  // ActiveFilterChip state, the MEH-1487 region fallback (driven by
  // filters.delivery_city), and the scroll to the grid. Without a city, open
  // the LocationModal the page mounts; its onSelectCity IS handleCitySelected,
  // so the pick flows through the same single path.
  const handleDeliveryCta = () => {
    if (userCity) {
      handleCitySelected(userCity);
    } else {
      setLocationModalOpen(true);
    }
  };

  // MEH-1269: dismiss the active location filter (geo OR city) from the chip's
  // ✕. Clears both modes (mutually exclusive, so at most one is set) and
  // reloads keeping any category + chip filters intact.
  const handleClearLocation = () => {
    setGeoFilter(null);
    // MEH-1282: clearing the location filter also clears the empty-near-me notice.
    setGeoEmptyNotice(false);
    // MEH-1645: the day refinement falls with its city.
    const newFilters = { ...filters, delivery_city: "", delivery_day: "" };
    setFilters(newFilters);
    updateURL(newFilters);
    const params = buildChipParams(chips);
    if (newFilters.category) params.category = newFilters.category;
    loadProducers(params);
  };

  // Adapters for the producers-grid component (avoids passing the full
  // setFilters/updateURL/loadProducers/buildChipParams quartet).
  const handleClearCategory = () => {
    // MEH-1282: clearing the category is a filter action — clear the geo-empty notice.
    setGeoEmptyNotice(false);
    const newFilters = { ...filters, category: "" };
    setFilters(newFilters);
    updateURL(newFilters);
    loadProducers(buildChipParams(chips));
  };

  // MEH-1387: never grow past the cap — one expansion, then the grid shows
  // the /producers link instead of the button.
  const handleLoadMore = () => setVisibleCount((c) => Math.min(c + PAGE_SIZE, LOAD_MORE_CAP));

  // MEH-1288: "הפתיעו אותי" — fetch one random approved producer from the
  // backend (ORDER BY random(), full catalog — not just the loaded page) and
  // navigate to its page. Best-effort: a network error or malformed payload is
  // a silent no-op (the button stays, the user can tap again). Mirrors
  // ProducerCard's href rule (slug preferred, id fallback).
  const handleSurprise = useCallback(async () => {
    try {
      const r = await api.get("/producers/random");
      const parsed = RandomProducerSchema.safeParse(r.data);
      if (!parsed.success) return;
      const { slug, id } = parsed.data;
      router.push(slug ? `/${slug}` : `/producer/${id}`);
    } catch {
      // no-op — best-effort surprise
    }
  }, [router]);

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
  // MEH-1692: at/above the trust threshold the band LEADS with the count, and
  // the secondary line drops its own business count so the number is stated
  // once rather than twice (categories + countrywide stay).
  //
  // Gated on the AUTHORITATIVE /stats value, not on `statsProducersCount`. That
  // accessor falls back to `producers.length` when /stats fails — and that list
  // is the FILTERED home feed, so under a category or city filter it counts a
  // subset, not the directory. Tolerable for the quiet secondary line it has
  // always fed; not tolerable for a leading claim about how many businesses
  // exist, which is the over-claim class this ticket was opened to fix. When
  // /stats is unavailable the band falls back to the sentence, which is true
  // regardless of any count.
  const showTrustCount =
    statsLoaded && (stats?.producers_count ?? 0) >= TRUST_COUNT_THRESHOLD;

  // MEH-1688: `newestProducers` (last 4 by created_at) is GONE along with the
  // standalone section it fed. Recency is now a per-card fact, not a separate
  // grid — lib/badges.js lights "חדש" off days_since_created <= 30, which
  // ProducerCard already surfaces through BadgeRow's top-2 cut.

  // MEH-542: light up §10 "Meet a Producer" from a real producer — reuse the
  // existing is_recommended flag (zero schema / zero new endpoint). Pure
  // selection + mapping lives in lib/featured-producer.js (unit-tested);
  // null ⇒ §10 self-hides (HomeStaticBlocks.jsx:199), no fictional content.
  const featuredProducer = selectFeaturedProducer(producers);

  // MEH-1269: location-filter chip state — geo and city are mutually exclusive,
  // so at most one is truthy. cityActive carries the city name for the label.
  const geoActive = geoFilter !== null;
  const cityActive = filters.delivery_city || null;
  // MEH-1645: active day refinement (null when unset) — only ever set
  // alongside cityActive (progressive disclosure + the hydration guard).
  const dayActive = filters.delivery_day || null;

  return {
    // i18n + auth
    t,
    user,
    // raw state
    producers,
    regionFallback,
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
    showTrustCount,
    featuredProducer,
    geoActive,
    cityActive,
    dayActive,
    geoEmptyNotice,
    // handlers
    handleNearMe,
    handleSurprise,
    handleDeliveryCta,
    handleDaySelected,
    handleCitySelected,
    handleClearLocation,
    handleWhatsAppClick,
    scrollToProducers,
    navigateToChip,
    handleClearCategory,
    handleLoadMore,
    handleAdvanceFromStep0,
  };
}
