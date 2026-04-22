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
// CHUNK 3+ placeholders
// ---------------------------------------------------------------------------
function SecurityTab() { return null; }
function BusinessTab() { return null; }
