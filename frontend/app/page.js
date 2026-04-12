"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { motion } from "framer-motion";
import { House, Leaf } from "@phosphor-icons/react";
import ProducerCard from "@/components/ProducerCard";
import HomeProductCard from "@/components/HomeProductCard";
import ParallaxQuote from "@/components/ParallaxQuote";
import { SkeletonProducerGrid } from "@/components/Skeleton";
import FadeInSection from "@/components/FadeInSection";
import AnimatedCounter from "@/components/AnimatedCounter";
import { CATEGORY_ICONS } from "@/components/CategoryIcons";

const PAGE_SIZE = 8;

// OPTIMIZE: `auto=format` → Unsplash serves WebP/AVIF when supported;
// `q=80` drops ~30% bytes with no perceptible quality loss on a parallax bg.
const HERO_IMAGE = "https://images.unsplash.com/photo-1542838132-92c53300491e?w=1920&auto=format&q=80";

// PREMIUM_DESIGN: parallax divider images between sections.
const PARALLAX_IMAGE_1 = "https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=1600&auto=format&q=80";
const PARALLAX_IMAGE_2 = "https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=1600&auto=format&q=80";

// PREMIUM_DESIGN: category cards now use hand-drawn SVG line-art
// (see CategoryIcons.jsx) instead of Phosphor — warmer, more unique
// than a generic icon library. Match-terms + Unsplash images unchanged.
const CATEGORY_CARDS = [
  { key: "meat",  name: "בשר, עוף ודגים",    match: ["בשר", "עוף", "דגים"],        image: "https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=600&fit=crop&auto=format" },
  { key: "veg",   name: "ירקות, פירות ומשקים", match: ["ירקות", "פירות", "משקה"],   image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&fit=crop&auto=format" },
  { key: "dairy", name: "חלב וגבינות",        match: ["חלב", "גבינה", "גבינות"],  image: "https://images.unsplash.com/photo-1771578742735-36009188c207?w=600&fit=crop&auto=format" },
  { key: "bread", name: "לחמים ואפייה",       match: ["לחם", "אפייה", "מאפים"],    image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&fit=crop&auto=format" },
  { key: "oil",   name: "שמנים ודבש",         match: ["שמן", "דבש"],                image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&fit=crop&auto=format" },
  { key: "care",  name: "טיפוח וסבונים",      match: ["טיפוח", "סבון", "קוסמטיקה"], image: "https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=600&fit=crop&auto=format" },
];

// PREMIUM_DESIGN: hype tags that scroll in the marquee between sections.
const MARQUEE_ITEMS = [
  "🌿 ללא מעובד",
  "🥩 ממרעה",
  "🧀 אורגני",
  "🍞 מחמצת",
  "🫒 כתית",
  "🌱 טרי ואמיתי",
  "✅ מאומת",
  "📍 מקומי",
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
  const [producers, setProducers] = useState([]);
  const [homeProducts, setHomeProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ category: "", delivery_city: "", has_delivery: false });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState({ producers_count: 0, categories_count: 0 });
  const [producersLoading, setProducersLoading] = useState(true);

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data)).catch(() => {});
    loadProducers();
    // Home-kitchen preview — just the 3 most recent, no filter.
    // Full browse + filter lives on /neighbor.
    api
      .get("/home-products")
      .then((r) => setHomeProducts(r.data))
      .catch(() => setHomeProducts([]));
    api.get("/stats").then((r) => setStats(r.data)).catch(() => {});
  }, []);

  const loadProducers = (params = {}) => {
    setProducersLoading(true);
    api
      .get("/producers", { params })
      .then((r) => {
        setProducers(r.data);
        setVisibleCount(PAGE_SIZE);
      })
      .finally(() => setProducersLoading(false));
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      loadProducers();
    } else {
      loadProducers({ delivery_city: searchQuery });
    }
    document.getElementById("producers-grid")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleCategoryCardClick = (card) => {
    if (!card.categoryId) return;
    const newCat = String(card.categoryId);
    setFilters({ ...filters, category: newCat });
    loadProducers({ category: newCat });
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
          PREMIUM_DESIGN: Ken Burns slow pan/zoom on the background image.
          The image lives on an absolutely-positioned inner layer so the
          animation doesn't affect the text overlay.
          ========================= */}
      <section className="relative w-full overflow-hidden" style={{ height: "100vh" }}>
        <div
          className="kenburns-right absolute"
          style={{
            inset: "-5%",
            backgroundImage: `url(${HERO_IMAGE})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
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
            className="font-headline font-bold leading-tight"
            style={{ fontSize: "clamp(42px, 6vw, 80px)", lineHeight: 1.15 }}
          >
            אוכל אמיתי, ישר מהמקור אליך
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
            בתי עסק מקומיים, מגדלים קטנים ושכנות שמבשלות בבית
          </motion.p>

          {/* Pill search */}
          <motion.form
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            onSubmit={handleSearch}
            role="search"
            className="mx-auto mt-8 bg-white shadow-lg flex items-center gap-2 px-5 py-3"
            style={{ borderRadius: "50px", width: "min(580px, 88vw)" }}
          >
            <svg
              className="w-5 h-5 text-primary shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <label htmlFor="hero-search" className="sr-only">
              חיפוש בתי עסק וערים
            </label>
            <input
              id="hero-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חפשי ירקות טריים, בשר grass-fed..."
              className="flex-1 bg-transparent outline-none text-site-text placeholder:text-site-muted text-base focus-visible:ring-2 focus-visible:ring-primary/40 rounded-full"
            />
            <button
              type="submit"
              className="sr-only"
              aria-label="בצע חיפוש"
            >
              חיפוש
            </button>
          </motion.form>
        </div>

        {/* Scroll arrow — animate-bounce replaced with a subtle slow
            fade+glide (PREMIUM_DESIGN rule: no bounce easing). The
            `scroll-hint` keyframe lives in globals.css and respects
            prefers-reduced-motion. */}
        <button
          type="button"
          onClick={scrollToProducers}
          className="absolute left-1/2 -translate-x-1/2 text-white/70 hover:text-white transition-opacity scroll-hint"
          style={{ bottom: "32px" }}
          aria-label="גלול לרשימת בתי העסק"
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      </section>

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
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
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
              className="group relative overflow-hidden cursor-pointer text-right"
              style={{
                height: "280px",
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
                {LineArt && <LineArt size={64} stroke="white" strokeWidth={1.75} />}
                <h3 className="font-headline font-bold mt-3" style={{ fontSize: "22px" }}>
                  {card.name}
                </h3>
              </div>
            </motion.button>
            );
          })}
        </div>
      </section>

      {/* =========================
          MARQUEE STRIP (PREMIUM_DESIGN)
          Infinite scrolling hype tags between categories + producers.
          The list is rendered twice so the -50% translate loops cleanly.
          Pauses on hover; respects prefers-reduced-motion.
          ========================= */}
      <div
        className="bg-primary overflow-hidden marquee-edge-fade"
        style={{
          padding: "14px 0",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
        }}
        aria-hidden="true"
      >
        <div className="marquee-track">
          {[0, 1].map((loop) => (
            <div key={loop} className="flex items-center" style={{ gap: "48px" }}>
              {MARQUEE_ITEMS.map((text) => (
                <span
                  key={`${loop}-${text}`}
                  className="font-body whitespace-nowrap text-light"
                  style={{
                    fontSize: 14,
                    letterSpacing: "0.06em",
                  }}
                >
                  {text}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* =========================
          FOUNDER QUOTE CARD (LAUNCH_CHECKLIST fix 4)
          Hand-off between the abstract category grid and the concrete
          producer grid. Establishes personal voice before browse mode.
          ========================= */}
      <FadeInSection className="max-w-4xl mx-auto px-4 mb-8">
        <Link
          href="/about"
          className="group flex items-center gap-6 bg-white rounded-[20px] border border-border p-6 md:p-8 hover:shadow-[0_4px_24px_rgba(46,104,83,0.08)] transition focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <div className="w-20 h-20 rounded-full bg-light flex items-center justify-center shrink-0" aria-hidden="true">
            <Leaf size={36} weight="duotone" className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-headline italic text-site-text text-lg md:text-xl leading-relaxed mb-2">
              &ldquo;אוכל אמיתי, מאנשים אמיתיים, ממש ליד הבית.&rdquo;
            </p>
            <p className="font-body text-sm text-primary group-hover:underline">
              ספיר, מייסדת מהמקור →
            </p>
          </div>
        </Link>
      </FadeInSection>

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
                setFilters({ ...filters, category: "" });
                loadProducers();
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
            <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4">
              {visibleProducers.map((p, idx) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.1 }}
                  transition={{ duration: 0.5, delay: (idx % 4) * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
                >
                  <ProducerCard producer={p} referrer="home" />
                </motion.div>
              ))}
            </div>
            {producers.length === 0 && (
              <p className="text-center text-site-muted py-12">
                לא מצאנו עסקים באזור הזה — עדיין 🌱
              </p>
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
              <ProducerCard key={`new-${p.id}`} producer={p} referrer="home" />
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
        quote="כשאתה יודע מאיפה האוכל שלך — הכל טועם אחרת"
        overlayOpacity={0.6}
        height="400px"
      />

      {/* =========================
          HOW IT WORKS
          ========================= */}
      <section className="max-w-7xl mx-auto px-4 section-y">
        <FadeInSection>
          <h2 className="font-headline font-bold text-site-text text-center mb-10" style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }}>
            איך זה עובד?
          </h2>
        </FadeInSection>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {[
            { step: "01", title: "מצאי", text: "גלי בתי עסק קרובים אלייך — ירקות טריים, גבינות מהחווה, לחם מחמצת" },
            { step: "02", title: "צרי קשר", text: "דברי ישירות עם בית העסק בוואטסאפ, בטלפון או באינסטגרם" },
            { step: "03", title: "קבלי", text: "אוכל אמיתי וטרי, ישר מהמקור — בלי מתווכים, בלי הנחות על האיכות" },
          ].map((step, idx) => (
            <FadeInSection key={step.step} delay={idx * 0.12}>
              <div className="font-english text-5xl text-accent mb-2">{step.step}</div>
              <h3 className="font-headline text-2xl font-bold mb-2">{step.title}</h3>
              <p className="text-site-text/85 leading-relaxed">{step.text}</p>
            </FadeInSection>
          ))}
        </div>
      </section>

      {/* =========================
          מהמטבח של השכן — preview (max 3)
          Full browse lives at /neighbor. The full-section version used
          to live here but we split it out so the homepage stays tight.
          ========================= */}
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

        {homeProducts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {homeProducts.slice(0, 3).map((hp) => (
              <HomeProductCard
                key={hp.id}
                product={hp}
                onWhatsAppClick={() => handleWhatsAppClick(hp.id)}
              />
            ))}
          </div>
        ) : (
          <p className="text-center text-site-muted py-8">
            {user
              ? "אין עדיין מוצרים ביתיים."
              : "אין עדיין מוצרים ביתיים. התחברי כדי לפרסם."}
            {" "}
            <Link href="/neighbor" className="text-primary hover:underline">
              הצטרפי למהמטבח של השכן →
            </Link>
          </p>
        )}
      </section>

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

/**
 * Small inline component for "upcoming events" homepage preview.
 * Pulls from GET /events/upcoming?limit=3. Hides itself if backend returns
 * nothing (e.g. before any events exist).
 */
function UpcomingEventsPreview() {
  const [events, setEvents] = useState([]);
  useEffect(() => {
    api
      .get("/events/upcoming", { params: { limit: 3 } })
      .then((r) => setEvents(r.data || []))
      .catch(() => setEvents([]));
  }, []);

  if (!events.length) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 section-y border-t border-border">
      <div className="flex items-baseline justify-between mb-8">
        <h2 className="font-headline font-bold text-site-text" style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }}>
          אירועים קרובים 📅
        </h2>
        <Link href="/events" className="text-primary hover:underline text-sm">
          לכל האירועים ←
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {events.map((ev) => (
          <Link
            key={ev.id}
            href={`/events/${ev.id}`}
            className="bg-background border border-border rounded-[16px] overflow-hidden hover:shadow-md transition"
          >
            {ev.image_url && (
              <div
                className="h-40 bg-cover bg-center"
                style={{ backgroundImage: `url(${ev.image_url})` }}
              />
            )}
            <div className="p-4">
              <p className="text-primary text-sm font-semibold mb-1">
                {formatEventDate(ev.event_date)} {ev.event_time && `· ${ev.event_time.slice(0, 5)}`}
              </p>
              <h3 className="font-headline text-xl font-bold text-site-text mb-1">{ev.title}</h3>
              <p className="text-sm text-site-muted mb-2">
                {ev.producer_name} · {ev.city}
              </p>
              <p className="text-sm text-accent font-semibold">
                {ev.price > 0 ? `₪${ev.price}` : "חינם"}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function formatEventDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("he-IL", { day: "numeric", month: "long" });
  } catch {
    return iso;
  }
}
