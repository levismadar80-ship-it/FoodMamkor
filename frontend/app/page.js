"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { getRecentlyViewedIds } from "@/lib/recently-viewed";
import { setUserLocation } from "@/lib/user-location";
import { motion } from "framer-motion";
import { CaretDown, Crosshair, House, Leaf } from "@phosphor-icons/react";
import ProducerCard from "@/components/ProducerCard";
import HomeProductCard from "@/components/HomeProductCard";
import SmartSearch from "@/components/SmartSearch";
import HeroSearch from "@/components/HeroSearch";
import ParallaxQuote from "@/components/ParallaxQuote";
import { SkeletonProducerGrid } from "@/components/Skeleton";
import FadeInSection from "@/components/FadeInSection";
import { showToast } from "@/lib/toast";
import AnimatedCounter from "@/components/AnimatedCounter";
import { CATEGORY_ICONS } from "@/components/CategoryIcons";
import { useUserCity } from "@/lib/use-user-city";
import LocationModal from "@/components/LocationModal";
import LocationBanner from "@/components/LocationBanner";
import ChipScrollRow from "@/components/ChipScrollRow";
import { buildChipParams, CHIPS_CONFIG } from "@/lib/producer-filters";
import OnboardingTip from "@/components/OnboardingTip";
import { useOnboarding } from "@/lib/use-onboarding";
import HolidayBanner from "@/components/HolidayBanner";
import FridayDeliveryStrip from "@/components/FridayDeliveryStrip";
import { isFridayMode } from "@/lib/friday-mode";
import { UpcomingEventsPreview } from "@/app/home/UpcomingEventsPreview";
import {
  HomeMarquee,
  HomeFounderQuote,
  HomeHowItWorks,
} from "@/app/home/HomeStaticBlocks";

const PAGE_SIZE = 8;

// OPTIMIZE: `auto=format` → Unsplash serves WebP/AVIF when supported;
// `q=80` drops ~30% bytes with no perceptible quality loss on a parallax bg.
const HERO_IMAGE = "https://images.unsplash.com/photo-1542838132-92c53300491e?w=1920&auto=format&q=80&fm=webp";

// PREMIUM_DESIGN: parallax divider images between sections.
const PARALLAX_IMAGE_1 = "https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=1600&auto=format&q=80&fm=webp";
const PARALLAX_IMAGE_2 = "https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=1600&auto=format&q=80&fm=webp";

