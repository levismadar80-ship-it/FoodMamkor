/* eslint-disable max-lines-per-function, complexity, security/detect-object-injection */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import InfoTooltip from "@/components/InfoTooltip";

export default function AdminSettingsPage() {
  const t = useTranslations("admin");
  const [settings, setSettings] = useState(null);
  // MEH-250 — pristine copy of what the server returned; compared to
  // `settings` to compute the diff for the confirm dialog + disable the
  // Save button when nothing has changed.
  const [originalSettings, setOriginalSettings] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tests, setTests] = useState({});
  // MEH-509 PR2a — vacation mode is persisted in the same admin_settings
  // table but driven through the typed /admin/settings/vacation endpoint
  // so we never serialize a stale return_date when the toggle flips off.
  const [vacation, setVacation] = useState({ active: false, return_date: "" });
  const [vacationOriginal, setVacationOriginal] = useState({ active: false, return_date: "" });
  const [vacationSaving, setVacationSaving] = useState(false);
  const [vacationToast, setVacationToast] = useState(null);
  const [vacationError, setVacationError] = useState(null);

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
    api
      .get("/admin/settings/vacation")
      .then((response) => {
        const next = {
          active: Boolean(response.data?.active),
          return_date: response.data?.return_date || "",
        };
        setVacation(next);
        setVacationOriginal(next);
      })
      .catch(() => {
        // Non-fatal — main settings still render; vacation panel stays at defaults.
      });
  }, []);

  if (loadError) return <div className="text-red-600 text-sm">{t("settings.load_error")}</div>;
  if (!settings) return <div className="text-text-secondary">{t("common.loading")}</div>;

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
    if (!globalThis.confirm(`${t("settings.save.confirm_prefix")}\n\n${summary}`)) {
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

  const vacationDirty =
    vacation.active !== vacationOriginal.active ||
    vacation.return_date !== vacationOriginal.return_date;
  const vacationCanSave =
    vacationDirty && (!vacation.active || Boolean(vacation.return_date));

  const saveVacation = async () => {
    if (!vacationCanSave) return;
    setVacationError(null);
    setVacationToast(null);
    setVacationSaving(true);
    try {
      const payload = vacation.active
        ? { active: true, return_date: vacation.return_date }
        : { active: false, return_date: null };
      const response = await api.post("/admin/settings/vacation", payload);
      const persisted = {
        active: Boolean(response.data?.active),
        return_date: response.data?.return_date || "",
      };
      setVacation(persisted);
      setVacationOriginal(persisted);
      setVacationToast(
        persisted.active
          ? t("settings.sections.vacation_saved_on", { date: persisted.return_date })
          : t("settings.sections.vacation_saved_off"),
      );
    } catch {
      setVacationError(t("settings.sections.vacation_error"));
    } finally {
      setVacationSaving(false);
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
      <h1 className="text-2xl font-bold">{t("settings.title")}</h1>

      <div className="bg-white border border-border rounded-[12px] p-5 space-y-4">
        <h2 className="font-semibold">{t("settings.sections.notifications")}</h2>
        <Field label={t("settings.fields.admin_email")}>
          <input
            type="email"
            dir="ltr"
            value={settings.admin_email || ""}
            onChange={(event) => update("admin_email", event.target.value)}
            className="w-full border border-border rounded-[12px] px-3 py-2"
            placeholder="admin@mehamakor.co.il"
          />
        </Field>
        <Field label={t("settings.fields.admin_whatsapp")}>
          <input
            value={settings.admin_whatsapp || ""}
            onChange={(event) => update("admin_whatsapp", event.target.value)}
            className="w-full border border-border rounded-[12px] px-3 py-2"
            placeholder="+972501234567"
          />
        </Field>
      </div>

      <div className="bg-white border border-border rounded-[12px] p-5 space-y-4">
        <h2 className="font-semibold">{t("settings.sections.freemium")}</h2>
        <Field label={t("settings.fields.premium_price")}>
          <input
            type="number"
            value={settings.freemium_premium_price || ""}
            onChange={(event) => update("freemium_premium_price", event.target.value)}
            className="w-full border border-border rounded-[12px] px-3 py-2"
            placeholder="49"
          />
        </Field>
        <Field label={t("settings.fields.free_image_limit")}>
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
          {t("settings.sections.holiday")}
          <InfoTooltip
            content={t("settings.sections.holiday_tooltip")}
            label={t("settings.sections.holiday_tooltip_label")}
            position="bottom"
          />
        </h2>
        <p className="text-xs text-text-secondary">{t("settings.sections.holiday_hint")}</p>
        <div className="flex items-center justify-between">
          <span className="text-sm">{t("settings.sections.holiday_active")}</span>
          <button
            role="switch"
            aria-checked={settings.holiday_override_enabled === "true"}
            onClick={() => update("holiday_override_enabled", settings.holiday_override_enabled === "true" ? "false" : "true")}
            className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${settings.holiday_override_enabled === "true" ? "bg-primary" : "bg-gray-200"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${settings.holiday_override_enabled === "true" ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>
        <Field label={t("settings.fields.holiday_key_label")}>
          <select
            value={settings.holiday_override_key || ""}
            onChange={(event) => update("holiday_override_key", event.target.value)}
            className="w-full border border-border rounded-[12px] px-3 py-2 bg-white"
          >
            <option value="">{t("settings.fields.holiday_none")}</option>
            <option value="pesach">{t("settings.fields.holiday_pesach")}</option>
            <option value="shavuot">{t("settings.fields.holiday_shavuot")}</option>
            <option value="rosh_hashana">{t("settings.fields.holiday_rosh_hashana")}</option>
            <option value="sukkot">{t("settings.fields.holiday_sukkot")}</option>
            <option value="chanuka">{t("settings.fields.holiday_chanuka")}</option>
            <option value="tu_bishvat">{t("settings.fields.holiday_tu_bishvat")}</option>
          </select>
        </Field>
      </div>

      <div className="bg-white border border-border rounded-[12px] p-5 space-y-4">
        <h2 className="font-semibold">
          {t("settings.sections.friday_mode")}
          <InfoTooltip
            content={t("settings.sections.friday_tooltip")}
            label={t("settings.sections.friday_tooltip_label")}
            position="bottom"
          />
        </h2>
        <p className="text-xs text-text-secondary">
          {t("settings.sections.friday_hint")}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-sm">{t("settings.sections.friday_active")}</span>
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

      {/* MEH-509 PR2a — vacation mode (state only; PR2b watchdog consumes it). */}
      <div className="bg-white border border-border rounded-[12px] p-5 space-y-4">
        <h2 className="font-semibold">
          {t("settings.sections.vacation")}
          <InfoTooltip
            content={t("settings.sections.vacation_tooltip")}
            label={t("settings.sections.vacation_tooltip_label")}
            position="bottom"
          />
        </h2>
        <p className="text-xs text-text-secondary">{t("settings.sections.vacation_hint")}</p>
        <div className="flex items-center justify-between">
          <span className="text-sm">{t("settings.sections.vacation_active")}</span>
          <button
            role="switch"
            aria-checked={vacation.active}
            onClick={() => {
              setVacationToast(null);
              setVacationError(null);
              setVacation({ ...vacation, active: !vacation.active });
            }}
            className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${vacation.active ? "bg-primary" : "bg-gray-200"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${vacation.active ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>
        {vacation.active && (
          <Field label={t("settings.sections.vacation_return_label")}>
            <input
              type="date"
              dir="ltr"
              value={vacation.return_date || ""}
              onChange={(event) => {
                setVacationToast(null);
                setVacationError(null);
                setVacation({ ...vacation, return_date: event.target.value });
              }}
              className="w-full border border-border rounded-[12px] px-3 py-2"
            />
          </Field>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={saveVacation}
            disabled={vacationSaving || !vacationCanSave}
            className="bg-primary text-white px-5 py-2 rounded-[12px] text-sm disabled:opacity-50"
          >
            {vacationSaving ? t("settings.save.saving") : t("settings.sections.vacation_save")}
          </button>
          {vacation.active && !vacation.return_date && (
            <span className="text-xs text-red-600">
              {t("settings.sections.vacation_date_required")}
            </span>
          )}
          {vacationToast && (
            <span className="text-sm text-primary">{vacationToast}</span>
          )}
          {vacationError && (
            <span className="text-sm text-red-600">{vacationError}</span>
          )}
        </div>
      </div>

      <div className="bg-white border border-border rounded-[12px] p-5 space-y-3">
        <h2 className="font-semibold">{t("settings.sections.tests")}</h2>
        {[
          { key: "whatsapp", label: "WhatsApp" },
          { key: "cloudinary", label: "Cloudinary" },
        ].map(({ key, label }) => {
          const result = tests[key];
          let statusText = t("settings.tests.not_configured");
          if (result?.loading) statusText = t("settings.tests.testing");
          else if (result?.ok) statusText = t("settings.tests.connected");
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
                  {t("settings.tests.test_btn")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white border border-border rounded-[12px] p-5">
        <h2 className="font-semibold mb-2">{t("settings.sections.categories")}</h2>
        <p className="text-sm text-text-secondary mb-3">{t("settings.sections.categories_hint")}</p>
        <Link href="/admin/content" className="text-primary text-sm hover:underline">
          {t("settings.sections.categories_link")}
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !isDirty}
          className="bg-primary text-white px-5 py-2 rounded-[12px] text-sm disabled:opacity-50"
          title={isDirty ? undefined : t("settings.save.nothing_to_save_title")}
        >
          {saving ? t("settings.save.saving") : t("settings.save.submit")}
        </button>
        {isDirty && !saving && (
          <span className="text-xs text-site-muted">
            {t("settings.save.unsaved_count", { count: changedKeys.length })}
          </span>
        )}
        {saved && !isDirty && <span className="text-sm text-primary">{t("common.saved_check")}</span>}
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
