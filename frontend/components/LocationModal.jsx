"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import CitySearch from "@/components/CitySearch";
import { useFocusReturn } from "@/lib/use-focus-return";
import { setUserLocation } from "@/lib/user-location";

// City keys → HE values are the API/canonical names (Hebrew). Display labels
// resolve via t(`modals.location.popular_cities.${key}`) so /en/ shows the
// transliterated form ("Tel Aviv", "Jerusalem", etc.).
const POPULAR_CITIES = [
  { key: "tel_aviv", canonical: "תל אביב-יפו" },
  { key: "jerusalem", canonical: "ירושלים" },
  { key: "haifa", canonical: "חיפה" },
  { key: "beersheba", canonical: "באר שבע" },
];

export default function LocationModal({ open, onClose, onSelectCity }) {
  const t = useTranslations("modals.location");
  const [searchValue, setSearchValue] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  // MEH-1192: inline (non-native) geolocation failure message. Replaces the
  // old native alert() so a failed/denied locate keeps the user IN the modal
  // with a path forward (pick a city) instead of a browser dead-end dialog.
  const [geoError, setGeoError] = useState("");
  const overlayRef = useRef(null);

  useFocusReturn(open);

  useEffect(() => {
    // Modal stays mounted (renders null) when closed, so state survives a
    // close/reopen — clear any stale inline geo error on close (MEH-1192).
    if (!open) { setGeoError(""); return; }
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleCityPick = (city) => {
    onSelectCity(city);
    onClose();
  };

  // MEH-1192: commit ONLY on submit. CitySearch's onChange fires per keystroke
  // (correct — it drives the dropdown); onSubmit fires on Enter / dropdown pick
  // and carries the chosen value as its argument. Same contract MapClient uses
  // (MapClient.jsx:545). Read the argument, not searchValue — when a suggestion
  // is picked CitySearch calls onChange(city) then onSubmit(city) in the same
  // tick, so the searchValue state is not yet updated.
  const handleSearchSubmit = (submitted) => {
    const city = (typeof submitted === "string" ? submitted : searchValue).trim();
    if (city) handleCityPick(city);
  };

  // MEH-1192: inline failure instead of a native alert / silent "מיקום נוכחי"
  // filter. Keep the modal open, surface the message, and focus the city field.
  const showGeoError = (message) => {
    setGeoLoading(false);
    setGeoError(message);
    document.getElementById("location-modal-city")?.focus();
  };

  const handleGeo = () => {
    if (!navigator.geolocation) return;
    setGeoError("");
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        // MEH-1192 (R1): persist the GPS fix so /map "מרחק" sort + card distance
        // labels unlock — BEFORE the Nominatim reverse-geocode below (which only
        // resolves a city name for the filter), so persistence never depends on
        // Nominatim succeeding. Third and last geolocate flow after MEH-1230.
        setUserLocation(pos.coords.latitude, pos.coords.longitude);
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
          // No city resolved → never commit the literal fallback string (it
          // matches zero businesses). Ask the user to pick a city manually.
          if (city) {
            setGeoLoading(false);
            handleCityPick(city);
          } else {
            showGeoError(t("geo_failure"));
          }
        } catch {
          showGeoError(t("geo_failure"));
        }
      },
      (err) => {
        // PERMISSION_DENIED (code 1) → stay in the modal, distinct message,
        // focus the city search. Mirrors MapClient.jsx:296. Technical failures
        // (position unavailable / timeout, codes 2/3) → generic detect message.
        showGeoError(err?.code === 1 ? t("geo_denied") : t("geo_failure"));
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
        {/* MEH-2038: end-4 (visual LEFT in RTL) — the X mirrors to the END of
            the reading direction. At start-4 it sat exactly where the Hebrew
            <h2>/<p> begin and covered them. bg-background replaces
            bg-background-secondary, which matched no token in
            tailwind.tokens.json and rendered transparent — see PR for the
            measured contrast ratios. */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 end-4 w-11 h-11 rounded-full bg-background hover:bg-green-50 flex items-center justify-center text-text transition-colors"
          aria-label={t("close_aria")}
        >
          <X size={16} weight="regular" />
        </button>

        {/* MEH-2038: pe-10 (40px) reserves the button's footprint — it spans
            16→60px from the card edge while the p-6 content box starts at 24px,
            so 36px of overlap needs clearing. REUSES: OnboardingTip.jsx:55. */}
        <h2 className="font-headline-md text-xl font-bold text-text mb-1 pe-10">
          {t("title")}
        </h2>
        <p className="text-fg-muted text-sm mb-5 pe-10">
          {t("subtitle")}
        </p>

        <CitySearch
          id="location-modal-city"
          label={t("search_label")}
          value={searchValue}
          onChange={(v) => {
            setSearchValue(v);
            if (geoError) setGeoError("");
          }}
          onSubmit={handleSearchSubmit}
          placeholder={t("search_placeholder")}
          className="mb-4"
        />

        {geoError && (
          <p role="alert" className="text-sm text-red-600 -mt-2 mb-4">
            {geoError}
          </p>
        )}

        {/* MEH-910: 2×2 grid on mobile balances the 4 city chips (was
            flex-wrap → 3 + 1 orphan at 390px); sm:flex restores the
            desktop single-row layout unchanged. */}
        <div className="grid grid-cols-2 gap-2 mb-5 sm:flex sm:flex-wrap">
          {POPULAR_CITIES.map(({ key, canonical }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleCityPick(canonical)}
              className="px-4 py-3 rounded-lg bg-green-50 hover:bg-primary hover:text-white transition-colors min-h-[44px] text-text text-sm font-medium"
            >
              {t(`popular_cities.${key}`)}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleGeo}
          disabled={geoLoading}
          className="w-full inline-flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-[10px] font-medium transition hover:bg-primary-dark disabled:opacity-60 mb-3"
        >
          <Crosshair size={18} weight="bold" className={geoLoading ? "animate-spin" : ""} aria-hidden="true" />
          {geoLoading ? t("geo_loading") : t("geo_button")}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="w-full flex items-center justify-center text-sm text-fg-muted hover:text-primary transition-colors min-h-[44px] px-4 py-3"
        >
          {t("skip")}
        </button>
      </div>
    </div>
  );
}
