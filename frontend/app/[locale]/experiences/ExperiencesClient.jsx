"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Leaf } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { optimizeCloudinary } from "@/lib/cloudinary";
import Breadcrumb from "@/components/Breadcrumb";
import CitySearch from "@/components/CitySearch";
import ExperienceCard from "@/components/ExperienceCard";

// MEH-797: Sapir-mapped Cloudinary asset (staging/pick-pexels-8586455, 2953×1969)
// replaces the Unsplash hero bg. w_1600 c_limit matches the old delivery width;
// f_auto,q_auto via the helper. CSS cover crops the band; scrim below keeps AA.
// REUSES: app/[locale]/home/HomeHero.jsx (optimizeCloudinary width cap, #1055)
const HERO_BG = optimizeCloudinary(
  "https://res.cloudinary.com/dfzpscjks/image/upload/staging/pick-pexels-8586455.jpg",
  { width: 1600 }
);

// API filter values are Hebrew strings (server enum). Localize labels via t().
const CATEGORY_KEYS = [
  { key: "", labelKey: "all" },
  { key: "בישול", labelKey: "cooking" },
  { key: "תזונה", labelKey: "nutrition" },
  { key: "סיור אוכל", labelKey: "food_tour" },
  { key: "חקלאות", labelKey: "agriculture" },
  { key: "טעימות", labelKey: "tasting" },
  { key: "סדנה", labelKey: "workshop" },
  { key: "אחר", labelKey: "other" },
];

export default function ExperiencesClient() {
  const t = useTranslations("experiences.list");
  const tCat = useTranslations("experiences.categories");
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
            backgroundImage: `url(${HERO_BG})`,
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
          <h1 className="font-headline-display text-4xl md:text-5xl font-bold mb-3">
            {t("title")}
          </h1>
          <p className="text-green-50 text-lg">
            {t("subtitle")}
          </p>
          <Link
            href="/experiences/new"
            className="inline-block mt-6 bg-background text-primary px-6 py-3 rounded-full font-medium hover:bg-green-50 transition"
          >
            {t("submit_cta")}
          </Link>
        </div>
      </section>

      {/* Breadcrumb */}
      <div className="max-w-5xl mx-auto px-4 pt-4">
        <Breadcrumb
          items={[
            { href: "/", label: t("breadcrumb_home") },
            { label: t("breadcrumb_experiences") },
          ]}
        />
      </div>

      {/* Cross-link to producer events */}
      <div className="max-w-5xl mx-auto px-4 pt-2">
        <Link
          href="/events?tab=experiences"
          className="text-sm text-fg-muted hover:text-primary transition"
        >
          {t("cross_link_events")}
        </Link>
      </div>

      {/* Filters */}
      <section className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <CitySearch
            id="experiences-city"
            label={t("filter_city_label")}
            value={city}
            onChange={setCity}
            placeholder={t("filter_city_placeholder")}
            className="md:w-64"
          />
          <div className="flex flex-wrap gap-2">
            {CATEGORY_KEYS.map((cat) => (
              <button
                key={cat.key || "all"}
                onClick={() => setCategory(cat.key)}
                className={`px-3 py-1 rounded-full text-sm transition ${
                  category === cat.key
                    ? "bg-primary text-white"
                    : "bg-white text-text border border-border hover:bg-green-50"
                }`}
              >
                {tCat(cat.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-center text-fg-muted py-12">
            {t("loading")}
          </p>
        ) : experiences.length === 0 ? (
          <div className="text-center py-16">
            <div className="mb-4 flex justify-center">
              <Leaf size={56} weight="duotone" className="text-primary" aria-hidden="true" />
            </div>
            <p className="text-fg-muted">
              {t("empty_title")}
            </p>
            <Link
              href="/experiences/new"
              className="inline-block mt-4 text-primary hover:underline"
            >
              {t("empty_cta")}
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
