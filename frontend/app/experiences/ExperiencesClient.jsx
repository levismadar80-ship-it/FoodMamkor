"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import Breadcrumb from "@/components/Breadcrumb";
import CitySearch from "@/components/CitySearch";
import ExperienceCard from "@/components/ExperienceCard";

const CATEGORIES = [
  { key: "", label: "הכל" },
  { key: "בישול", label: "בישול" },
  { key: "תזונה", label: "תזונה" },
  { key: "סיור אוכל", label: "סיור אוכל" },
  { key: "חקלאות", label: "חקלאות" },
  { key: "טעימות", label: "טעימות" },
  { key: "סדנה", label: "סדנה" },
  { key: "אחר", label: "אחר" },
];

export default function ExperiencesClient() {
  const [experiences, setExperiences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, category]);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (city) params.city = city;
      if (category) params.category = category;
      const r = await api.get("/experiences", { params });
      setExperiences(r.data);
    } catch {
      setExperiences([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Hero */}
      <section className="relative text-white py-16 overflow-hidden">
        <div
          className="kenburns-right absolute"
          style={{
            inset: "-5%",
            backgroundImage:
              "url(https://images.unsplash.com/photo-1556909172-54557c7e4fb7?w=1600&auto=format&q=80&fm=webp)",
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
            חוויות וסדנאות קהילתיות
          </h1>
          <p className="text-light text-lg">
            סדנאות בישול, סיורי אוכל, שיעורי תזונה — מארחים מקומיים, חוויות אמיתיות
          </p>
          <Link
            href="/experiences/new"
            className="inline-block mt-6 bg-background text-primary px-6 py-3 rounded-full font-medium hover:bg-light transition"
          >
            הגישי חוויה משלך 🌿
          </Link>
        </div>
      </section>

      {/* Breadcrumb */}
      <div className="max-w-5xl mx-auto px-4 pt-4">
        <Breadcrumb
          items={[
            { href: "/", label: "בית" },
            { label: "חוויות" },
          ]}
        />
      </div>

      {/* Cross-link to producer events */}
      <div className="max-w-5xl mx-auto px-4 pt-2">
        <Link
          href="/events?tab=experiences"
          className="text-sm text-site-muted hover:text-primary transition"
        >
          מחפשת גם אירועים בחוות? ראי את כל האירועים והחוויות ביחד ←
        </Link>
      </div>

      {/* Filters */}
      <section className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <CitySearch
            id="experiences-city"
            label="סנן לפי עיר"
            value={city}
            onChange={setCity}
            placeholder="חפשי עיר..."
            className="md:w-64"
          />
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
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
            טוענת חוויות...
          </p>
        ) : experiences.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">🌱</p>
            <p className="text-site-muted">
              לא מצאנו חוויות שתואמות לסינון — עדיין
            </p>
            <Link
              href="/experiences/new"
              className="inline-block mt-4 text-primary hover:underline"
            >
              הגישי את החוויה הראשונה ←
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {experiences.map((ex) => (
              <ExperienceCard key={ex.id} experience={ex} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
