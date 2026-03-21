"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import api from "@/lib/api";
import CategoryTag from "@/components/CategoryTag";

const MapComponent = dynamic(() => import("@/components/MapComponent"), { ssr: false });

export default function MapPage() {
  const router = useRouter();
  const [producers, setProducers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [cityFilter, setCityFilter] = useState("");

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data));
    loadProducers();
  }, []);

  const loadProducers = (params = {}) => {
    api.get("/producers", { params }).then((r) => setProducers(r.data));
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

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">מפת יצרנים</h1>
      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar */}
        <div className="md:w-80 space-y-4">
          <div>
            <input
              type="text"
              placeholder="סנן לפי עיר..."
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCityFilter()}
              className="w-full border rounded-[12px] px-3 py-2"
            />
          </div>
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

          {/* Results list */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {producers.map((p) => (
              <button
                key={p.id}
                onClick={() => router.push(`/producer/${p.id}`)}
                className="w-full text-right bg-white rounded-[12px] p-3 hover:shadow-sm transition"
              >
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-text-secondary">{p.city}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 h-[600px]">
          <MapComponent
            producers={producers}
            onProducerClick={(p) => router.push(`/producer/${p.id}`)}
          />
        </div>
      </div>
    </div>
  );
}
