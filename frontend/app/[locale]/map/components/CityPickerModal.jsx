import { useTranslations } from "next-intl";
import { X } from "@phosphor-icons/react";

import CitySearch from "@/components/CitySearch";

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
// MEH-473: popular-city slugs map to translation keys; raw HE label
// is the value that's sent to onSelectCity (the filter API still
// keys on Hebrew city names per Wave 2's category.<slug> pattern).
const POPULAR_CITIES = [
  { slug: "tel_aviv", he: "תל אביב" },
  { slug: "jerusalem", he: "ירושלים" },
  { slug: "haifa", he: "חיפה" },
  { slug: "beersheba", he: "באר שבע" },
];

export default function CityPickerModal({ open, onClose, onSelectCity }) {
  const t = useTranslations();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[16px] shadow-[0_8px_40px_rgba(0,0,0,0.15)] w-full max-w-sm p-5 relative">
        <button type="button" onClick={onClose} className="absolute top-3 start-3 w-8 h-8 rounded-full hover:bg-light flex items-center justify-center text-site-muted" aria-label={t("common.aria.close")}>
          <X size={16} weight="bold" />
        </button>
        <h3 className="font-headline text-lg font-bold text-site-text mb-1">{t("map.city_picker.heading")}</h3>
        <p className="text-site-muted text-sm mb-4">{t("map.city_picker.subheading")}</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {POPULAR_CITIES.map(({ slug, he }) => (
            <button key={slug} type="button" onClick={() => onSelectCity(he)} className="px-4 py-2 rounded-full text-sm font-medium border border-border bg-white text-site-text hover:border-primary hover:text-primary transition">{t(`map.city_picker.popular.${slug}`)}</button>
          ))}
        </div>
        <CitySearch id="city-picker-search" label={t("map.city_picker.other.label")} value="" onChange={(v) => { if (v.trim()) onSelectCity(v.trim()); }} placeholder={t("map.city_picker.other.placeholder")} />
        <button type="button" onClick={onClose} className="w-full mt-3 text-center text-sm text-site-muted hover:text-site-text transition py-2">{t("map.city_picker.skip")}</button>
      </div>
    </div>
  );
}
