"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import CitySearch from "@/components/CitySearch";
import { useFocusReturn } from "@/lib/use-focus-return";

// City keys → HE values are the API/canonical names (Hebrew). Display labels
// resolve via t(`modals.location.popular_cities.${key}`) so /en/ shows the
// transliterated form ("Tel Aviv", "Jerusalem", etc.).
const POPULAR_CITIES = [
  { key: "tel_aviv", canonical: "תל אביב" },
  { key: "jerusalem", canonical: "ירושלים" },
  { key: "haifa", canonical: "חיפה" },
  { key: "beersheba", canonical: "באר שבע" },
];

export default function LocationModal({ open, onClose, onSelectCity }) {
  const t = useTranslations("modals.location");
  const [searchValue, setSearchValue] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const overlayRef = useRef(null);

  useFocusReturn(open);

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
          else handleCityPick(t("current_location_fallback"));
        } catch {
          handleCityPick(t("current_location_fallback"));
        } finally {
          setGeoLoading(false);
        }
      },
      () => {
        setGeoLoading(false);
        alert(t("geo_failure"));
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
        aria-label={t("aria_label")}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 start-4 w-8 h-8 rounded-full bg-background-secondary hover:bg-light flex items-center justify-center text-site-text transition-colors"
          aria-label={t("close_aria")}
        >
          <X size={16} weight="regular" />
        </button>

        <h2 className="font-headline text-xl font-bold text-site-text mb-1">
          {t("title")}
        </h2>
        <p className="text-site-muted text-sm mb-5">
          {t("subtitle")}
        </p>

        <CitySearch
          id="location-modal-city"
          label={t("search_label")}
          value={searchValue}
          onChange={(v) => {
            setSearchValue(v);
            if (v.trim()) handleCityPick(v.trim());
          }}
          onSubmit={handleSearchSubmit}
          placeholder={t("search_placeholder")}
          className="mb-4"
        />

        <div className="flex flex-wrap gap-2 mb-5">
          {POPULAR_CITIES.map(({ key, canonical }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleCityPick(canonical)}
              className="px-4 py-3 rounded-lg bg-light hover:bg-primary hover:text-white transition-colors min-h-[44px] text-site-text text-sm font-medium"
            >
              {t(`popular_cities.${key}`)}
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
          {geoLoading ? t("geo_loading") : t("geo_button")}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="w-full flex items-center justify-center text-sm text-site-muted hover:text-primary transition-colors min-h-[44px] px-4 py-3"
        >
          {t("skip")}
        </button>
      </div>
    </div>
  );
}
