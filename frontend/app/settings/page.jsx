"use client";

import { forwardRef, Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  UserCircle,
  Lock,
  Storefront,
  Eye,
  EyeSlash,
  WhatsappLogo,
  EnvelopeSimple,
} from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { passwordRules } from "@/lib/validators";

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-3xl mx-auto px-4 py-12 text-site-muted">
          טוענת...
        </div>
      }
    >
      <SettingsPageBody />
    </Suspense>
  );
}

function SettingsPageBody() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const urlTab = params.get("tab");
  const validTabs = ["profile", "security", "business"];
  const initialTab = validTabs.includes(urlTab) ? urlTab : "profile";
  const [tab, setTab] = useState(initialTab);

  const businessTabRef = useRef(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  // Scroll business tab into view at 375px where 3 tabs may overflow
  useEffect(() => {
    if (tab === "business" && businessTabRef.current) {
      businessTabRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [tab]);

  if (authLoading || !user) return null;

  const isProducer = user.is_producer || user.role === "producer";

  const selectTab = (next) => {
    setTab(next);
    const qp = new URLSearchParams(params.toString());
    qp.set("tab", next);
    router.replace(`/settings?${qp.toString()}`);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="font-headline text-3xl font-bold text-site-text mb-6">
        הגדרות חשבון
      </h1>

      {/* Tab bar — overflow-x-auto so business tab stays reachable at 375px */}
      <div
        role="tablist"
        aria-label="טאבים"
        className="flex gap-1 bg-white border border-border rounded-full p-1 mb-8 overflow-x-auto"
      >
        <TabButton
          active={tab === "profile"}
          onClick={() => selectTab("profile")}
          icon={
            <UserCircle
              size={16}
              weight={tab === "profile" ? "fill" : "duotone"}
            />
          }
        >
          פרופיל
        </TabButton>
        <TabButton
          active={tab === "security"}
          onClick={() => selectTab("security")}
          icon={
            <Lock size={16} weight={tab === "security" ? "fill" : "duotone"} />
          }
        >
          אבטחה
        </TabButton>
        {isProducer && (
          <TabButton
            ref={businessTabRef}
            active={tab === "business"}
            onClick={() => selectTab("business")}
            icon={
              <Storefront
                size={16}
                weight={tab === "business" ? "fill" : "duotone"}
              />
            }
          >
            העסק שלי
          </TabButton>
        )}
      </div>

      {tab === "profile" && <ProfileTab />}
      {tab === "security" && <SecurityTab />}
      {tab === "business" && isProducer && <BusinessTab />}
    </div>
  );
}

// TabButton forwards ref so SettingsPageBody can scrollIntoView the business tab
const TabButton = forwardRef(function TabButton(
  { active, onClick, icon, children },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition whitespace-nowrap ${
        active
          ? "bg-primary text-white"
          : "text-site-muted hover:text-site-text"
      }`}
    >
      {icon}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------------------
// פרופיל
// ---------------------------------------------------------------------------

function ProfileTab() {
  const { user, updateProfile, refreshUser } = useAuth();
  const [name, setName] = useState(user.name || "");
  const [city, setCity] = useState(user.city || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const trimmedName = name.trim();
  const dirty =
    trimmedName !== (user.name || "") || city.trim() !== (user.city || "");
  const canSave = dirty && !!trimmedName;

  const isOAuth = !!user.is_oauth;
  const oAuthProvider = user.google_id ? "Google" : user.apple_id ? "Apple" : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const patch = {};
      if (trimmedName !== user.name) patch.name = trimmedName;
      if (city.trim() !== (user.city || "")) patch.city = city.trim();
      await updateProfile(patch);
      setMessage("הפרטים נשמרו");
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err?.response?.data?.detail || "לא הצלחנו לשמור. נסי שוב.");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.post("/upload/avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await refreshUser();
      setMessage("תמונת הפרופיל עודכנה");
      setTimeout(() => setMessage(null), 3000);
    } catch {
      setError("שגיאה בהעלאת התמונה, נסי שוב");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();

  return (
    <section role="tabpanel" aria-label="פרופיל" className="bg-white border border-border rounded-[16px] p-6">
      {/* Avatar */}
      <div className="flex items-center gap-4 mb-6">
        <label
          htmlFor="avatar-upload"
          className="relative w-16 h-16 rounded-full cursor-pointer group shrink-0"
          aria-label="שינוי תמונת פרופיל"
        >
          {user.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-semibold bg-primary">
              {initial}
            </div>
          )}
          <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
            <span className="text-white text-xs font-medium">שנה</span>
          </div>
          {uploading && (
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
              <svg className="animate-spin w-6 h-6 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
          )}
        </label>
        <input id="avatar-upload" type="file" accept="image/*" className="sr-only" onChange={handleAvatarChange} disabled={uploading} />
        <div>
          <p className="font-semibold text-site-text">{user.name}</p>
          <p className="text-sm text-site-muted" dir="ltr">{user.email}</p>
          <p className="text-xs text-site-muted mt-0.5">לחצי על התמונה לשינוי</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="profile-name" className="block text-sm font-medium mb-1">שם מלא *</label>
          <input
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full border border-border rounded-[12px] px-3 py-2 text-right"
            dir="rtl"
          />
        </div>
        <div>
          <label htmlFor="profile-city" className="block text-sm font-medium mb-1">עיר (אופציונלי)</label>
          <input
            id="profile-city"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="לדוגמה: תל אביב"
            className="w-full border border-border rounded-[12px] px-3 py-2 text-right"
            dir="rtl"
          />
        </div>
        <div>
          <label htmlFor="profile-email" className="block text-sm font-medium mb-1">אימייל</label>
          <input
            id="profile-email"
            type="email"
            value={user.email || ""}
            readOnly
            disabled
            className="w-full border border-border rounded-[12px] px-3 py-2 bg-light text-site-muted cursor-not-allowed"
            dir="ltr"
          />
          <p className="text-xs text-site-muted mt-1 text-right">
            {isOAuth
              ? `האימייל מחובר לחשבון ${oAuthProvider ?? "חיצוני"} — לשינוי עדכני שם`
              : "לשינוי אימייל, פני לתמיכה"}
          </p>
        </div>

        {message && <p className="text-sm text-primary" role="status">✓ {message}</p>}
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

        <button
          type="submit"
          disabled={!canSave || saving}
          className="bg-primary text-white px-6 py-2.5 rounded-[12px] hover:bg-primary-light transition font-medium disabled:opacity-50"
        >
          {saving ? "שומרת..." : "שמרי"}
        </button>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// אבטחה
// ---------------------------------------------------------------------------

function SecurityTab() {
  const { user } = useAuth();
  const isOAuth = !!user.is_oauth;

  return (
    <div className="space-y-6">
      <PasswordChangeCard isOAuth={isOAuth} />
      <LogoutAllDevicesCard />
      <DangerZoneCard />
    </div>
  );
}

function PasswordChangeCard({ isOAuth }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const rulesPass = passwordRules.every((r) => r.check(next));
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSave = !isOAuth && current.length >= 1 && rulesPass && next === confirm && !mismatch;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.post("/auth/change-password", { current_password: current, new_password: next });
      setMessage("הסיסמה עודכנה בהצלחה");
      setCurrent(""); setNext(""); setConfirm("");
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err?.response?.data?.detail || "שגיאה בעדכון הסיסמה");
    } finally {
      setSaving(false);
    }
  };

  if (isOAuth) {
    return (
      <section role="tabpanel" aria-label="שינוי סיסמה" className="bg-white border border-border rounded-[16px] p-6">
        <h2 className="font-semibold text-site-text mb-2">סיסמה</h2>
        <p className="text-sm text-site-muted">החשבון שלך מחובר דרך OAuth — אין צורך בסיסמה נפרדת.</p>
      </section>
    );
  }

  return (
    <section className="bg-white border border-border rounded-[16px] p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-site-text">שינוי סיסמה</h2>
        <Link href="/forgot-password" className="text-xs text-primary hover:underline">
          שכחת סיסמה נוכחית?
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Current password */}
        <div>
          <label htmlFor="sec-current" className="block text-sm font-medium mb-1">סיסמה נוכחית *</label>
          <div className="relative">
            <input
              id="sec-current"
              type={showCurrent ? "text" : "password"}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              // eslint-disable-next-line no-restricted-syntax -- rtl-ok: eye toggle inside dir="ltr" input
              className="w-full border border-border rounded-[12px] pr-11 pl-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition"
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => setShowCurrent((v) => !v)}
              // eslint-disable-next-line no-restricted-syntax -- rtl-ok
              className="absolute right-3 top-1/2 -translate-y-1/2 text-site-muted hover:text-site-text transition rounded-full p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label={showCurrent ? "הסתירי סיסמה נוכחית" : "הציגי סיסמה נוכחית"}
              aria-pressed={showCurrent}
            >
              {showCurrent ? <EyeSlash size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* New password */}
        <div>
          <label htmlFor="sec-new" className="block text-sm font-medium mb-1">סיסמה חדשה *</label>
          <div className="relative">
            <input
              id="sec-new"
              type={showNew ? "text" : "password"}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={8}
              // eslint-disable-next-line no-restricted-syntax -- rtl-ok
              className="w-full border border-border rounded-[12px] pr-11 pl-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition"
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              // eslint-disable-next-line no-restricted-syntax -- rtl-ok
              className="absolute right-3 top-1/2 -translate-y-1/2 text-site-muted hover:text-site-text transition rounded-full p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label={showNew ? "הסתירי סיסמה חדשה" : "הציגי סיסמה חדשה"}
              aria-pressed={showNew}
            >
              {showNew ? <EyeSlash size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          {/* Live 4-rule checklist — shown once user starts typing */}
          {next.length > 0 && (
            <ul className="mt-2 space-y-1">
              {passwordRules.map((rule) => {
                const ok = rule.check(next);
                return (
                  <li key={rule.id} className={`flex items-center gap-1.5 text-xs ${ok ? "text-primary" : "text-site-muted"}`}>
                    <span aria-hidden="true">{ok ? "✓" : "○"}</span>
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Confirm password */}
        <div>
          <label htmlFor="sec-confirm" className="block text-sm font-medium mb-1">אימות סיסמה חדשה *</label>
          <div className="relative">
            <input
              id="sec-confirm"
              type={showConfirm ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              aria-invalid={mismatch || undefined}
              // eslint-disable-next-line no-restricted-syntax -- rtl-ok
              className={`w-full border rounded-[12px] pr-11 pl-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition ${mismatch ? "border-red-400" : "border-border"}`}
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              // eslint-disable-next-line no-restricted-syntax -- rtl-ok
              className="absolute right-3 top-1/2 -translate-y-1/2 text-site-muted hover:text-site-text transition rounded-full p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label={showConfirm ? "הסתירי אימות סיסמה" : "הציגי אימות סיסמה"}
              aria-pressed={showConfirm}
            >
              {showConfirm ? <EyeSlash size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          {mismatch && (
            <p className="text-xs text-red-500 mt-1 text-right" role="alert">הסיסמאות לא זהות</p>
          )}
        </div>

        {message && <p className="text-sm text-primary" role="status">✓ {message}</p>}
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

        <button
          type="submit"
          disabled={!canSave || saving}
          className="bg-primary text-white px-6 py-2.5 rounded-[12px] hover:bg-primary-light transition font-medium disabled:opacity-50"
        >
          {saving ? "שומרת..." : "עדכני סיסמה"}
        </button>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Logout all devices
// ---------------------------------------------------------------------------

function LogoutAllDevicesCard() {
  const { logoutAllDevices } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogout = async () => {
    setLoading(true);
    setError(null);
    try {
      await logoutAllDevices();
      setConfirming(false);
    } catch {
      setError("שגיאה — נסי שוב");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-white border border-border rounded-[16px] p-6">
      <h2 className="font-semibold text-site-text mb-1">יציאה מכל המכשירים</h2>
      <p className="text-sm text-site-muted mb-4">
        מבטלת את כל הסשנים הפעילים ומחדשת את האסימון — כולל המכשיר הנוכחי.
      </p>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="border border-amber-500 text-amber-700 px-5 py-2 rounded-[12px] text-sm font-medium hover:bg-amber-50 transition"
        >
          יציאה מכל המכשירים
        </button>
      ) : (
        <div className="rounded-[12px] bg-amber-50 border border-amber-200 p-4 space-y-3">
          <p className="text-sm text-amber-800 font-medium">לאשר יציאה מכל המכשירים?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleLogout}
              disabled={loading}
              className="bg-amber-500 text-white px-5 py-2 rounded-[12px] text-sm font-medium hover:bg-amber-600 transition disabled:opacity-50"
            >
              {loading ? "מתנתקת..." : "כן, יציאה"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-5 py-2 rounded-[12px] text-sm font-medium text-site-muted hover:text-site-text transition"
            >
              ביטול
            </button>
          </div>
          {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// מחיקת חשבון
// ---------------------------------------------------------------------------

function DangerZoneCard() {
  const { user } = useAuth();
  const router = useRouter();
  const [phase, setPhase] = useState("idle"); // idle | confirm | grace
  const [emailInput, setEmailInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const emailMatch = emailInput.trim().toLowerCase() === (user.email || "").toLowerCase();

  const handleDelete = async (e) => {
    e.preventDefault();
    if (!emailMatch) return;
    setLoading(true);
    setError(null);
    try {
      await api.delete("/users/me");
      setPhase("grace");
    } catch (err) {
      setError(err?.response?.data?.detail || "שגיאה — נסי שוב");
    } finally {
      setLoading(false);
    }
  };

  if (phase === "grace") {
    return (
      <section className="bg-white border border-red-200 rounded-[16px] p-6 text-center space-y-3">
        <p className="text-2xl">⏳</p>
        <h2 className="font-semibold text-site-text">בקשת המחיקה התקבלה</h2>
        <p className="text-sm text-site-muted">
          החשבון ינותק תוך 30 יום. עד אז תוכלי לבטל את הבקשה על ידי כניסה מחדש.
        </p>
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="mt-2 text-sm text-primary hover:underline"
        >
          חזרי לדף הכניסה
        </button>
      </section>
    );
  }

  return (
    <section className="bg-white border border-red-200 rounded-[16px] p-6">
      <h2 className="font-semibold text-red-700 mb-1">מחיקת חשבון</h2>
      <p className="text-sm text-site-muted mb-4">
        פעולה זו בלתי הפיכה. כל הנתונים, הביקורות והמועדפים יימחקו לצמיתות.
      </p>

      {phase === "idle" && (
        <button
          type="button"
          onClick={() => setPhase("confirm")}
          className="border border-red-400 text-red-600 px-5 py-2 rounded-[12px] text-sm font-medium hover:bg-red-50 transition"
        >
          מחקי חשבון
        </button>
      )}

      {phase === "confirm" && (
        <form onSubmit={handleDelete} className="space-y-3">
          <label htmlFor="danger-email" className="block text-sm font-medium text-red-700">
            הקלידי את האימייל שלך לאישור
          </label>
          <input
            id="danger-email"
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder={user.email || ""}
            className="w-full border border-red-300 rounded-[12px] px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-red-300 transition"
            dir="ltr"
            autoComplete="off"
          />
          {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!emailMatch || loading}
              className="bg-red-600 text-white px-5 py-2 rounded-[12px] text-sm font-medium hover:bg-red-700 transition disabled:opacity-40"
            >
              {loading ? "מוחקת..." : "אישור מחיקה"}
            </button>
            <button
              type="button"
              onClick={() => { setPhase("idle"); setEmailInput(""); setError(null); }}
              className="px-5 py-2 rounded-[12px] text-sm font-medium text-site-muted hover:text-site-text transition"
            >
              ביטול
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// העסק שלי
// ---------------------------------------------------------------------------

function BusinessTab() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [supportOpen, setSupportOpen] = useState(false);

  const status = user.producer_status || "pending";
  const rejectionReason = user.producer_rejection_reason;

  useEffect(() => {
    api.get("/producers/me/dashboard")
      .then((r) => setStats(r.data))
      .catch(() => setStats(null))
      .finally(() => setLoadingStats(false));
  }, []);

  const dimmed = status === "suspended";

  return (
    <div className="space-y-6">
      {/* Status banner */}
      {status === "pending" && (
        <div className="rounded-[12px] bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
          ✋ הבקשה שלך נמצאת בבדיקה — נחזור אלייך בהקדם.
        </div>
      )}
      {status === "rejected" && (
        <div className="rounded-[12px] bg-red-50 border border-red-200 px-4 py-4 space-y-3">
          <p className="text-sm font-semibold text-red-700">הבקשה לא אושרה</p>
          {rejectionReason && (
            <p className="text-sm text-red-600">{rejectionReason}</p>
          )}
          <ul className="space-y-1 text-sm text-red-700">
            <li className="flex items-start gap-2"><span>•</span><span>ודאי שכל פרטי העסק מלאים ומדויקים</span></li>
            <li className="flex items-start gap-2"><span>•</span><span>הוסיפי תמונות ברורות של המוצרים</span></li>
            <li className="flex items-start gap-2"><span>•</span><span>בדקי שכתובת העסק נכונה</span></li>
          </ul>
          <button
            type="button"
            onClick={() => setSupportOpen(true)}
            className="text-sm text-primary hover:underline"
          >
            דברי איתנו &rarr;
          </button>
        </div>
      )}
      {status === "suspended" && (
        <div className="rounded-[12px] bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-2 text-sm text-amber-800">
          <span>⚠️</span>
          <span className="font-medium">החשבון מושעה זמנית.</span>
          <button
            type="button"
            onClick={() => setSupportOpen(true)}
            className="ms-auto text-primary hover:underline text-xs"
          >
            צרי קשר
          </button>
        </div>
      )}

      {/* Stats grid */}
      <section className={`bg-white border border-border rounded-[16px] p-6 ${dimmed ? "opacity-50 pointer-events-none select-none" : ""}`}>
        <h2 className="font-semibold text-site-text mb-4">סטטיסטיקות</h2>
        {loadingStats ? (
          <p className="text-sm text-site-muted">טוענת...</p>
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard label="צפיות" value={stats.views ?? 0} />
            <StatCard label="מועדפים" value={stats.favorites ?? 0} />
            <StatCard label="ביקורות" value={stats.reviews ?? 0} />
            <StatCard label="דירוג ממוצע" value={stats.avg_rating ? stats.avg_rating.toFixed(1) : "—"} />
            <StatCard label="מוצרים" value={stats.products ?? 0} />
            <StatCard label="הזמנות" value={stats.orders ?? 0} />
          </div>
        ) : (
          <p className="text-sm text-site-muted">הנתונים אינם זמינים כרגע.</p>
        )}
      </section>

      {/* Link to producer profile edit */}
      {status === "approved" && (
        <div className="text-center">
          <Link href="/producer/edit" className="text-sm text-primary hover:underline">
            ערכי פרופיל עסק &rarr;
          </Link>
        </div>
      )}

      {supportOpen && <SupportModal onClose={() => setSupportOpen(false)} />}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-[12px] bg-light px-4 py-3 text-center">
      <p className="text-2xl font-bold text-site-text">{value}</p>
      <p className="text-xs text-site-muted mt-0.5">{label}</p>
    </div>
  );
}

function SupportModal({ onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="צרי קשר עם התמיכה"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-[24px] sm:rounded-[20px] w-full max-w-sm p-6 space-y-4">
        <h2 className="font-semibold text-site-text text-lg">צרי קשר</h2>
        <p className="text-sm text-site-muted">נשמח לעזור. בחרי את הדרך הנוחה לך:</p>
        <a
          href="https://wa.me/972500000000"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-[14px] border border-border px-4 py-3 hover:bg-light transition"
        >
          <WhatsappLogo size={22} weight="fill" className="text-[#25D366] shrink-0" />
          <div>
            <p className="text-sm font-medium">וואטסאפ</p>
            <p className="text-xs text-site-muted">זמינות ב׳–ה׳ 9:00–17:00</p>
          </div>
        </a>
        <a
          href="mailto:support@mehamakor.online"
          className="flex items-center gap-3 rounded-[14px] border border-border px-4 py-3 hover:bg-light transition"
        >
          <EnvelopeSimple size={22} weight="duotone" className="text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">אימייל</p>
            <p className="text-xs text-site-muted">support@mehamakor.online</p>
          </div>
        </a>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-[12px] text-sm font-medium text-site-muted hover:text-site-text transition"
        >
          סגרי
        </button>
      </div>
    </div>
  );
}
