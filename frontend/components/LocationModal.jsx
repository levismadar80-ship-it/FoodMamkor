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
  // MEH-2039: the trap needs the PANEL, not the overlay — the overlay is
  // fixed inset-0 and contains the backdrop, so scoping the focusables query
  // to it would be scoping to "the whole screen".
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  // Already present before MEH-2039 — NOT duplicated. The ticket's audit table
  // marked focus-return absent for this file; the code disagreed and the code wins.
  useFocusReturn(open);

  // MEH-2039: Esc (pre-existing) + Tab trap + initial focus + body scroll lock.
  // REUSES: LoginPromptModal.jsx:42-77 — the same four concerns in one effect,
  // copied rather than reinvented.
  useEffect(() => {
    // Modal stays mounted (renders null) when closed, so state survives a
    // close/reopen — clear any stale inline geo error on close (MEH-1192).
    if (!open) { setGeoError(""); return; }
    const onKey = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;

      // MEH-1430: the X is display:none on mobile (bottom-sheet, no X), so
      // the trap skips anything not rendered — otherwise a wrap would aim at
      // an element that cannot take focus and the Tab would leave the panel.
      const focusables = [...(panelRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) ?? [])].filter((el) => window.getComputedStyle(el).display !== "none");
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    // Initial focus goes to the CLOSE button, not the city field. Focusing a
    // text input here would raise the on-screen keyboard the instant the modal
    // opens on mobile — the primary surface. Matches CertModal
    // (KashrutBadgeStrip.jsx), which focuses its close control for the same
    // reason. The city field still receives focus on a geolocation failure,
    // where the user has been given an explicit reason to type.
    // MEH-1430: on mobile the X is hidden, so focus() on it is a no-op; fall
    // back to the panel itself (tabIndex -1) — still no keyboard raised.
    closeRef.current?.focus();
    if (document.activeElement !== closeRef.current) panelRef.current?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
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
      className="fixed inset-0 z-[9000] flex items-end sm:items-center justify-center bg-primary/10 backdrop-blur-sm sm:px-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      {/* MEH-2039: aria-label -> aria-labelledby. The panel HAS a visible <h2>,
          and APG/MDN both say the accessible name should come from it rather
          than from a parallel string a screen-reader user cannot see change. */}
      {/* MEH-1430 (C hybrid): mobile = bottom-sheet anchored to the bottom
          edge (rounded top, grab handle, no X); sm+ = the centered dialog.
          Cream surface (bg-background), primary-tinted backdrop above. The
          bottom padding clears the iOS home indicator on the sheet. */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="bg-background rounded-t-[24px] sm:rounded-[16px] shadow-[0_8px_40px_rgba(0,0,0,0.15)] w-full sm:max-w-md px-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6 relative overflow-hidden animate-[slide-up_0.2s_ease-out] focus:outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-modal-title"
        aria-describedby="location-modal-subtitle"
      >
        {/* MEH-2038: end-4 (visual LEFT in RTL) — the X mirrors to the END of
            the reading direction. At start-4 it sat exactly where the Hebrew
            <h2>/<p> begin and covered them. bg-background replaces
            bg-background-secondary, which matched no token in
            tailwind.tokens.json and rendered transparent — see PR for the
            measured contrast ratios. */}
        {/* MEH-1430: map-contour texture — decorative, primary @6%, top-END
            corner only (end-0 mirrors with the reading direction). */}
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 160 160"
          className="pointer-events-none absolute top-0 end-0 w-40 h-40 text-primary opacity-[0.06]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M160 18c-22 4-38 14-46 30s-4 34-20 44-38 6-52 18-18 32-14 50" />
          <path d="M160 40c-16 3-28 11-33 23s-2 27-15 36-30 6-42 15-14 24-11 46" />
          <path d="M160 62c-11 2-19 8-22 17s0 19-9 26-22 5-31 12-10 18-8 43" />
          <path d="M160 86c-7 1-12 5-13 11s1 12-5 17-14 4-20 9-6 12-5 37" />
          <circle cx="132" cy="112" r="6" />
        </svg>

        {/* MEH-1430: grab handle — visual affordance only (no gesture JS);
            dismissal stays backdrop tap / Esc / «לא עכשיו». Mobile only. */}
        <div className="flex justify-center pb-3 sm:hidden" aria-hidden="true">
          <div className="w-11 h-[5px] rounded-full bg-border" />
        </div>

        {/* MEH-1430: the X exists on desktop only (sm+); the sheet has none.
            MEH-2306: z-10 because the h2/p below are `relative` (to paint over
            the contour SVG) and come later in the DOM, so without it the h2
            paints over the X and takes its clicks. */}
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="absolute z-10 top-4 end-4 w-11 h-11 rounded-full bg-background hover:bg-green-50 hidden sm:flex items-center justify-center text-text transition-colors"
          aria-label={t("close_aria")}
        >
          <X size={16} weight="regular" />
        </button>

        {/* MEH-2038: pe-10 (40px) reserves the button's footprint — it spans
            16→60px from the card edge while the p-6 content box starts at 24px,
            so 36px of overlap needs clearing. */}
        <h2
          id="location-modal-title"
          className="relative font-headline-md text-headline-md font-bold text-text mb-1 sm:pe-10"
        >
          {t("title")}
        </h2>
        <p id="location-modal-subtitle" className="relative text-fg-muted text-sm mb-5 sm:pe-10">
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
              className="px-4 py-3 rounded-lg bg-background-alt border border-accent/40 text-gold-deep hover:bg-primary hover:border-primary hover:text-white transition-colors min-h-[44px] text-sm font-medium"
            >
              {/* MEH-1430: label wrapped so a future «· N» count (data-gated,
                  MEH-974) can append inside this span without reflowing the
                  grid — slot only, no count logic. */}
              <span className="inline-flex items-center gap-1">
                <span>{t(`popular_cities.${key}`)}</span>
              </span>
            </button>
          ))}
        </div>

        {/* MEH-1430: hairline divider, then the outlined near-me button. */}
        <div className="border-t border-border mb-4" aria-hidden="true" />

        <button
          type="button"
          onClick={handleGeo}
          disabled={geoLoading}
          className="w-full inline-flex items-center justify-center gap-2 border border-primary text-primary bg-transparent py-2.5 min-h-[44px] rounded-[10px] font-medium transition hover:bg-green-50 disabled:opacity-60 mb-3"
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
