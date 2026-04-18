"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, X } from "@phosphor-icons/react";
import CitySearch from "@/components/CitySearch";

const POPULAR_CITIES = ["תל אביב", "ירושלים", "חיפה", "באר שבע"];

export default function LocationModal({ open, onClose, onSelectCity }) {
  const [searchValue, setSearchValue] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleCityPick = (city) => {
    onSelectCity(city);
    onClose();
  };

  const handleSearchSubmit = () => {
    if (searchValue.trim()) handleCityPick(searchValue.trim());
  };

  const handleGeo = () => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&accept-language=he`,
          );
          const data = await res.json();
          const city =
            data.address?.city ||
            data.address?.town ||
            data.address?.village ||
            data.address?.hamlet ||
            "";
          if (city) handleCityPick(city);
          else handleCityPick("מיקום נוכחי");
        } catch {
          handleCityPick("מיקום נוכחי");
        } finally {
          setGeoLoading(false);
        }
      },
      () => {
        setGeoLoading(false);
        alert("לא הצלחנו לקבל את המיקום שלך");
      },
    );
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="bg-white rounded-[16px] shadow-[0_8px_40px_rgba(0,0,0,0.15)] w-full max-w-md p-6 relative animate-[slide-up_0.2s_ease-out]"
        role="dialog"
        aria-modal="true"
        aria-label="בחירת עיר"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 left-3 w-9 h-9 rounded-full hover:bg-light flex items-center justify-center text-site-muted transition focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label="סגור"
        >
          <X size={18} weight="bold" />
        </button>

        <h2 className="font-headline text-xl font-bold text-site-text mb-1">
          איפה את?
        </h2>
        <p className="text-site-muted text-sm mb-5">
          נמצא עסקים קרובים אליך
        </p>

        <CitySearch
          id="location-modal-city"
          label="חיפוש עיר"
          value={searchValue}
          onChange={(v) => {
            setSearchValue(v);
            if (v.trim()) handleCityPick(v.trim());
          }}
          onSubmit={handleSearchSubmit}
          placeholder="הקלידי שם עיר..."
          className="mb-4"
        />

        <div className="flex flex-wrap gap-2 mb-5">
          {POPULAR_CITIES.map((city) => (
            <button
              key={city}
              type="button"
              onClick={() => handleCityPick(city)}
              className="px-4 py-2 rounded-full text-sm font-medium border border-border bg-white text-site-text hover:border-primary hover:text-primary transition"
            >
              {city}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleGeo}
          disabled={geoLoading}
          className="w-full inline-flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-[10px] font-medium transition hover:bg-primary-light disabled:opacity-60 mb-3"
        >
          <Crosshair size={18} weight="bold" className={geoLoading ? "animate-spin" : ""} aria-hidden="true" />
          {geoLoading ? "מחפשת..." : "קרובים אליי"}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="w-full text-center text-sm text-site-muted hover:text-site-text transition py-2"
        >
          דלגי לעכשיו
        </button>
      </div>
    </div>
  );
}
