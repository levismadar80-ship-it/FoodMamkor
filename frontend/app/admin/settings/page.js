"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tests, setTests] = useState({});

  useEffect(() => {
    api.get("/admin/settings").then((r) => setSettings(r.data)).catch(() => setLoadError(true));
  }, []);

  if (loadError) return <div className="text-red-600 text-sm">שגיאה בטעינת הגדרות — נסי לרענן את הדף.</div>;
  if (!settings) return <div className="text-text-secondary">טוען...</div>;

  const update = (k, v) => {
    setSettings({ ...settings, [k]: v });
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/admin/settings", settings);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const testService = async (name) => {
    setTests({ ...tests, [name]: { loading: true } });
    try {
      const r = await api.post(`/admin/settings/test/${name}`);
      setTests({ ...tests, [name]: r.data });
    } catch (e) {
      setTests({ ...tests, [name]: { ok: false, error: e.message } });
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
            onChange={(e) => update("admin_email", e.target.value)}
            className="w-full border border-border rounded-[12px] px-3 py-2"
            placeholder="admin@mehamakor.co.il"
          />
        </Field>
        <Field label="מספר ווטסאפ אדמין (E.164)">
          <input
            value={settings.admin_whatsapp || ""}
            onChange={(e) => update("admin_whatsapp", e.target.value)}
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
            onChange={(e) => update("freemium_premium_price", e.target.value)}
            className="w-full border border-border rounded-[12px] px-3 py-2"
            placeholder="49"
          />
        </Field>
        <Field label="מספר תמונות בחבילת חינם">
          <input
            type="number"
            value={settings.freemium_free_image_limit || ""}
            onChange={(e) => update("freemium_free_image_limit", e.target.value)}
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
            onChange={(e) => update("holiday_override_key", e.target.value)}
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

      <div className="bg-white border border-border rounded-[12px] p-5 space-y-3">
        <h2 className="font-semibold">בדיקות חיבור</h2>
        {["twilio", "cloudinary"].map((name) => (
          <div key={name} className="flex items-center justify-between gap-3 border-b border-border last:border-0 pb-2 last:pb-0">
            <span className="text-sm capitalize">{name}</span>
            <div className="flex items-center gap-3">
              {tests[name] && (
                <span className={`text-xs ${tests[name].ok ? "text-primary" : "text-red-600"}`}>
                  {tests[name].loading ? "בודק..." : tests[name].ok ? "✓ מחובר" : "✗ לא מוגדר"}
                </span>
              )}
              <button
                onClick={() => testService(name)}
                className="text-xs bg-secondary text-white px-3 py-1 rounded-[12px]"
              >
                בדוק
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-border rounded-[12px] p-5">
        <h2 className="font-semibold mb-2">ניהול קטגוריות</h2>
        <p className="text-sm text-text-secondary mb-3">להוספה, עריכה ומחיקה — מסך התוכן.</p>
        <Link href="/admin/content" className="text-primary text-sm hover:underline">
          לעמוד תוכן ←
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="bg-primary text-white px-5 py-2 rounded-[12px] text-sm disabled:opacity-50">
          {saving ? "שומר..." : "שמור הגדרות"}
        </button>
        {saved && <span className="text-sm text-primary">נשמר ✓</span>}
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
