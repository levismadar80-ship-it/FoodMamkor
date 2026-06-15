"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { X } from "@phosphor-icons/react";

import CitySearch from "@/components/CitySearch";
import { useFocusReturn } from "@/lib/use-focus-return";

/**
 * MEH-58 Phase 3: city picker overlay shown when the user toggles
 * the "משלוח אליי" chip without a saved city. Verbatim move of the
 * showCityPicker JSX from MapClient.jsx:857-874.
 *
 * Z-index z-[9000] preserved verbatim (above all map controls
 * including the chat z-[9999] / cookie z-[9998] tokens — see
 * .claude/rules/rtl.md → "Map z-index tokens").
 *
 * The close button uses logical `start-3` (the modal content is in
 * normal RTL flow; only the map canvas overlays need physical
 * positioning).
 */
// PR-C4a chunk 4b: consolidated with chunk-3 LocationModal — both surfaces
// now share `modals.location.popular_cities.*` keys. The `canonical` HE value
// is the data axis (sent to onSelectCity → backend search), distinct from
// the displayed label which resolves via t(`modals.location.popular_cities.${key}`).
const POPULAR_CITIES = [
  { key: "tel_aviv", canonical: "תל אביב" },
  { key: "jerusalem", canonical: "ירושלים" },
  { key: "haifa", canonical: "חיפה" },
  { key: "beersheba", canonical: "באר שבע" },
];

export default function CityPickerModal({ open, onClose, onSelectCity }) {
  const t = useTranslations();

  // MEH-230: restore focus to the trigger on close + WCAG 2.1 §2.1.2 ESC-to-close.
  useFocusReturn(open);
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="city-picker-title" className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface-floating rounded-lg border border-border w-full max-w-sm p-5 relative">
        <button type="button" onClick={onClose} className="absolute top-3 start-3 w-8 h-8 rounded-full hover:bg-green-50 flex items-center justify-center text-fg-muted" aria-label={t("common.aria.close")}>
          <X size={16} weight="bold" />
        </button>
        <h3 id="city-picker-title" className="font-headline-md text-lg font-bold text-text mb-1">{t("map.city_picker.heading")}</h3>
        <p className="text-fg-muted text-sm mb-4">{t("map.city_picker.subheading")}</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {POPULAR_CITIES.map(({ key, canonical }) => (
            <button key={key} type="button" onClick={() => onSelectCity(canonical)} className="px-4 py-2 rounded-full text-sm font-medium border border-border bg-white text-text hover:border-primary hover:text-primary transition">{t(`modals.location.popular_cities.${key}`)}</button>
          ))}
        </div>
        <CitySearch id="city-picker-search" label={t("map.city_picker.other.label")} value="" onChange={(v) => { if (v.trim()) onSelectCity(v.trim()); }} placeholder={t("map.city_picker.other.placeholder")} />
        <button type="button" onClick={onClose} className="w-full mt-3 text-center text-sm text-fg-muted hover:text-text transition py-2">{t("map.city_picker.skip")}</button>
      </div>
    </div>
  );
}
