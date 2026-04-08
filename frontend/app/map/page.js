"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import api from "@/lib/api";
import ProducerCard from "@/components/ProducerCard";

const MapComponent = dynamic(() => import("@/components/MapComponent"), { ssr: false });

export default function MapPage() {
  const router = useRouter();
  const [allProducers, setAllProducers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [cityFilter, setCityFilter] = useState("");
  const [mapBounds, setMapBounds] = useState(null);

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data));
    loadProducers();
  }, []);

  const loadProducers = (params = {}) => {
    api.get("/producers", { params }).then((r) => setAllProducers(r.data));
  };

  const handleCategoryClick = (catId) => {
    const newCat = selectedCategory === catId ? null : catId;
    setSelectedCategory(newCat);
    const params = {};
    if (newCat) params.category = newCat;
    if (cityFilter) params.delivery_city = cityFilter;
    loadProducers(params);
  };

  const handleCityFilter = () => {
    const params = {};
    if (selectedCategory) params.category = selectedCategory;
    if (cityFilter) params.delivery_city = cityFilter;
    loadProducers(params);
  };

  const handleBoundsChange = useCallback((bounds) => {
    setMapBounds(bounds);
  }, []);

  // Filter producers by current map bounds for the grid
  const visibleProducers = mapBounds
    ? allProducers.filter((p) => {
        if (!p.lat || !p.lng) return false;
        return (
          p.lat >= mapBounds.south &&
          p.lat <= mapBounds.north &&
          p.lng >= mapBounds.west &&
          p.lng <= mapBounds.east
        );
      })
    : allProducers;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">מפת בתי עסק</h1>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <input
          type="text"
          placeholder="חפשי ירקות טריים, בשר grass-fed..."
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCityFilter()}
          className="md:w-72 border border-border rounded-[16px] px-4 py-2 bg-white"
        />
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(cat.id)}
              className={`px-3 py-1 rounded-full text-sm transition ${
                selectedCategory === cat.id
                  ? "bg-primary text-white"
                  : "bg-white text-text-secondary hover:bg-gray-50"
              }`}
            >
              {cat.emoji} {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Map */}
      <div className="h-[500px] mb-8">
        <MapComponent
          producers={allProducers}
          onProducerClick={(p) => router.push(`/producer/${p.id}`)}
          onBoundsChange={handleBoundsChange}
        />
      </div>

      {/* Producer grid below map — filtered by visible bounds */}
      <div>
        <h2 className="text-xl font-bold mb-4">
          בתי עסק באזור ({visibleProducers.length})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {visibleProducers.map((p) => (
            <ProducerCard key={p.id} producer={p} />
          ))}
        </div>
        {visibleProducers.length === 0 && (
          <p className="text-center text-text-secondary py-8">אין עסקים באזור המפה הנוכחי</p>
        )}
      </div>
    </div>
  );
}
