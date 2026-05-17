/* eslint-disable max-lines-per-function, complexity, security/detect-object-injection */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import InfoTooltip from "@/components/InfoTooltip";

export default function AdminSettingsPage() {
  const t = useTranslations("admin.settings");
  const [settings, setSettings] = useState(null);
  // MEH-250 — pristine copy of what the server returned; compared to
  // `settings` to compute the diff for the confirm dialog + disable the
  // Save button when nothing has changed.
  const [originalSettings, setOriginalSettings] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tests, setTests] = useState({});

  useEffect(() => {
    api
      .get("/admin/settings")
      .then((response) => {
        // Normalize boolean fields that some backends return as bool, not string
        const data = { ...response.data };
        data.friday_mode_override = (data.friday_mode_override === true || data.friday_mode_override === "true") ? "true" : "false";
        // Hydrate localStorage so isFridayMode() reflects the stored setting
        try {
          if (data.friday_mode_override === "true") {
            localStorage.setItem("friday_mode_override", "1");
          } else {
            localStorage.removeItem("friday_mode_override");
          }
        } catch {}
        setSettings(data);
        setOriginalSettings(data);
      })
      .catch(() => setLoadError(true));
  }, []);

  if (loadError) return <div className="text-red-600 text-sm">{t("load_error")}</div>;
  if (!settings) return <div className="text-text-secondary">{t("loading")}</div>;

  const update = (key, value) => {
    setSettings({ ...settings, [key]: value });
    setSaved(false);
  };

  // MEH-250 — diff original vs current so we can show the admin
  // exactly what's about to change and refuse no-op saves.
  const changedKeys = originalSettings
    ? Object.keys(settings).filter((key) => settings[key] !== originalSettings[key])
    : [];
  const isDirty = changedKeys.length > 0;

  const save = async () => {
    if (!isDirty) return;
    const summary = changedKeys
      .map((key) => `• ${key}: ${originalSettings[key] || "∅"} → ${settings[key] || "∅"}`)
      .join("\n");
    if (!globalThis.confirm(t("confirm_save", { summary }))) {
      return;
    }
    setSaving(true);
    try {
      await api.put("/admin/settings", settings);
      setOriginalSettings(settings);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const testService = async (name) => {
    setTests({ ...tests, [name]: { loading: true } });
    try {
      const response = await api.post(`/admin/settings/test/${name}`);
      setTests({ ...tests, [name]: response.data });
    } catch (error) {
      setTests({ ...tests, [name]: { ok: false, error: error.message } });
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <div className="bg-white border border-border rounded-[12px] p-5 space-y-4">
        <h2 className="font-semibold">{t("notifications.section_title")}</h2>
        <Field label={t("notifications.admin_email_label")}>
          <input
            type="email"
            dir="ltr"
            value={settings.admin_email || ""}
            onChange={(event) => update("admin_email", event.target.value)}
            className="w-full border border-border rounded-[12px] px-3 py-2"
            placeholder="admin@mehamakor.co.il"
          />
        </Field>
        <Field label={t("notifications.admin_whatsapp_label")}>
          <input
            value={settings.admin_whatsapp || ""}
            onChange={(event) => update("admin_whatsapp", event.target.value)}
            className="w-full border border-border rounded-[12px] px-3 py-2"
            placeholder="+972501234567"
          />
        </Field>
      </div>

      <div className="bg-white border border-border rounded-[12px] p-5 space-y-4">
        <h2 className="font-semibold">{t("freemium.section_title")}</h2>
        <Field label={t("freemium.monthly_price_label")}>
          <input
            type="number"
            value={settings.freemium_premium_price || ""}
            onChange={(event) => update("freemium_premium_price", event.target.value)}
            className="w-full border border-border rounded-[12px] px-3 py-2"
            placeholder="49"
          />
        </Field>
        <Field label={t("freemium.free_image_limit_label")}>
          <input
            type="number"
            value={settings.freemium_free_image_limit || ""}
            onChange={(event) => update("freemium_free_image_limit", event.target.value)}
            className="w-full border border-border rounded-[12px] px-3 py-2"
            placeholder="3"
          />
        </Field>
      </div>

      <div className="bg-white border border-border rounded-[12px] p-5 space-y-4">
        <h2 className="font-semibold">
          {t("holiday.section_title")}
          <InfoTooltip
            content={t("holiday.tooltip_content")}
            label={t("holiday.tooltip_label")}
            position="bottom"
          />
        </h2>
        <p className="text-xs text-text-secondary">{t("holiday.section_description")}</p>
        <div className="flex items-center justify-between">
          <span className="text-sm">{t("holiday.switch_label")}</span>
          <button
            role="switch"
            aria-checked={settings.holiday_override_enabled === "true"}
            onClick={() => update("holiday_override_enabled", settings.holiday_override_enabled === "true" ? "false" : "true")}
            className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${settings.holiday_override_enabled === "true" ? "bg-primary" : "bg-gray-200"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${settings.holiday_override_enabled === "true" ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>
        <Field label={t("holiday.key_select_label")}>
          <select
            value={settings.holiday_override_key || ""}
            onChange={(event) => update("holiday_override_key", event.target.value)}
            className="w-full border border-border rounded-[12px] px-3 py-2 bg-white"
          >
            <option value="">{t("holiday.key_none")}</option>
            <option value="pesach">{t("holiday.key_pesach")}</option>
            <option value="shavuot">{t("holiday.key_shavuot")}</option>
            <option value="rosh_hashana">{t("holiday.key_rosh_hashana")}</option>
            <option value="sukkot">{t("holiday.key_sukkot")}</option>
            <option value="chanuka">{t("holiday.key_chanuka")}</option>
            <option value="tu_bishvat">{t("holiday.key_tu_bishvat")}</option>
          </select>
        </Field>
      </div>

      <div className="bg-white border border-border rounded-[12px] p-5 space-y-4">
        <h2 className="font-semibold">
          {t("friday.section_title")}
          <InfoTooltip
            content={t("friday.tooltip_content")}
            label={t("friday.tooltip_label")}
            position="bottom"
          />
        </h2>
        <p className="text-xs text-text-secondary">
          {t("friday.section_description")}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-sm">{t("friday.switch_label")}</span>
          <button
            role="switch"
            aria-checked={settings.friday_mode_override === "true"}
            onClick={() => {
              const next = settings.friday_mode_override === "true" ? "false" : "true";
              update("friday_mode_override", next);
              // Sync to localStorage so isFridayMode() picks it up immediately
              if (next === "true") {
                localStorage.setItem("friday_mode_override", "1");
              } else {
                localStorage.removeItem("friday_mode_override");
              }
            }}
            className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${settings.friday_mode_override === "true" ? "bg-primary" : "bg-gray-200"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${settings.friday_mode_override === "true" ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>
      </div>

      <div className="bg-white border border-border rounded-[12px] p-5 space-y-3">
        <h2 className="font-semibold">{t("tests.section_title")}</h2>
        {[
          { key: "whatsapp", label: "WhatsApp" },
          { key: "cloudinary", label: "Cloudinary" },
        ].map(({ key, label }) => {
          const result = tests[key];
          let statusText = t("tests.status_unconfigured");
          if (result?.loading) statusText = t("tests.status_loading");
          else if (result?.ok) statusText = t("tests.status_ok");
          return (
            <div key={key} className="flex items-center justify-between gap-3 border-b border-border last:border-0 pb-2 last:pb-0">
              <span className="text-sm">{label}</span>
              <div className="flex items-center gap-3">
                {result && (
                  <span className={`text-xs ${result.ok ? "text-primary" : "text-red-600"}`}>
                    {statusText}
                  </span>
                )}
                <button
                  onClick={() => testService(key)}
                  className="text-xs bg-secondary text-white px-3 py-1 rounded-[12px]"
                >
                  {t("tests.test_button")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white border border-border rounded-[12px] p-5">
        <h2 className="font-semibold mb-2">{t("categories.section_title")}</h2>
        <p className="text-sm text-text-secondary mb-3">{t("categories.section_description")}</p>
        <Link href="/admin/content" className="text-primary text-sm hover:underline">
          {t("categories.link_to_content")}
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !isDirty}
          className="bg-primary text-white px-5 py-2 rounded-[12px] text-sm disabled:opacity-50"
          title={isDirty ? undefined : t("save.no_changes_title")}
        >
          {saving ? t("save.saving") : t("save.submit")}
        </button>
        {isDirty && !saving && (
          <span className="text-xs text-site-muted">
            {t("save.unsaved_count", { count: changedKeys.length })}
          </span>
        )}
        {saved && !isDirty && <span className="text-sm text-primary">{t("save.saved_indicator")}</span>}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs text-text-secondary mb-1 block">{label}</span>
      {children}
    </label>
  );
}
