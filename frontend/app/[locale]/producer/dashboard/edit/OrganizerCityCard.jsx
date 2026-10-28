"use client";

/**
 * Module:   OrganizerCityCard
 * Purpose:  An organizer changes the city shown on her public page.
 * Touches:  PUT /producers/me { city } — accepted for kind='organizer' only
 *           (producer_me.py _apply_organizer_city).
 * Does NOT: edit a business's city — that follows the primary location row
 *           (LocationsEditor.jsx), and the same PUT ignores `city` for a
 *           business. Mounted in the «קשר» group for organizers only (page.js).
 * Related:  app/[locale]/organizers/[slug]/page.js (where the city shows),
 *           RegisterProducerClient.jsx (the same CitySearch at registration).
 * History:  MEH-2475 (creation).
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import CitySearch from "@/components/CitySearch";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";

export default function OrganizerCityCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.organizer_city");
  const [city, setCity] = useState(profile.city || "");
  const [savedCity, setSavedCity] = useState(profile.city || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const trimmed = city.trim();
  const dirty = trimmed !== savedCity.trim();
  useEffect(() => {
    reportDirty("organizerCity", dirty);
    return () => reportDirty("organizerCity", false);
  }, [dirty, reportDirty]);

  const save = async () => {
    if (!dirty || !trimmed) return;
    setSaving(true);
    setError("");
    try {
      await api.put("/producers/me", { city: trimmed });
      setSavedCity(trimmed);
      setCity(trimmed);
      onSave({ city: trimmed });
      showToast.success(t("saved"));
    } catch {
      setError(t("error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="organizer-city-card">
      <CitySearch
        id="organizer-city"
        labelVisible
        label={t("label")}
        placeholder={t("label")}
        value={city}
        onChange={(v) => setCity(v)}
      />
      <p className="text-xs text-fg-muted">{t("hint")}</p>
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={save}
        disabled={!dirty || !trimmed || saving}
        className="min-h-[44px] px-5 rounded-[10px] bg-primary text-white text-sm font-medium disabled:opacity-50 focus-ring"
      >
        {saving ? t("saving") : t("save")}
      </button>
    </div>
  );
}
