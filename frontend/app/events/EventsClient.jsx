"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import CitySearch from "@/components/CitySearch";
import Breadcrumb from "@/components/Breadcrumb";
import ExperienceCard from "@/components/ExperienceCard";

const CATEGORIES = [
  { key: "", label: "הכל" },
  { key: "סדנה", label: "סדנה" },
  { key: "סיור", label: "סיור" },
  { key: "שוק", label: "שוק" },
  { key: "קטיף", label: "קטיף" },
  { key: "טעימות", label: "טעימות" },
  { key: "אחר", label: "אחר" },
];

// Narrower set for the experiences tab — these come from the
// community side, not producer farms, so the vocabulary is different.
const EXPERIENCE_CATEGORIES = [
  { key: "", label: "הכל" },
  { key: "בישול", label: "בישול" },
  { key: "תזונה", label: "תזונה" },
  { key: "סיור אוכל", label: "סיור אוכל" },
  { key: "חקלאות", label: "חקלאות" },
  { key: "טעימות", label: "טעימות" },
  { key: "סדנה", label: "סדנה" },
  { key: "אחר", label: "אחר" },
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
  const search = useSearchParams();
  const router = useRouter();
  // Tab state lives in the URL so /events?tab=experiences is a real
  // deep-link and survives refresh / share / bookmark.
  const initialTab = search.get("tab") === "experiences" ? "experiences" : "events";
  const [tab, setTab] = useState(initialTab);

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
    tab === "experiences" ? EXPERIENCE_CATEGORIES : CATEGORIES;

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
              "url(https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&auto=format&q=80)",
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
            אירועים בחוות ואצל בתי עסק
          </h1>
          <p className="text-light text-lg">
            סדנאות, סיורים, ימים פתוחים וטעימות — ישר מהמקור
          </p>
        </div>
      </section>

      {/* Breadcrumb */}
      <div className="max-w-5xl mx-auto px-4 pt-4">
        <Breadcrumb items={[{ href: "/", label: "בית" }, { label: "אירועים" }]} />
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
                : "border-transparent text-site-muted hover:text-primary"
            }`}
          >
            🌾 אירועים בחוות
          </button>
          <button
            role="tab"
            aria-selected={tab === "experiences"}
            onClick={() => switchTab("experiences")}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition ${
              tab === "experiences"
                ? "border-primary text-primary"
                : "border-transparent text-site-muted hover:text-primary"
            }`}
          >
            🍳 חוויות וסדנאות
          </button>
          <Link
            href={tab === "experiences" ? "/experiences/new" : "/producer/dashboard/events/new"}
            className="ms-auto text-sm text-primary hover:underline self-center"
          >
            {tab === "experiences" ? "הגישי חוויה" : "הוסיפי אירוע"} ←
          </Link>
        </div>
      </div>

      {/* Filters */}
      <section className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <CitySearch
            id="events-city"
            label="סנן לפי עיר"
            value={city}
            onChange={setCity}
            placeholder="חפשי עיר..."
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
                    : "bg-white text-site-text border border-border hover:bg-light"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-center text-site-muted py-12">
            {tab === "experiences" ? "טוענת חוויות..." : "טוענת אירועים..."}
          </p>
        ) : events.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">
              {tab === "experiences" ? "🌱" : "📅"}
            </p>
            <p className="text-site-muted">
              {tab === "experiences"
                ? "לא מצאנו חוויות שתואמות לסינון — עדיין"
                : "אין אירועים שתואמים לסינון הנוכחי — עדיין 🌱"}
            </p>
          </div>
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
                      <EventCard key={row.id} event={row} />
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

function EventCard({ event }) {
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
        <div className="h-44 bg-light flex items-center justify-center text-5xl">
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
        <p className="text-sm text-site-muted mb-2">
          {event.producer_name}
          {event.producer_name && event.city && " · "}
          {event.city}
        </p>
        {event.description && (
          <p className="text-sm text-site-text/85 line-clamp-2 mb-3">{event.description}</p>
        )}
        <div className="mt-auto flex items-center justify-between pt-3 border-t border-border">
          {event.category ? (
            <span className="bg-light text-primary text-xs px-2 py-1 rounded-full">
              {event.category}
            </span>
          ) : <span />}
          <span className="text-accent font-semibold text-sm">
            {event.price > 0 ? `₪${event.price}` : "חינם"}
          </span>
        </div>
      </div>
    </Link>
  );
}
