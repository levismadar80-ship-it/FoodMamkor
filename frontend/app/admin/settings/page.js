"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tests, setTests] = useState({});

  useEffect(() => {
    api.get("/admin/settings").then((r) => setSettings(r.data));
  }, []);

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
            value={settings.admin_email || ""}
            onChange={(e) => update("admin_email", e.target.value)}
            className="w-full border border-border rounded-[12px] px-3 py-2"
            placeholder="admin@mehamekor.co.il"
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
        <h2 className="font-semibold">כללי אוטומציה</h2>
        <Field label="ימים עד סימון עסק כלא פעיל">
          <input
            type="number"
            value={settings.auto_inactive_days || ""}
            onChange={(e) => update("auto_inactive_days", e.target.value)}
            className="w-full border border-border rounded-[12px] px-3 py-2"
            placeholder="180"
          />
        </Field>
        <Field label="מרווח בדיקת פעילות (ימים)">
          <input
            type="number"
            value={settings.activity_check_interval || ""}
            onChange={(e) => update("activity_check_interval", e.target.value)}
            className="w-full border border-border rounded-[12px] px-3 py-2"
            placeholder="90"
          />
        </Field>
        <Field label="סף דירוג נמוך (ממוצע מינימלי)">
          <input
            type="number"
            step="0.1"
            value={settings.low_rating_threshold || ""}
            onChange={(e) => update("low_rating_threshold", e.target.value)}
            className="w-full border border-border rounded-[12px] px-3 py-2"
            placeholder="2.0"
          />
        </Field>
        <Field label="מספר דיווחים להשעיה אוטומטית">
          <input
            type="number"
            value={settings.report_auto_suspend_count || ""}
            onChange={(e) => update("report_auto_suspend_count", e.target.value)}
            className="w-full border border-border rounded-[12px] px-3 py-2"
            placeholder="3"
          />
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
