"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import api from "@/lib/api";
import ProducerCard from "@/components/ProducerCard";
import CitySearch from "@/components/CitySearch";
import Breadcrumb from "@/components/Breadcrumb";

const MapComponent = dynamic(() => import("@/components/MapComponent"), { ssr: false });

export default function MapPage() {
  const [allProducers, setAllProducers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [cityFilter, setCityFilter] = useState("");
  const [mapBounds, setMapBounds] = useState(null);
  const [activeProducerId, setActiveProducerId] = useState(null);

  const mapApiRef = useRef(null);
  const cardRefs = useRef(new Map()); // producer.id → card wrapper DOM node

  const registerMapApi = useCallback((api) => {
    mapApiRef.current = api;
  }, []);

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data));
    loadProducers();
  }, []);

  // Deep-link from /producer/:id → sessionStorage → flyTo + popup + highlight card
  useEffect(() => {
    if (allProducers.length === 0) return;
    let focus;
    try {
      const raw = sessionStorage.getItem("focusProducer");
      if (!raw) return;
      focus = JSON.parse(raw);
      sessionStorage.removeItem("focusProducer");
    } catch {
      return;
    }
    if (!focus?.id) return;
    setActiveProducerId(focus.id);

    // Give the map a tick to mount + markers to register before flying
    const t = setTimeout(() => {
      mapApiRef.current?.focusProducer(focus.id);
    }, 400);
    return () => clearTimeout(t);
  }, [allProducers]);

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

  // Card click → fly map to producer + open popup + highlight card
  const handleCardClick = useCallback((producer) => {
    if (!producer?.lat || !producer?.lng) return;
    setActiveProducerId(producer.id);
    document.getElementById("map-container")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => mapApiRef.current?.focusProducer(producer.id), 250);
  }, []);

  // Marker click → highlight matching card + scroll to it
  const handleMarkerClick = useCallback((producer) => {
    setActiveProducerId(producer.id);
    const el = cardRefs.current.get(producer.id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
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
      <Breadcrumb
        items={[{ href: "/", label: "בית" }, { label: "מפה" }]}
        className="mb-3"
      />
      <h1 className="font-headline text-3xl font-bold mb-6 text-site-text">מפת בתי עסק</h1>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <CitySearch
          id="map-city-search"
          label="סנן לפי עיר"
          value={cityFilter}
          onChange={setCityFilter}
          onSubmit={handleCityFilter}
          placeholder="חפשי עיר..."
          className="md:w-72"
        />
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(cat.id)}
              className={`px-3 py-1 rounded-full text-sm transition ${
                selectedCategory === cat.id
                  ? "bg-primary text-white"
                  : "bg-white text-site-text border border-border hover:bg-light"
              }`}
            >
              {cat.emoji} {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Map */}
      <div id="map-container" className="h-[500px] mb-8">
        <MapComponent
          producers={allProducers}
          onProducerClick={handleMarkerClick}
          onBoundsChange={handleBoundsChange}
          registerApi={registerMapApi}
        />
      </div>

      {/* Producer grid below map — filtered by visible bounds */}
      <div>
        <h2 className="font-headline text-2xl font-bold mb-4 text-site-text">
          בתי עסק באזור ({visibleProducers.length})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {visibleProducers.map((p) => (
            <div
              key={p.id}
              ref={(el) => {
                if (el) cardRefs.current.set(p.id, el);
                else cardRefs.current.delete(p.id);
              }}
            >
              <ProducerCard
                producer={p}
                active={activeProducerId === p.id}
                onClick={handleCardClick}
              />
            </div>
          ))}
        </div>
        {visibleProducers.length === 0 && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-light mb-6 text-5xl" aria-hidden="true">
              🗺️
            </div>
            <h3 className="font-headline text-xl font-bold text-site-text mb-2">
              אין עסקים באזור המפה הנוכחי 🌱
            </h3>
            <p className="text-site-muted mb-5 max-w-md mx-auto">
              נסי להזיז את המפה, להקטין את הזום, או לשנות את המסננים למעלה.
            </p>
            <Link
              href="/register/producer"
              className="inline-block border border-primary text-primary px-5 py-2 rounded-[8px] hover:bg-light transition text-sm font-medium"
            >
              מכירה מישהי? הזמיני אותה
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
