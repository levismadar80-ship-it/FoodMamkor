"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CookingPot, Grains } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import CitySearch from "@/components/CitySearch";
import Breadcrumb from "@/components/Breadcrumb";
import ExperienceCard from "@/components/ExperienceCard";
import CalendarView from "@/components/CalendarView";

// API filter values are Hebrew strings (server-side enum). Keep keys
// as the wire format; localize labels via t().
const CATEGORY_KEYS = [
  { key: "", labelKey: "all" },
  { key: "סדנה", labelKey: "workshop" },
  { key: "סיור", labelKey: "tour" },
  { key: "שוק", labelKey: "market" },
  { key: "קטיף", labelKey: "harvest" },
  { key: "טעימות", labelKey: "tasting" },
  { key: "אחר", labelKey: "other" },
];

// Narrower set for the experiences tab — these come from the
// community side, not producer farms, so the vocabulary is different.
const EXPERIENCE_CATEGORY_KEYS = [
  { key: "", labelKey: "all" },
  { key: "בישול", labelKey: "cooking" },
  { key: "תזונה", labelKey: "nutrition" },
  { key: "סיור אוכל", labelKey: "food_tour" },
  { key: "חקלאות", labelKey: "agriculture" },
  { key: "טעימות", labelKey: "tasting" },
  { key: "סדנה", labelKey: "workshop" },
  { key: "אחר", labelKey: "other" },
];

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("he-IL", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return iso;
  }
}

function formatTime(t) {
  if (!t) return "";
  return t.slice(0, 5);
}

