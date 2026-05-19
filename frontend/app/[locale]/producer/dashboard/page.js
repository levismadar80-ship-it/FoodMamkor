"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { getUpcomingHoliday } from "@/lib/holidays";
import { PENDING_WHATSAPP_COMPANION_COPY } from "@/lib/producer-status";
import InfoTooltip from "@/components/InfoTooltip";

const AVAILABILITY_TOOLTIP = (
  <>
    פתוח להזמנות = ברירת מחדל.
    <br />
    זמינה היום = מלאי טרי עכשיו.
    <br />
    עמוסה השבוע = מופיעה אבל מסומנת.
    <br />
    בהפסקה = מוסתרת עד תאריך שתבחרי.
  </>
);

function VanityLinkCard({ slug }) {
  const url = `https://mehamakor.online/p/${slug}`;
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const waText = encodeURIComponent(`הפרופיל שלי במהמקור: ${url}`);

  return (
    <div className="bg-white border border-border rounded-[16px] p-5 mb-6">
      <p className="text-sm font-medium text-site-text mb-2">🔗 הלינק שלי</p>
      <div className="flex items-center gap-2 bg-light rounded-[10px] px-3 py-2 mb-3">
        <span className="text-sm text-primary font-mono flex-1 truncate" dir="ltr">{url}</span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={copy}
          className="flex-1 text-sm border border-border rounded-[8px] px-3 py-1.5 hover:border-primary transition"
        >
          {copied ? "✅ הועתק!" : "העתיקי לינק"}
        </button>
        <a
          href={`https://wa.me/?text=${waText}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-whatsapp-outline flex-1 text-sm text-center rounded-[8px] px-3 py-1.5"
        >
          שתפי בוואטסאפ
        </a>
      </div>
    </div>
  );
}

/**
 * Producer dashboard — feature/producer-analytics.
 *
 * Fetches in parallel from two endpoints so the UI can render the hero
 * (availability toggle + quick links) immediately even if analytics is
 * slow:
 *   - GET /producers/me/dashboard  — producer meta + legacy fields
 *   - GET /producers/me/analytics  — rich metrics + 30d chart + top cities
 *
 * The charts are inline SVG (no chart library) following the admin
 * dashboard precedent. Two charts:
 *   1. Line: profile views over the last 30 days
 *   2. Horizontal bar: top 5 cities viewing the profile
 */
export default function ProducerDashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [profile, setProfile] = useState(null);
  const [vacationUntil, setVacationUntil] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") {
      router.push("/login");
      return;
    }
    api.get("/producers/me/dashboard").then((r) => {
      setData(r.data);
      setVacationUntil(r.data?.producer?.vacation_until || "");
    }).catch(() => setData(null));
    api.get("/producers/me/analytics").then((r) => setAnalytics(r.data)).catch(() => setAnalytics(null));
    api.get("/producers/me").then((r) => setProfile(r.data)).catch(() => setProfile(null));
  }, [user, authLoading]);

  // MEH-291 Phase 3 — unified 4-value availability enum. Replaces the
  // old toggleAvailability + setAvailabilityStatus pair. Backend
  // dual-writes to the legacy is_available_today + availability_status
  // columns during the 7-day overlap; Phase 4 drops them.
  const setAvailabilityState = async (state) => {
    // Optimistic update so the radio lights up immediately on click.
    setData((prev) =>
      prev
        ? {
            ...prev,
            producer: { ...prev.producer, availability_state: state },
          }
        : prev,
    );
    try {
      const body = { state };
      if (state === "on_vacation" && vacationUntil) body.vacation_until = vacationUntil;
      await api.post("/producers/me/availability-state", body);
      if (state !== "on_vacation") setVacationUntil("");
    } catch {
      alert("לא הצלחנו לעדכן את מצב הזמינות — נסי שוב בעוד רגע");
      // Refetch on failure so the UI doesn't stay out of sync.
      api
        .get("/producers/me/dashboard")
        .then((r) => setData(r.data))
        .catch(() => {});
    }
  };

  if (authLoading || !user || user.role !== "producer") return null;
  if (!data) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-site-muted">
        טוענת נתונים...
      </div>
    );
  }

  const { producer } = data;

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <h1 className="font-headline text-4xl font-bold text-site-text mb-2">
        שלום {user.name} 👋
      </h1>
      <p className="text-site-muted mb-8">
        ברוכה הבאה לניהול העסק של <span className="font-semibold">{producer.name}</span>
      </p>

      {producer.status === "pending" && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-[16px] p-4 mb-6 text-sm" role="status">
          <p className="font-semibold text-yellow-800 mb-1">🌿 הפרופיל שלך בסקירה</p>
          <p className="text-yellow-700 mb-3">
            הצוות שלנו בודק את הפרטים — לרוב לוקח עד 3 ימי עסקים. פרופילים מלאים מאושרים מהר יותר.
          </p>
          <Link
            href="/settings"
            className="inline-block bg-yellow-700 text-white px-4 py-2 rounded-[10px] text-xs font-medium hover:bg-yellow-800 transition"
          >
            השלימי פרופיל ←
          </Link>
        </div>
      )}

      {producer.status === "rejected" && (
        <div className="bg-red-50 border border-red-200 rounded-[16px] p-4 mb-6 text-sm" role="alert">
          <p className="font-semibold text-red-800 mb-1">⚠️ הבקשה לא אושרה</p>
          <p className="text-red-700 mb-3">
            צרי קשר איתנו לפרטים נוספים ולבדיקה מחדש.
          </p>
          <Link
            href="/contact"
            className="inline-block bg-red-700 text-white px-4 py-2 rounded-[10px] text-xs font-medium hover:bg-red-800 transition"
          >
            צרי קשר ←
          </Link>
        </div>
      )}

      {producer.status === "pending_whatsapp" && (
        <div className="bg-primary/5 border border-primary/20 rounded-[16px] p-4 mb-6 text-sm">
          <p className="font-semibold text-primary mb-1">🌿 ברוכה הבאה! כמעט שם.</p>
          <p className="text-site-muted mb-3">
            השלימי את הפרופיל כדי להאיץ את הסקירה — פרופילים מלאים מאושרים מהר יותר.
          </p>
          <Link href="/settings" className="inline-block bg-primary text-white px-4 py-2 rounded-[10px] text-xs font-medium hover:bg-primary-dark transition">
            השלימי פרופיל ←
          </Link>
          <p className="text-xs text-site-muted mt-3">
            {PENDING_WHATSAPP_COMPANION_COPY.split(" — ")[0]} —{" "}
            <Link href="/settings" className="text-primary hover:underline">
              עריכת פרופיל
            </Link>
          </p>
        </div>
      )}

      {/* MEH-55: holiday hint — shown 14 days before and during a holiday */}
      {(() => {
        const h = getUpcomingHoliday();
        if (!h) return null;
        return (
          <div
            className="rounded-[16px] p-4 mb-6 text-sm flex items-start gap-3"
            style={{ backgroundColor: h.color + "15", border: `1.5px solid ${h.color}35` }}
          >
            <span className="text-xl shrink-0" aria-hidden="true">{h.emoji}</span>
            <div>
              <p className="font-semibold text-site-text">{h.dashboardHint}</p>
              <Link
                href="/producer/dashboard"
                className="text-xs mt-1 inline-block hover:underline"
                style={{ color: h.color }}
              >
                עדכני את הקטלוג ←
              </Link>
            </div>
          </div>
        );
      })()}

      {/* MEH-53: Vanity URL card */}
      {producer.slug && (
        <VanityLinkCard slug={producer.slug} />
      )}

      {/* MEH-291 Phase 3 — unified availability card. Replaces the old
          "זמין היום" hero + "סטטוס זמינות" pill row. 4-value durable
          enum. Backend dual-writes to legacy columns during the 7-day
          overlap (Phase 4 drops them). */}
      <div className="bg-white border border-border rounded-[16px] p-6 mb-8">
        <p className="text-sm uppercase tracking-wider text-site-muted mb-1">
          מצב זמינות
          <InfoTooltip content={AVAILABILITY_TOOLTIP} label="מה ההבדל בין המצבים?" position="bottom" />
        </p>
        <p className="text-site-muted text-sm mb-4">
          בחרי את הסטטוס שיוצג ללקוחות בכרטיסייה ובעמוד העסק.
        </p>
        <div role="radiogroup" aria-label="מצב זמינות" className="flex flex-wrap gap-2">
          {[
            { value: "accepting_orders", label: "פתוח להזמנות", color: "#22c55e" },
            { value: "available_today",  label: "זמינה היום 🟢", color: "#4cb08b" },
            { value: "full_this_week",   label: "עמוסה השבוע 🟠", color: "#f97316" },
            { value: "on_vacation",      label: "בהפסקה ⏸",     color: "#9ca3af" },
          ].map((opt) => {
            const active = (producer.availability_state || "accepting_orders") === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setAvailabilityState(opt.value)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-[12px] text-sm font-medium transition border focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  active
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-site-text border-border hover:bg-light"
                }`}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    display: "inline-block",
                    background: opt.color,
                    flexShrink: 0,
                  }}
                />
                {opt.label}
              </button>
            );
          })}
        </div>
        {(producer.availability_state || "accepting_orders") === "on_vacation" && (
          <div className="mt-4 flex items-center gap-3">
            <label htmlFor="vacation-until" className="text-sm text-site-muted whitespace-nowrap">
              חזרה ב:
            </label>
            <input
              id="vacation-until"
              type="date"
              value={vacationUntil}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setVacationUntil(e.target.value)}
              onBlur={() => { if (vacationUntil) setAvailabilityState("on_vacation"); }}
              className="border border-border rounded-[8px] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              dir="ltr"
            />
            {vacationUntil && (
              <button
                type="button"
                onClick={() => { setVacationUntil(""); setAvailabilityState("on_vacation"); }}
                className="text-xs text-site-muted hover:text-red-600 transition"
                aria-label="הסירי תאריך חזרה"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      {/* Analytics stat cards */}
      {analytics ? (
        <AnalyticsSection analytics={analytics} profile={profile} />
      ) : (
        <p className="text-sm text-site-muted mb-8">טוענת סטטיסטיקות...</p>
      )}

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
        <Link
          href="/producer/dashboard/group-buys"
          className="bg-white border border-border rounded-[16px] p-5 hover:border-primary transition"
        >
          <p className="font-headline text-lg font-bold mb-1">קבוצות הרכש שלי</p>
          <p className="text-sm text-site-muted">נהלי קבוצות רכש ופתחי חדשות</p>
        </Link>
        {/* MEH-590: producer recipes tab (chunk 3/4 of the producer-recipes epic). */}
        <Link
          href="/producer/dashboard/recipes"
          className="bg-white border border-border rounded-[16px] p-5 hover:border-primary transition"
        >
          <p className="font-headline text-lg font-bold mb-1">מתכונים</p>
          <p className="text-sm text-site-muted">פרסום וניהול מתכונים שמקדמים את המוצרים שלך</p>
        </Link>
      </div>

      {/* AI bio */}
      {profile && (
        <div className="mt-8">
          <BioPanelCard profile={profile} onSave={(bio) => setProfile((p) => p ? { ...p, description: bio } : p)} />
        </div>
      )}

      {/* MEH-210 Phase 2 — custom WhatsApp question chips */}
      {profile && (
        <div className="mt-6">
          <CustomQuestionsCard
            profile={profile}
            onSave={(q) => setProfile((p) => p ? { ...p, custom_questions: q } : p)}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// Analytics section: stat cards + charts
// ============================================================

function AnalyticsSection({ analytics, profile }) {
  const {
    profile_views,
    search_appearances,
    whatsapp_clicks,
    contact_clicks,
    follower_count,
    new_followers_this_week,
    average_rating,
    total_reviews,
    home_products_count,
    views_by_day,
    top_cities,
    rank_in_city,
    conversion_rate,
    profile_strength,
    weekly_trend,
  } = analytics;

  const trendIcon = weekly_trend === "up" ? "↑" : weekly_trend === "down" ? "↓" : "→";
  const trendColor = weekly_trend === "up" ? "text-green-600" : weekly_trend === "down" ? "text-red-500" : "text-site-muted";
  const cityName = profile?.city ? ` ב${profile.city}` : "";
  const rankDisplay = rank_in_city != null ? `#${rank_in_city}${cityName}` : "—";

  const eligibleForWeekly = profile_strength >= 80 && rank_in_city === 1;

  return (
    <div className="space-y-8 mb-10">
      {/* MEH-57: Hero 4-stat bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-border rounded-[16px] p-4 text-center">
          <p className="text-xs text-site-muted mb-1">צפיות השבוע</p>
          <p className={`font-headline text-3xl font-bold text-primary inline-flex items-baseline gap-1`}>
            {profile_views?.last_7d ?? 0}
            <span className={`text-lg font-semibold ${trendColor}`}>{trendIcon}</span>
          </p>
          <p className="text-xs text-site-muted mt-1">7 הימים האחרונים</p>
        </div>
        <div className="bg-white border border-border rounded-[16px] p-4 text-center">
          <p className="text-xs text-site-muted mb-1">לחיצות ווטסאפ</p>
          <p className="font-headline text-3xl font-bold text-primary">{whatsapp_clicks?.last_7d ?? 0}</p>
          <p className="text-xs text-site-muted mt-1">7 הימים האחרונים</p>
        </div>
        <div className="bg-white border border-border rounded-[16px] p-4 text-center">
          <p className="text-xs text-site-muted mb-1">
            המרה %
            <InfoTooltip content="אחוז הצפיות שהפכו ללחיצה על ווטסאפ ב-30 הימים האחרונים. ככל שיותר גבוה — הפרופיל משכנע יותר." />
          </p>
          <p className="font-headline text-3xl font-bold text-primary">{conversion_rate}%</p>
          <p className="text-xs text-site-muted mt-1">צפייה → ווטסאפ (30 יום)</p>
        </div>
        <div className="bg-white border border-border rounded-[16px] p-4 text-center">
          <p className="text-xs text-site-muted mb-1">
            דירוג בעיר
            <InfoTooltip content="המיקום שלך בעיר לפי צפיות ב-30 הימים האחרונים. מתעדכן אוטומטית." />
          </p>
          <p className="font-headline text-2xl font-bold text-primary leading-tight">{rankDisplay}</p>
          <p className="text-xs text-site-muted mt-1">לפי צפיות (30 יום)</p>
        </div>
      </div>

      {/* MEH-57: "בעלת עסק השבוע" eligibility badge */}
      {eligibleForWeekly && (
        <div className="bg-primary/10 border border-primary/25 rounded-[16px] p-4 flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">🌟</span>
          <div>
            <p className="font-semibold text-primary text-sm">
              את מועמדת לבעלת עסק השבוע 🌟 צרי קשר עם הצוות
              <InfoTooltip content="הצוות בוחר מדי שבוע בעלת עסק עם דירוג ראשון בעיר וחוזק פרופיל גבוה. אם את מועמדת — יופיע כאן הודעה." />
            </p>
            <p className="text-xs text-site-muted">דירוג ראשון בעיר + פרופיל חזק — כל הכבוד!</p>
          </div>
        </div>
      )}

      {/* MEH-57: Profile strength meter */}
      {profile && (
        <ProfileStrengthCard profile={profile} analytics={analytics} />
      )}

      {/* Row 1: windowed metric cards (profile / search / whatsapp / contact) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <WindowedMetricCard
          label="צפיות בפרופיל"
          icon="👁️"
          windows={profile_views}
          tooltip="כמה פעמים לקוחות נכנסו לעמוד העסק שלך. נספרת צפייה אחת ללקוחה ביום."
        />
        <WindowedMetricCard
          label="הופעות בחיפוש"
          icon="🔎"
          windows={search_appearances}
          tooltip="כמה פעמים העסק שלך הופיע ברשימת תוצאות חיפוש, גם אם הלקוחה לא לחצה."
        />
        <WindowedMetricCard
          label="לחיצות ווטסאפ"
          icon="💬"
          windows={whatsapp_clicks}
        />
        <WindowedMetricCard
          label="לחיצות יצירת קשר"
          icon="📞"
          windows={contact_clicks}
        />
      </div>

      {/* Row 2: static cards (followers, reviews, home products) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SimpleCard
          label="עוקבות"
          icon="🌿"
          value={follower_count}
          sub={`+${new_followers_this_week} השבוע`}
        />
        <SimpleCard
          label="דירוג ממוצע"
          icon="⭐"
          value={average_rating ? average_rating.toFixed(1) : "—"}
          sub={`מתוך ${total_reviews} ביקורות`}
        />
        {/* TODO MEH-543: i18n after /neighbor activation post-launch */}
        <SimpleCard
          label="מוצרים פעילים במטבח"
          icon="🥕"
          value={home_products_count}
          sub="מהמטבח של השכן"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-border rounded-[16px] p-5">
          <h2 className="font-headline text-lg font-bold mb-3">
            צפיות ב-30 הימים האחרונים
            <InfoTooltip content="גרף יומי של צפיות בפרופיל. כל נקודה = יום בודד. השווה לימי שיווק שלך באינסטגרם או בקבוצות." />
          </h2>
          <ViewsLineChart data={views_by_day} />
        </div>
        <div className="bg-white border border-border rounded-[16px] p-5">
          <h2 className="font-headline text-lg font-bold mb-3">ערים מובילות</h2>
          <TopCitiesBarChart data={top_cities} />
        </div>
      </div>
    </div>
  );
}

function WindowedMetricCard({ label, icon, windows, tooltip }) {
  return (
    <div className="bg-white border border-border rounded-[16px] p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl" aria-hidden="true">{icon}</span>
        <span className="text-xs text-site-muted">7 ימים / 30 ימים / סה״כ</span>
      </div>
      <p className="text-sm text-site-muted mb-2">
        {label}
        {tooltip && <InfoTooltip content={tooltip} />}
      </p>
      <div className="flex items-baseline gap-3">
        <span className="font-headline text-4xl font-bold text-primary">
          {windows?.last_7d ?? 0}
        </span>
        <span className="text-lg text-site-text/60">/</span>
        <span className="font-headline text-2xl font-semibold text-site-text">
          {windows?.last_30d ?? 0}
        </span>
        <span className="text-lg text-site-text/60">/</span>
        <span className="font-headline text-xl text-site-muted">
          {windows?.total ?? 0}
        </span>
      </div>
    </div>
  );
}

function SimpleCard({ label, icon, value, sub }) {
  return (
    <div className="bg-white border border-border rounded-[16px] p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl" aria-hidden="true">{icon}</span>
      </div>
      <p className="text-sm text-site-muted mb-2">{label}</p>
      <p className="font-headline text-4xl font-bold text-primary">{value}</p>
      <p className="text-xs text-site-muted mt-1">{sub}</p>
    </div>
  );
}

/**
 * Inline SVG line chart — 30 days of views.
 * Follows the same pattern as admin/page.js's monthly_producers chart
 * (no chart library, per the codebase precedent).
 */
function ViewsLineChart({ data }) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-site-muted">אין נתונים עדיין</p>;
  }
  const W = 320;
  const H = 120;
  const pad = 8;
  const maxV = Math.max(1, ...data.map((d) => d.count));
  const stepX = data.length > 1 ? (W - pad * 2) / (data.length - 1) : 0;
  const points = data
    .map((d, i) => {
      const x = pad + i * stepX;
      const y = H - pad - (d.count / maxV) * (H - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  // Show labels for start / mid / end only to avoid x-axis clutter.
  const labelIndexes = [0, Math.floor(data.length / 2), data.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H + 20}`}
      className="w-full h-40"
      role="img"
      aria-label="גרף צפיות ב-30 הימים האחרונים"
    >
      <polyline
        fill="none"
        stroke="#2e6853"
        strokeWidth="2"
        points={points}
      />
      {data.map((d, i) => {
        const x = pad + i * stepX;
        const y = H - pad - (d.count / maxV) * (H - pad * 2);
        return (
          <g key={d.date}>
            <circle cx={x} cy={y} r={d.count > 0 ? 2.5 : 1.5} fill="#2e6853" />
            {labelIndexes.includes(i) && (
              <text
                x={x}
                y={H + 14}
                fontSize="10"
                textAnchor="middle"
                fill="#6b6b6b"
              >
                {d.date.slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Inline SVG horizontal bar chart — top 5 cities.
 * Falls back to a text note when there are no city-tagged views yet
 * (which is the case until logged-in users with a `city` set visit).
 */
function TopCitiesBarChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-site-muted">
        עוד אין נתוני ערים — לקוחות שלא התחברו לא מדווחים עיר.
      </p>
    );
  }
  const maxV = Math.max(1, ...data.map((d) => d.count));
  return (
    <ul className="space-y-2">
      {data.map((row) => {
        const pct = (row.count / maxV) * 100;
        return (
          <li key={row.city} className="text-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-site-text">{row.city}</span>
              <span className="text-site-muted">{row.count}</span>
            </div>
            <div className="h-2 bg-light rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ============================================================
// MEH-57: Profile strength checklist (6-item, matches backend scoring)
// ============================================================

const STRENGTH_ITEMS = [
  { key: "image",    label: "תמונת פרופיל",          weight: 15, check: (p, a) => (p?.images?.length ?? 0) > 0 },
  { key: "desc",     label: "תיאור עסק (50+ תווים)", weight: 20, check: (p, a) => (p?.description?.trim?.()?.length ?? 0) >= 50 },
  { key: "product",  label: "מוצר פעיל במטבח",       weight: 25, check: (p, a) => (a?.home_products_count ?? 0) > 0 },
  { key: "delivery", label: "אזור משלוח",             weight: 10, check: (p, a) => (p?.delivery_areas?.length ?? 0) > 0 },
  { key: "review",   label: "ביקורת ראשונה",          weight: 15, check: (p, a) => (a?.total_reviews ?? 0) > 0 },
  { key: "phone",    label: "טלפון מאומת",            weight: 15, check: (p, a) => !!p?.phone_verified },
];

function _strengthLabel(pct) {
  if (pct <= 40) return "הפרופיל שלך חלש — לקוחות לא רואות אותך";
  if (pct <= 70) return "בסדר, אבל יש מה לשפר";
  if (pct <= 90) return "פרופיל חזק 💪";
  return "פרופיל מושלם ⭐";
}

function ProfileStrengthCard({ profile, analytics }) {
  const pct = analytics?.profile_strength ?? 0;

  return (
    <div className="bg-white border border-border rounded-[16px] p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-headline text-base font-bold">
          חוזק פרופיל
          <InfoTooltip content="ציון לפי 6 קריטריונים: תמונה, תיאור, מוצר פעיל, אזור משלוח, ביקורת ראשונה, טלפון מאומת. מעל 80% — לקוחות סומכות יותר." position="bottom" />
        </h2>
        <span className="text-primary font-bold text-lg">{pct}%</span>
      </div>
      <p className="text-xs text-site-muted mb-3">{_strengthLabel(pct)}</p>
      <div className="h-2 bg-light rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="space-y-2">
        {STRENGTH_ITEMS.map((item) => {
          const done = item.check(profile, analytics);
          return (
            <li key={item.key} className="flex items-center justify-between text-sm">
              <span className={`flex items-center gap-2 ${done ? "text-site-text" : "text-site-muted"}`}>
                <span aria-hidden="true">{done ? "✓" : "○"}</span>
                {item.label}
              </span>
              {!done && (
                <span className="text-xs text-secondary font-medium">+{item.weight}%</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ============================================================
// MEH-210 Phase 2: custom WhatsApp question chips
// ============================================================

const MAX_QUESTIONS = 5;

function CustomQuestionsCard({ profile, onSave }) {
  const [questions, setQuestions] = useState(() => {
    const saved = profile?.custom_questions || [];
    return [...saved, ...Array(MAX_QUESTIONS - saved.length).fill("")].slice(0, MAX_QUESTIONS);
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const payload = questions.filter((q) => q.trim());
      await api.put("/producers/me", { custom_questions: payload });
      onSave(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      alert("שגיאה בשמירה — נסי שוב");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-border rounded-[16px] p-5">
      <h2 className="font-headline text-base font-bold mb-1">
        שאלות שמופיעות בדף שלך
        <InfoTooltip content="השאלות שיופיעו ללקוחה לפני שתשלח לך הודעת ווטסאפ — חוסך לך הסברים חוזרים. עד 5 שאלות." position="bottom" />
      </h2>
      <p className="text-xs text-site-muted mb-4">
        אם תשאירי ריק, נציג שאלות ברירת מחדל לפי הקטגוריה שלך
      </p>
      <div className="space-y-2">
        {questions.map((q, i) => (
          <input
            key={i}
            type="text"
            value={q}
            maxLength={80}
            onChange={(e) => {
              const updated = [...questions];
              updated[i] = e.target.value;
              setQuestions(updated);
            }}
            placeholder="דוגמה: אילו סוגי גבינות יש השבוע?"
            className="w-full border border-[#e5e0d8] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-primary transition"
            dir="rtl"
          />
        ))}
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 bg-primary text-white px-4 py-2 rounded-[10px] text-sm font-medium hover:bg-primary-dark transition disabled:opacity-60"
      >
        {saving ? "שומרת..." : saved ? "✓ נשמר" : "שמרי שאלות"}
      </button>
    </div>
  );
}

// ============================================================
// MEH-56: AI bio writer panel
// ============================================================

function BioPanelCard({ profile, onSave }) {
  const [source, setSource] = useState(profile.instagram || "");
  const [generatedBio, setGeneratedBio] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const generate = async () => {
    if (!source.trim()) return;
    setLoading(true);
    setError("");
    setGeneratedBio("");
    setSaved(false);
    try {
      const r = await api.post("/producers/me/bio/generate", { source: source.trim() });
      setGeneratedBio(r.data.bio || "");
      if (!r.data.bio) setError("לא הצלחנו לייצר ביו — נסי שוב עם טקסט אחר");
    } catch {
      setError("שגיאה ביצירת הביו — נסי שוב");
    }
    setLoading(false);
  };

  const saveBio = async () => {
    if (!generatedBio) return;
    setSaving(true);
    try {
      await api.put("/producers/me", { description: generatedBio });
      onSave(generatedBio);
      setSaved(true);
    } catch {
      setError("שגיאה בשמירת הביו");
    }
    setSaving(false);
  };

  return (
    <div className="bg-white border border-border rounded-[16px] p-5">
      <h2 className="font-headline text-base font-bold mb-1">✍️ ביו AI</h2>
      <p className="text-xs text-site-muted mb-3">
        הכניסי שם משתמש באינסטגרם, קישור, או תיאור חופשי — ניצור ביו בעברית עד 150 תווים.
      </p>

      <textarea
        value={source}
        onChange={(e) => { setSource(e.target.value); setSaved(false); setGeneratedBio(""); }}
        placeholder="@handle / קישור אינסטגרם / תיאור חופשי"
        className="w-full border border-border rounded-[10px] px-3 py-2 text-sm resize-none h-16"
        dir="ltr"
        maxLength={500}
      />

      <button
        onClick={generate}
        disabled={loading || !source.trim()}
        className="w-full mt-2 bg-secondary text-white py-2 rounded-[10px] text-sm font-medium disabled:opacity-50 hover:bg-secondary-light transition"
      >
        {loading ? "יוצרת..." : "צרי ביו"}
      </button>

      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

      {generatedBio && (
        <div className="mt-3 space-y-2">
          <textarea
            value={generatedBio}
            onChange={(e) => setGeneratedBio(e.target.value.slice(0, 150))}
            className="w-full border border-primary/30 bg-primary/5 rounded-[10px] px-3 py-2 text-sm resize-none h-16"
            dir="rtl"
            maxLength={150}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-site-muted">{generatedBio.length}/150</span>
            <button
              onClick={saveBio}
              disabled={saving}
              className="bg-primary text-white px-4 py-1.5 rounded-[8px] text-xs font-medium disabled:opacity-50 hover:bg-primary-dark transition"
            >
              {saving ? "שומרת..." : saved ? "✓ נשמר" : "שמרי ביו"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
