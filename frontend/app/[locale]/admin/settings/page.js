/* eslint-disable max-lines-per-function, complexity, security/detect-object-injection */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";

export default function AdminSettingsPage() {
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

  if (loadError) return <div className="text-red-600 text-sm">שגיאה בטעינת הגדרות — נסי לרענן את הדף.</div>;
  if (!settings) return <div className="text-text-secondary">טוען...</div>;

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
    if (!globalThis.confirm(`האם לשמור את השינויים הבאים?\n\n${summary}`)) {
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
      <h1 className="text-2xl font-bold">הגדרות</h1>

      <div className="bg-white border border-border rounded-[12px] p-5 space-y-4">
        <h2 className="font-semibold">התראות</h2>
        <Field label="אימייל אדמין לקבלת התראות">
          <input
            type="email"
            dir="ltr"
            value={settings.admin_email || ""}
            onChange={(event) => update("admin_email", event.target.value)}
            className="w-full border border-border rounded-[12px] px-3 py-2"
            placeholder="admin@mehamakor.co.il"
          />
        </Field>
        <Field label="מספר ווטסאפ אדמין (E.164)">
          <input
            value={settings.admin_whatsapp || ""}
            onChange={(event) => update("admin_whatsapp", event.target.value)}
            className="w-full border border-border rounded-[12px] px-3 py-2"
            placeholder="+972501234567"
          />
        </Field>
      </div>

      <div className="bg-white border border-border rounded-[12px] p-5 space-y-4">
        <h2 className="font-semibold">Freemium</h2>
        <Field label="מחיר חודשי לפרמיום (₪)">
          <input
            type="number"
            value={settings.freemium_premium_price || ""}
            onChange={(event) => update("freemium_premium_price", event.target.value)}
            className="w-full border border-border rounded-[12px] px-3 py-2"
            placeholder="49"
          />
        </Field>
        <Field label="מספר תמונות בחבילת חינם">
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
        <h2 className="font-semibold">חלון חג</h2>
        <p className="text-xs text-text-secondary">הפעלי ידנית כדי לבדוק את הבאנר בדשבורד ובעמוד הבית לפני החג.</p>
        <div className="flex items-center justify-between">
          <span className="text-sm">חלון חג פעיל</span>
          <button
            role="switch"
            aria-checked={settings.holiday_override_enabled === "true"}
            onClick={() => update("holiday_override_enabled", settings.holiday_override_enabled === "true" ? "false" : "true")}
            className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${settings.holiday_override_enabled === "true" ? "bg-primary" : "bg-gray-200"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${settings.holiday_override_enabled === "true" ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>
        <Field label="מפתח חג לבדיקה (ריק = חישוב אוטומטי לפי תאריך)">
          <select
            value={settings.holiday_override_key || ""}
            onChange={(event) => update("holiday_override_key", event.target.value)}
            className="w-full border border-border rounded-[12px] px-3 py-2 bg-white"
          >
            <option value="">— ללא עקיפה —</option>
            <option value="pesach">פסח</option>
            <option value="shavuot">שבועות</option>
            <option value="rosh_hashana">ראש השנה</option>
            <option value="sukkot">סוכות</option>
            <option value="chanuka">חנוכה</option>
            <option value="tu_bishvat">ט״ו בשבט</option>
          </select>
        </Field>
      </div>

      <div className="bg-white border border-border rounded-[12px] p-5 space-y-4">
        <h2 className="font-semibold">מצב שוק שישי</h2>
        <p className="text-xs text-text-secondary">
          הפעלי ידנית כדי לבדוק את מצב שוק שישי (סרגל יצרניות, כותרת hero, badge 🛒)
          מחוץ לחלון הזמן הרגיל (ד׳ 18:00 — ו׳ 14:00).
          עקיפה זו פעילה בדפדפן הנוכחי בלבד.
        </p>
        <div className="flex items-center justify-between">
          <span className="text-sm">מצב שוק שישי — override</span>
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
        <h2 className="font-semibold">בדיקות חיבור</h2>
        {[
          { key: "whatsapp", label: "WhatsApp" },
          { key: "cloudinary", label: "Cloudinary" },
        ].map(({ key, label }) => {
          const result = tests[key];
          let statusText = "✗ לא מוגדר";
          if (result?.loading) statusText = "בודק...";
          else if (result?.ok) statusText = "✓ מחובר";
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
                  בדוק
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white border border-border rounded-[12px] p-5">
        <h2 className="font-semibold mb-2">ניהול קטגוריות</h2>
        <p className="text-sm text-text-secondary mb-3">להוספה, עריכה ומחיקה — מסך התוכן.</p>
        <Link href="/admin/content" className="text-primary text-sm hover:underline">
          לעמוד תוכן ←
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !isDirty}
          className="bg-primary text-white px-5 py-2 rounded-[12px] text-sm disabled:opacity-50"
          title={isDirty ? undefined : "אין שינויים לשמירה"}
        >
          {saving ? "שומר..." : "שמור הגדרות"}
        </button>
        {isDirty && !saving && (
          <span className="text-xs text-site-muted">
            {changedKeys.length} שינויים לא שמורים
          </span>
        )}
        {saved && !isDirty && <span className="text-sm text-primary">נשמר ✓</span>}
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