// PREMIUM_DESIGN: category cards now use hand-drawn SVG line-art
// (see CategoryIcons.jsx) instead of Phosphor — warmer, more unique
// than a generic icon library. Match-terms + Unsplash images unchanged.
const CATEGORY_CARDS = [
  { key: "meat",  name: "בשר, עוף ודגים",    match: ["בשר", "עוף", "דגים"],        image: "https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=600&fit=crop&auto=format&q=80&fm=webp" },
  { key: "veg",   name: "ירקות, פירות ומשקים", match: ["ירקות", "פירות", "משקה"],   image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&fit=crop&auto=format&q=80&fm=webp" },
  { key: "dairy", name: "חלב וגבינות",        match: ["חלב", "גבינה", "גבינות"],  image: "https://images.unsplash.com/photo-1771578742735-36009188c207?w=600&fit=crop&auto=format&q=80&fm=webp" },
  { key: "bread", name: "לחמים ואפייה",       match: ["לחם", "אפייה", "מאפים"],    image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&fit=crop&auto=format&q=80&fm=webp" },
  { key: "oil",   name: "שמנים ודבש",         match: ["שמן", "דבש"],                image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&fit=crop&auto=format&q=80&fm=webp" },
  { key: "care",  name: "טיפוח וסבונים",      match: ["טיפוח", "סבון", "קוסמטיקה"], image: "https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=600&fit=crop&auto=format&q=80&fm=webp" },
];

function matchCategoryId(cards, categories) {
  return cards.map((card) => {
    const found = categories.find((c) =>
      card.match.some((m) => c.name && c.name.includes(m))
    );
    return { ...card, categoryId: found ? found.id : null };
  });
}

export default function HomePage() {
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

  const visibleProducers = producers.slice(0, visibleCount);
  const hasMore = visibleCount < producers.length;
  const categoryCards = matchCategoryId(CATEGORY_CARDS, categories);
  const statsProducersCount = stats.producers_count || producers.length;
  const statsCategoriesCount = stats.categories_count || categories.length || 6;

  // Newest producers (last 4 by created_at if available, else first 4)
  const newestProducers = [...producers]
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    .slice(0, 4);

  return (
    <div>
      {/* =========================
          HERO — gardensweet.com style
          background-attachment: fixed is the CSS parallax (spec §Hero).
          .hero-parallax sets fixed; @media (pointer: coarse) falls back
          to scroll because iOS Safari silently ignores fixed.
          ========================= */}
      <section
        className="relative w-full hero-parallax"
        aria-label="דף הבית — גלי בתי עסק מקומיים"
        style={{
          height: "100vh",
          backgroundImage: `url(${HERO_IMAGE})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        {/* Gradient overlay — dark at bottom, fading up */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(46,74,46,0.88) 0%, rgba(46,74,46,0.40) 50%, rgba(0,0,0,0.10) 100%)",
          }}
        />

        {/* Text anchored to bottom 25% of hero */}
        <div
          className="absolute left-0 right-0 text-center px-4 text-white"
          style={{ bottom: "25%" }}
        >
          <motion.h1
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="font-headline font-bold leading-tight text-[clamp(28px,8vw,52px)] md:text-[clamp(42px,6vw,80px)]"
            style={{ lineHeight: 1.15 }}
          >
            {t("hero_title")}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="font-body mt-3 text-light"
            style={{
              fontSize: "18px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {fridayMode ? "שישי הגיע 🛒 מה הולך על שולחן השבת שלך?" : t("hero_subtitle")}
          </motion.p>

          {/* Pill search */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            role="search"
            aria-label="חיפוש בתי עסק"
            className="mx-auto mt-8 bg-white shadow-lg px-6 py-3.5"
            style={{ borderRadius: "50px", width: "min(580px, 88vw)" }}
          >
            {/* MEH-99: HeroSearch routes to /producers?q= for filtered listing.
                SmartSearch (routes to /search?q= results page) is retained
                in the site header for secondary navigation. */}
            <HeroSearch
              placeholder={t("search_placeholder")}
              srLabel={t("search_sr_label")}
              className="w-full"
            />
          </motion.div>

          {/* "Near me" geolocation button — task 11 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="mt-4"
          >
            <button
              type="button"
              onClick={handleNearMe}
              disabled={geoLoading}
              className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm text-white border border-white/30 px-5 py-2.5 rounded-full hover:bg-white/25 transition font-medium text-sm disabled:opacity-50"
            >
              <Crosshair size={18} weight="bold" className={geoLoading ? "animate-spin" : ""} aria-hidden="true" />
              {geoLoading ? "מחפשת..." : "קרוב אלי"}
            </button>
          </motion.div>
        </div>

        {/* Scroll arrow — animate-bounce replaced with a subtle slow
            fade+glide (PREMIUM_DESIGN rule: no bounce easing). The
            `scroll-hint` keyframe lives in globals.css and respects
            prefers-reduced-motion. */}
        <button
          type="button"
          onClick={scrollToProducers}
          // eslint-disable-next-line no-restricted-syntax -- rtl-ok: horizontal centering idiom
          className="absolute left-1/2 -translate-x-1/2 text-white/70 hover:text-white transition-opacity scroll-hint"
          style={{ bottom: "32px" }}
          aria-label="גלול לרשימת בתי העסק"
        >
          <CaretDown size={28} weight="bold" aria-hidden="true" />
        </button>
      </section>

      {/* MEH-50: שוק שישי strip — shown Thu 18:00 → Fri 14:00 only */}
      {fridayMode && <FridayDeliveryStrip city={userCity} />}

      {/* =========================
          SOCIAL PROOF BAR
          PREMIUM_DESIGN: numbers count up from 0 when scrolled into view.
          ========================= */}
      <section className="bg-primary text-white py-4 text-center">
        <p className="font-body text-lg tracking-wide">
          <span className="font-semibold tabular-nums">
            <AnimatedCounter target={statsProducersCount} />
          </span>{" "}
          בתי עסק מאומתים
          &nbsp;·&nbsp;
          <span className="font-semibold tabular-nums">
            <AnimatedCounter target={statsCategoriesCount} />
          </span>{" "}
          קטגוריות
          &nbsp;·&nbsp;
          מכל רחבי הארץ
        </p>
      </section>

      {/* MEH-41: location banner — appears after 3s if no city saved */}
      <div className="mt-6">
        <LocationBanner hasCity={!!userCity} onOpenModal={() => setLocationModalOpen(true)} />
      </div>

      {/* MEH-41: location modal — shared between hero button + banner */}
      <LocationModal
        open={locationModalOpen}
        onClose={() => setLocationModalOpen(false)}
        onSelectCity={handleCitySelected}
      />

      {/* MEH-55: holiday banner — visible 7 days before and during a holiday */}
      <div className="mt-4">
        <HolidayBanner />
      </div>

      {/* =========================
          CATEGORY GRID
          ========================= */}
      <section className="max-w-7xl mx-auto px-4 section-y">
        <FadeInSection className="text-center mb-10">
          <h2 className="font-headline font-bold text-site-text mb-2" style={{ fontSize: "clamp(32px, 4vw, 48px)" }}>
            גלי לפי קטגוריה
          </h2>
          <p className="text-site-muted text-base">ישר מבית העסק — בלי מתווכים</p>
        </FadeInSection>
        <div
          className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3"
          style={{ gap: "20px" }}
        >
          {categoryCards.map((card, idx) => {
            // PREMIUM_DESIGN: hand-drawn line-art icon per category.
            const LineArt = CATEGORY_ICONS[card.key];
            return (
            <motion.button
              key={card.key}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6, delay: idx * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
              onClick={() => handleCategoryCardClick(card)}
              className="group relative overflow-hidden cursor-pointer text-right h-[140px] md:h-[280px]"
              style={{
                borderRadius: "16px",
                backgroundImage: `url(${card.image})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
              aria-label={`הצג קטגוריה: ${card.name}`}
            >
              {/* Zooming bg layer — use transform on a pseudo-ish wrapper by scaling the button via group-hover */}
              <div
                className="absolute inset-0 transition-all duration-500 ease-out"
                style={{ backgroundColor: "rgba(46,104,83,0.65)" }}
              />
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-all duration-500 ease-out"
                style={{ backgroundColor: "rgba(46,104,83,0.45)" }}
              />
              <div className="relative z-10 h-full w-full flex flex-col items-center justify-center text-white transition-transform duration-500 ease-out group-hover:scale-[1.06]">
                {LineArt && <LineArt size={64} className="w-8 h-8 md:w-16 md:h-16" stroke="white" strokeWidth={1.75} />}
                <h3 className="font-headline font-bold mt-2 md:mt-3 text-[22px]">
                  {card.name}
                </h3>
              </div>
            </motion.button>
            );
          })}
        </div>
      </section>

      <HomeMarquee />

      <HomeFounderQuote />

      {/* =========================
          RECENTLY VIEWED (task 13)
          ========================= */}
      {recentlyViewed.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 pb-10">
          <h2 className="font-headline font-bold text-site-text mb-4" style={{ fontSize: "clamp(22px, 2.5vw, 28px)" }}>
            צפית לאחרונה
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide -mx-1 ps-1 after:content-[''] after:shrink-0 after:w-4">
            {recentlyViewed.map((p) => {
              const href = p.slug ? `/${p.slug}` : `/producer/${p.id}`;
              const imgSrc = p.images?.[0];
              return (
                <Link
                  key={p.id}
                  href={href}
                  className="shrink-0 w-[160px] bg-background border border-border rounded-[12px] overflow-hidden hover:shadow-md transition group"
                >
                  <div className="relative w-full h-[100px] bg-light overflow-hidden">
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={p.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-primary">
                        <Leaf size={32} weight="duotone" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="font-headline font-bold text-sm text-site-text truncate">{p.name}</p>
                    <p className="text-xs text-site-muted truncate">{p.city}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* =========================
          PRODUCERS GRID
          ========================= */}
      <section id="producers-grid" className="max-w-7xl mx-auto px-4 pb-20">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-headline font-bold text-site-text" style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }}>
            בתי עסק מומלצים
          </h2>
          <Link href="/map" className="text-primary hover:underline flex items-center gap-1">
            הצג במפה 🗺️
          </Link>
        </div>

        {/* Step 0 — producers grid tip (2s delay) */}
        <OnboardingTip
          show={step0Visible && onboardStep === 0}
          text="גלי בתי עסק מקומיים — ירקות טריים, גבינות, לחם מחמצת ועוד 🌿 לחצי על כרטיס כדי לצפות בפרטים"
          onDismiss={onboardDismiss}
          onNext={() => { setStep0Visible(false); onboardAdvance(); }}
        />

        {/* Filter chips */}
        <ChipScrollRow
          variant="toggle"
          chips={CHIPS_CONFIG}
          activeKeys={chips}
          onChipClick={toggleChip}
          fadeBg="#F5F0E8"
          className="mb-3"
        />
        {/* Step 1 — filter chips tip */}
        <OnboardingTip
          show={onboardStep === 1}
          text="סנני לפי אורגני, כשר, משלוח ועוד — לחצי על אחד מהכפתורים למעלה 👆"
          onDismiss={onboardDismiss}
          onNext={onboardAdvance}
        />
        {Object.values(chips).some(Boolean) && (
          <p className="text-xs text-site-muted mb-4" aria-live="polite">
            מסנן לפי:{" "}
            {CHIPS_CONFIG.filter((c) => chips[c.key])
              .map((c) => c.label)
              .join(" · ")}
          </p>
        )}

        {filters.category && (
          <div className="mb-6 flex items-center gap-2">
            <span className="text-sm text-site-muted">מציג:</span>
            {categories.find((c) => String(c.id) === filters.category) && (
              <span className="bg-light text-primary px-3 py-1 rounded-full text-sm">
                {categories.find((c) => String(c.id) === filters.category).emoji}{" "}
                {categories.find((c) => String(c.id) === filters.category).name}
              </span>
            )}
            <button
              onClick={() => {
                const newFilters = { ...filters, category: "" };
                setFilters(newFilters);
                updateURL(newFilters);
                loadProducers(buildChipParams(chips));
              }}
              className="text-sm text-primary hover:underline"
            >
              נקה סינון
            </button>
          </div>
        )}

        {producersLoading ? (
          <SkeletonProducerGrid count={8} />
        ) : (
          <>
            {/* MEH-23 — "מציגים X מתוך Y" counter above the grid. */}
            {producers.length > 0 && (
              <p
                className="text-sm text-site-muted mb-3"
                data-testid="producers-counter"
                aria-live="polite"
              >
                מציגים {Math.min(visibleCount, producers.length)} מתוך {producers.length}
              </p>
            )}
            {showNewUserHint && visibleProducers.length > 0 && (
              <div className="flex items-center gap-2 bg-light border border-primary/20 rounded-[12px] px-4 py-2.5 mb-4 text-sm text-primary w-fit">
                <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
                </span>
                לחצי ❤️ בכרטיס עסק כדי לשמור עסקים שאהבת
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4">
              {visibleProducers.map((p, idx) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.1 }}
                  transition={{ duration: 0.5, delay: (idx % 4) * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
                >
                  <ProducerCard producer={p} referrer="home" fridayMode={fridayMode} />
                </motion.div>
              ))}
            </div>
            {producers.length === 0 && (
              <div className="text-center py-16">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-light mb-4" aria-hidden="true">
                  <Leaf size={36} weight="duotone" className="text-primary" />
                </div>
                <h3 className="font-headline text-xl font-bold text-site-text mb-2">
                  לא מצאנו עסקים באזור הזה — עדיין 🌱
                </h3>
                <p className="text-site-muted mb-5 max-w-md mx-auto">
                  נסי לשנות את הסינון, או גלי בתי עסק על המפה
                </p>
                <Link
                  href="/map"
                  className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-[16px] hover:bg-primary-light transition font-medium"
                >
                  גלי על המפה
                </Link>
              </div>
            )}
            {hasMore && (
              <div className="text-center mt-8">
                <button
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="bg-white text-primary border-2 border-primary px-8 py-3 rounded-[16px] hover:bg-light transition font-medium"
                >
                  עוד בתי עסק
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* =========================
          NEW PRODUCERS (last 4 added)
          ========================= */}
      {newestProducers.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 pb-20">
          <h2 className="font-headline font-bold text-site-text mb-8" style={{ fontSize: "clamp(26px, 3vw, 36px)" }}>
            עסקים חדשים ✨
          </h2>
          <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4">
            {newestProducers.map((p) => (
              <ProducerCard key={`new-${p.id}`} producer={p} referrer="home" fridayMode={fridayMode} />
            ))}
          </div>
        </section>
      )}

      {/* =========================
          PARALLAX DIVIDER 1 (PREMIUM_DESIGN)
          First full-bleed divider. Ken Burns lives inside ParallaxQuote.
          Uses the farm-field Unsplash asset from docs/archive/PREMIUM_DESIGN.md.
          ========================= */}
      <ParallaxQuote
        image={PARALLAX_IMAGE_1}
        quote="אחרי שיודעים מאיפה לקנות — אי אפשר לחזור לאחור."
        attribution="— ספיר, מייסדת מהמקור"
        overlayOpacity={0.6}
        height="400px"
      />

      <HomeHowItWorks />

      {/* =========================
          מהמטבח של השכן — preview (max 3)
          Full browse lives at /neighbor. Hidden entirely when no products exist.
          ========================= */}
      {homeProducts.length > 0 && (
      <section
        id="home-kitchen"
        className="max-w-7xl mx-auto px-4 section-y border-t border-border scroll-mt-24"
      >
        <div className="flex items-baseline justify-between mb-6">
          <h2
            className="font-headline font-bold text-site-text inline-flex items-center gap-2"
            style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }}
          >
            <House size={32} weight="duotone" className="text-primary" aria-hidden="true" />
            מהמטבח של השכן
          </h2>
          <Link
            href="/neighbor"
            className="text-primary hover:underline text-sm font-medium whitespace-nowrap"
          >
            ראי עוד →
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {homeProducts.slice(0, 3).map((hp) => (
            <HomeProductCard
              key={hp.id}
              product={hp}
              onWhatsAppClick={() => handleWhatsAppClick(hp.id)}
            />
          ))}
        </div>
      </section>
      )}

      {/* =========================
          PARALLAX DIVIDER 2 (PREMIUM_DESIGN)
          Visual breather before the events block. Quote is intentionally
          shorter than the first divider so the page has rhythm.
          ========================= */}
      <ParallaxQuote
        image={PARALLAX_IMAGE_2}
        quote="כל עונה — טעם אחר"
        overlayOpacity={0.55}
        height="340px"
      />

      {/* =========================
          UPCOMING EVENTS PREVIEW (Task 6)
          ========================= */}
      <UpcomingEventsPreview />

      {/* =========================
          CTA — הוסף את העסק שלך
          ========================= */}
      <section className="bg-primary-dark text-white py-20">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="font-headline font-bold mb-4" style={{ fontSize: "clamp(32px, 4vw, 52px)" }}>
            יש לך עסק? בואי אליו
          </h2>
          <p className="text-light/90 text-lg mb-8 max-w-xl mx-auto">
            אם את בעלת עסק, חקלאית או מגדלת — הצטרפי לדירקטורי הראשון בישראל לאוכל אמיתי.
          </p>
          <Link
            href="/register/producer"
            className="inline-block bg-white text-primary px-8 py-3 rounded-[12px] hover:bg-light transition font-medium"
          >
            הוסיפי את העסק שלך 🌿
          </Link>
        </div>
      </section>
    </div>
  );
}