export default function EventsPage() {
  const t = useTranslations("events.list");
  const tCat = useTranslations("events.categories");
  const tExpCat = useTranslations("events.experience_categories");
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

  // Backward-compatibility alias so the existing render code below
  // keeps using `events` even when the tab is experiences.
  const events = rows;
  const activeCategories =
    tab === "experiences" ? EXPERIENCE_CATEGORY_KEYS : CATEGORY_KEYS;
  const categoryLabel = (entry) =>
    tab === "experiences" ? tExpCat(entry.labelKey) : tCat(entry.labelKey);

  const groupedByMonth = useMemo(() => {
    const groups = {};
    for (const ev of events) {
      const d = new Date(ev.event_date);
      const key = d.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
      if (!groups[key]) groups[key] = [];
      groups[key].push(ev);
    }
    return groups;
  }, [events]);

  return (
    <div>
      {/* Header — PREMIUM_DESIGN: Ken Burns background image (harvest
          scene) behind the title, dark overlay preserves contrast. */}
      <section className="relative text-white py-16 overflow-hidden">
        <div
          className="kenburns-right absolute"
          style={{
            inset: "-5%",
            backgroundImage:
              "url(https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&auto=format&q=80&fm=webp)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(46,74,46,0.80) 0%, rgba(46,74,46,0.90) 100%)",
          }}
        />
        <div className="relative max-w-5xl mx-auto px-4 text-center">
          <h1 className="font-headline text-4xl md:text-5xl font-bold mb-3">
            {t("title")}
          </h1>
          <p className="text-green-50 text-lg">
            {t("subtitle")}
          </p>
        </div>
      </section>

      {/* Breadcrumb */}
      <div className="max-w-5xl mx-auto px-4 pt-4">
        <Breadcrumb items={[{ href: "/", label: t("breadcrumb_home") }, { label: t("breadcrumb_events") }]} />
      </div>

      {/* Tabs — combine producer events and community experiences */}
      <div className="max-w-5xl mx-auto px-4 pt-4">
        <div role="tablist" className="flex gap-2 border-b border-border">
          <button
            role="tab"
            aria-selected={tab === "events"}
            onClick={() => switchTab("events")}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition ${
              tab === "events"
                ? "border-primary text-primary"
                : "border-transparent text-fg-muted hover:text-primary"
            }`}
          >
            <span className="inline-flex items-center gap-1"><Grains size={16} className="text-current" />{t("tab_events")}</span>
          </button>
          <button
            role="tab"
            aria-selected={tab === "experiences"}
            onClick={() => switchTab("experiences")}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition ${
              tab === "experiences"
                ? "border-primary text-primary"
                : "border-transparent text-fg-muted hover:text-primary"
            }`}
          >
            <span className="inline-flex items-center gap-1"><CookingPot size={16} className="text-current" />{t("tab_experiences")}</span>
          </button>
          <Link
            href={tab === "experiences" ? "/experiences/new" : "/producer/dashboard/events/new"}
            className="ms-auto text-sm text-primary hover:underline self-center"
          >
            {tab === "experiences" ? t("submit_experience") : t("add_event")} ←
          </Link>
        </div>
      </div>

      {/* View-mode toggle — list vs calendar */}
      <div className="max-w-5xl mx-auto px-4 pt-4">
        <div
          role="tablist"
          aria-label={t("view_mode_label")}
          className="inline-flex gap-1 rounded-lg bg-green-50 p-1"
        >
          <button
            role="tab"
            aria-selected={view === "list"}
            onClick={() => setView("list")}
            className={`px-4 py-2 text-sm rounded-lg transition ${
              view === "list"
                ? "bg-primary text-white"
                : "text-site-text hover:bg-background"
            }`}
          >
            {t("view_list")}
          </button>
          <button
            role="tab"
            aria-selected={view === "calendar"}
            onClick={() => setView("calendar")}
            className={`px-4 py-2 text-sm rounded-lg transition ${
              view === "calendar"
                ? "bg-primary text-white"
                : "text-site-text hover:bg-background"
            }`}
          >
            {t("view_calendar")}
          </button>
        </div>
      </div>

      {/* Filters */}
      <section className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <CitySearch
            id="events-city"
            label={t("filter_city_label")}
            value={city}
            onChange={setCity}
            placeholder={t("filter_city_placeholder")}
            className="md:w-64"
          />
          <div className="flex flex-wrap gap-2">
            {activeCategories.map((cat) => (
              <button
                key={cat.key || "all"}
                onClick={() => setCategory(cat.key)}
                className={`px-3 py-1 rounded-full text-sm transition ${
                  category === cat.key
                    ? "bg-primary text-white"
                    : "bg-white text-site-text border border-border hover:bg-green-50"
                }`}
              >
                {categoryLabel(cat)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-center text-fg-muted py-12">
            {tab === "experiences" ? t("loading_experiences") : t("loading_events")}
          </p>
        ) : events.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">
              {tab === "experiences" ? "🌱" : "📅"}
            </p>
            <p className="text-fg-muted">
              {tab === "experiences"
                ? t("empty_experiences")
                : t("empty_events")}
            </p>
          </div>
        ) : view === "calendar" ? (
          <CalendarView
            items={events}
            linkPrefix={tab === "experiences" ? "/experiences" : "/events"}
          />
        ) : (
          <div className="space-y-12">
            {Object.entries(groupedByMonth).map(([month, monthEvents]) => (
              <div key={month}>
                <h2 className="font-headline text-2xl font-bold text-site-text mb-6 border-b border-border pb-2">
                  {month}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {monthEvents.map((row) =>
                    tab === "experiences" ? (
                      <ExperienceCard key={row.id} experience={row} />
                    ) : (
                      <EventCard key={row.id} event={row} freeLabel={t("free")} />
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EventCard({ event, freeLabel }) {
  return (
    <Link
      href={`/events/${event.id}`}
      className="bg-background border border-border rounded-[16px] overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition flex flex-col"
    >
      {event.image_url ? (
        <div
          className="h-44 bg-cover bg-center"
          style={{ backgroundImage: `url(${event.image_url})` }}
        />
      ) : (
        <div className="h-44 bg-green-50 flex items-center justify-center text-5xl">
          📅
        </div>
      )}
      <div className="p-4 flex-1 flex flex-col">
        <p className="text-primary text-sm font-semibold mb-1">
          {formatDate(event.event_date)}
          {event.event_time && ` · ${formatTime(event.event_time)}`}
        </p>
        <h3 className="font-headline text-xl font-bold text-site-text mb-1">
          {event.title}
        </h3>
        <p className="text-sm text-fg-muted mb-2">
          {event.producer_name} · {event.city}
        </p>
        {event.description && (
          <p className="text-sm text-site-text/85 line-clamp-2 mb-3">{event.description}</p>
        )}
        <div className="mt-auto flex items-center justify-between pt-3 border-t border-border">
          <span className="bg-green-50 text-primary text-xs px-2 py-1 rounded-full">
            {event.category}
          </span>
          <span className="text-accent font-semibold text-sm">
            {event.price > 0 ? `₪${event.price}` : freeLabel}
          </span>
        </div>
      </div>
    </Link>
  );
}
