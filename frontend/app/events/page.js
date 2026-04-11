"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import EventCard from "@/components/EventCard";

const TYPE_FILTERS = [
  { value: "", label: "הכל" },
  { value: "event", label: "אירועים" },
  { value: "experience", label: "חוויות" },
];

const CATEGORIES = [
  { value: "", label: "כל הקטגוריות" },
  { value: "בישול", label: "בישול 🍳" },
  { value: "חקלאות", label: "חקלאות 🌾" },
  { value: "טעימות", label: "טעימות 🍷" },
  { value: "סדנה", label: "סדנה 🎨" },
  { value: "תזונה", label: "תזונה 🥗" },
];

export default function EventsPage() {
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = {};
    if (type) params.type = type;
    if (category) params.category = category;
    if (city) params.city = city;
    setLoading(true);
    api
      .get("/events", { params })
      .then((r) => {
        setEvents(r.data);
        setError("");
      })
      .catch((e) => setError(e.response?.data?.detail || "שגיאה בטעינה"))
      .finally(() => setLoading(false));
  }, [type, category, city]);

  const cities = useMemo(() => {
    const set = new Set();
    events.forEach((e) => e.city && set.add(e.city));
    return Array.from(set).sort();
  }, [events]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            אירועים וחוויות
          </h1>
          <p className="text-text-secondary">
            סיורי חוות, סדנאות בישול, טעימות, ימי שוק — כל מה שקורה סביבך.
          </p>
        </div>
        <Link
          href="/events/new"
          className="bg-primary text-white px-5 py-3 rounded-[12px] hover:bg-primary-light transition text-center font-medium whitespace-nowrap"
        >
          הוסף אירוע / חוויה
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white border border-border rounded-[12px] p-4 mb-6 space-y-3">
        <div className="flex flex-wrap gap-2">
          {TYPE_FILTERS.map((t) => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              className={`px-4 py-2 rounded-[12px] text-sm transition ${
                type === t.value
                  ? "bg-primary text-white"
                  : "bg-accent text-text-primary hover:bg-secondary-light"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="border border-border rounded-[12px] px-3 py-2 text-sm bg-white"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="border border-border rounded-[12px] px-3 py-2 text-sm bg-white"
          >
            <option value="">כל הערים</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {(type || category || city) && (
            <button
              onClick={() => {
                setType("");
                setCategory("");
                setCity("");
              }}
              className="text-text-secondary text-sm hover:text-primary"
            >
              נקה סינון
            </button>
          )}
        </div>
      </div>

      {loading && (
        <p className="text-text-secondary text-center py-12">
          טוענת אירועים טריים...
        </p>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-[12px] p-4 mb-6">
          {error}
        </div>
      )}
      {!loading && !error && events.length === 0 && (
        <div className="text-center py-12">
          <p className="text-text-secondary">
            לא מצאנו אירועים שתואמים לסינון — עדיין 🌱
          </p>
          <Link
            href="/events/new"
            className="inline-block mt-4 text-primary hover:underline"
          >
            הוסיפי את האירוע הראשון →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {events.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
      </div>
    </div>
  );
}
