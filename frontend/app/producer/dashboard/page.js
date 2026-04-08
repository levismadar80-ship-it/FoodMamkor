"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function ProducerDashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") {
      router.push("/login");
      return;
    }
    loadDashboard();
  }, [user, authLoading]);

  const loadDashboard = async () => {
    try {
      const r = await api.get("/producers/me/dashboard");
      setData(r.data);
    } catch {
      setData(null);
    }
  };

  const toggleAvailability = async () => {
    setSaving(true);
    try {
      const r = await api.post("/producers/me/availability");
      setData((prev) =>
        prev
          ? {
              ...prev,
              producer: {
                ...prev.producer,
                is_available_today: r.data.is_available_today,
              },
            }
          : prev,
      );
    } catch {
      alert("לא הצלחנו לעדכן את סטטוס הזמינות — נסי שוב בעוד רגע");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !user || user.role !== "producer") return null;
  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-site-muted">
        טוענת נתונים...
      </div>
    );
  }

  const { producer, favorites_count, whatsapp_clicks_week } = data;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="font-headline text-4xl font-bold text-site-text mb-2">
        שלום {user.name} 👋
      </h1>
      <p className="text-site-muted mb-8">
        ברוכה הבאה לדשבורד של <span className="font-semibold">{producer.name}</span>
      </p>

      {producer.status === "pending" && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-[16px] p-4 mb-6 text-sm text-yellow-800">
          🌿 פרופיל העסק שלך ממתין לאישור
        </div>
      )}

      {/* Today's availability — hero action */}
      <div
        className={`rounded-[16px] p-6 mb-8 border transition ${
          producer.is_available_today
            ? "bg-primary text-white border-primary"
            : "bg-white border-border text-site-text"
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wider opacity-80 mb-1">זמינות היום</p>
            <p className="font-headline text-2xl font-bold">
              {producer.is_available_today ? "זמין היום ✓" : "לא מסומן זמין"}
            </p>
            <p className="text-sm mt-1 opacity-80">
              {producer.is_available_today
                ? "העסק שלך מסומן עם תגית 'זמין היום' על הכרטיסייה."
                : "לקוחות יראו שיש לך זמינות מיוחדת היום."}
            </p>
          </div>
          <button
            onClick={toggleAvailability}
            disabled={saving}
            className={`px-5 py-3 rounded-[12px] font-medium transition disabled:opacity-60 ${
              producer.is_available_today
                ? "bg-white text-primary hover:bg-light"
                : "bg-primary text-white hover:bg-primary-light"
            }`}
          >
            {saving ? "..." : producer.is_available_today ? "בטל סימון" : "סמן זמין היום"}
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white border border-border rounded-[16px] p-6">
          <p className="text-sm text-site-muted mb-2">מועדפים</p>
          <p className="font-headline text-4xl font-bold text-primary">{favorites_count}</p>
          <p className="text-xs text-site-muted mt-1">לקוחות שמרו את העסק שלך</p>
        </div>
        <div className="bg-white border border-border rounded-[16px] p-6">
          <p className="text-sm text-site-muted mb-2">לחיצות ווטסאפ השבוע</p>
          <p className="font-headline text-4xl font-bold text-primary">{whatsapp_clicks_week}</p>
          <p className="text-xs text-site-muted mt-1">יעודכן בקרוב עם מעקב מלא</p>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/settings"
          className="bg-white border border-border rounded-[16px] p-5 hover:border-primary transition"
        >
          <p className="font-headline text-lg font-bold mb-1">עריכת פרופיל</p>
          <p className="text-sm text-site-muted">עדכני פרטי עסק, משלוחים ותמונות</p>
        </Link>
        <Link
          href="/producer/dashboard/events/new"
          className="bg-white border border-border rounded-[16px] p-5 hover:border-primary transition"
        >
          <p className="font-headline text-lg font-bold mb-1">הוסף אירוע</p>
          <p className="text-sm text-site-muted">סדנה, סיור, ימי פתיחה וכו׳</p>
        </Link>
        <Link
          href={`/producer/${producer.id}`}
          className="bg-white border border-border rounded-[16px] p-5 hover:border-primary transition"
        >
          <p className="font-headline text-lg font-bold mb-1">הצג את העסק באתר</p>
          <p className="text-sm text-site-muted">כך לקוחות רואות אותו</p>
        </Link>
      </div>
    </div>
  );
}
