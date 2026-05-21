"use client";

import { forwardRef, Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  UserCircle,
  Lock,
  Storefront,
  Eye,
  EyeSlash,
  WhatsappLogo,
  EnvelopeSimple,
  Plus,
  Package,
  Trash,
  Pencil,
  X,
  Camera,
} from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import CitySearch from "@/components/CitySearch";
import PasswordInput from "@/components/PasswordInput";
import { firstFailureMessage } from "@/lib/passwordMessages";
import { env } from "@/lib/env";
import EmptyState from "@/components/ui/EmptyState";

function SettingsLoadingFallback() {
  const tCommon = useTranslations("settings.common");
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 text-site-muted">
      {tCommon("loading")}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsLoadingFallback />}>
      <SettingsPageBody />
    </Suspense>
  );
}

function SettingsPageBody() {
  const tCommon = useTranslations("settings.common");
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
        {tCommon("page_heading")}
      </h1>

      {/* Tab bar — overflow-x-auto so business tab stays reachable at 375px */}
      <div
        role="tablist"
        aria-label={tCommon("tabs_aria")}
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
          {tCommon("tab_profile")}
        </TabButton>
        <TabButton
          active={tab === "security"}
          onClick={() => selectTab("security")}
          icon={
            <Lock size={16} weight={tab === "security" ? "fill" : "duotone"} />
          }
        >
          {tCommon("tab_security")}
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
            {tCommon("tab_business")}
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
  const tCommon = useTranslations("settings.common");
  const t = useTranslations("settings.profile");
  const [name, setName] = useState(user.name || "");
  const [city, setCity] = useState(user.city || "");
  const [phone, setPhone] = useState(user.phone || "");
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
      setMessage(t("saved_msg"));
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err?.response?.data?.detail || t("save_error_fallback"));
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!ALLOWED.includes(file.type)) {
      setError(t("upload_type_error"));
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(t("upload_size_error"));
      e.target.value = "";
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.post("/upload/avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await refreshUser();
      setMessage(t("avatar_uploaded_msg"));
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err?.response?.data?.detail || t("avatar_upload_error_fallback"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();

  return (
    <section role="tabpanel" aria-label={t("tabpanel_aria")} className="bg-white border border-border rounded-[16px] p-6">
      {/* Avatar */}
      <div className="flex items-center gap-4 mb-6">
        <label
          htmlFor="avatar-upload"
          title={t("avatar_title")}
          className="relative w-16 h-16 rounded-full cursor-pointer group shrink-0"
          aria-label={t("avatar_aria")}
        >
          {user.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-semibold bg-primary">
              {initial}
            </div>
          )}
          {/* MEH-222: camera overlay — always visible on mobile (opacity-30) so the tap target is discoverable; desktop hides it until hover. */}
          <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-30 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            <Camera size={24} weight="light" className="text-white" aria-hidden="true" />
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
          <p className="text-xs text-site-muted mt-0.5">{t("avatar_hint")}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="profile-name" className="block text-sm font-medium mb-1">{t("field_name_label")} *</label>
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
          <label htmlFor="profile-city" className="block text-sm font-medium mb-1">
            {t("field_city_label")} <span className="text-site-muted font-normal">{tCommon("optional_suffix")}</span>
          </label>
          <CitySearch
            id="profile-city"
            value={city}
            onChange={setCity}
            placeholder={t("field_city_placeholder")}
          />
          <p className="text-xs text-site-muted mt-1 text-right">
            {t("field_city_hint")}
          </p>
        </div>
        <div>
          <label htmlFor="profile-email" className="block text-sm font-medium mb-1">{t("field_email_label")}</label>
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
              ? t("email_oauth_hint", { provider: oAuthProvider ?? t("email_oauth_provider_fallback") })
              : t("email_change_hint")}
          </p>
        </div>
        <div>
          <label htmlFor="profile-phone" className="block text-sm font-medium mb-1">
            {t("field_phone_label")} <span className="text-site-muted font-normal">{tCommon("optional_suffix")}</span>
          </label>
          <input
            id="profile-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="050-1234567"
            className="w-full border border-border rounded-[12px] px-3 py-2"
            dir="ltr"
          />
          <p className="text-xs text-site-muted mt-1 text-right">
            {t("field_phone_hint")}
          </p>
        </div>

        {message && <p className="text-sm text-primary" role="status">✓ {message}</p>}
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

        <button
          type="submit"
          disabled={!canSave || saving}
          className="bg-primary text-white px-6 py-2.5 rounded-[12px] hover:bg-primary-light transition font-medium disabled:opacity-50"
        >
          {saving ? tCommon("saving") : tCommon("save_cta")}
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
  // MEH-628: scoped translator for password-policy failure copy.
  const tValidation = useTranslations("auth.passwordValidation");
  // MEH-629 item 2: re-uses the existing reset-flow key for the
  // "new password" label + aria-label (same canonical HE string).
  const tReset = useTranslations("auth.passwordRecovery.reset");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [nextOk, setNextOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const mismatch = confirm.length > 0 && confirm !== next;
  // MEH-306: nextOk comes from <PasswordInput onValidityChange> (length OK
  // + breach not detected). Reuse (same_as_current) is enforced server-side
  // — no client check possible without exposing current_hash.
  const canSave = !isOAuth && current.length >= 1 && nextOk && next === confirm && !mismatch;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.patch("/users/me/password", { current_password: current, new_password: next });
      // 204 — backend reissued refresh + fingerprint cookies via Set-Cookie
      // (sub-A commit 52bb5f5). Browser auto-stores; /auth/refresh on this
      // device keeps working with the new cookies.
      setMessage("הסיסמה עודכנה בהצלחה");
      setCurrent(""); setNext(""); setConfirm("");
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (
        status === 422 &&
        detail &&
        typeof detail === "object" &&
        Array.isArray(detail.failures)
      ) {
        // MEH-306: backend ships {failures: ["too_short"|"too_common"|"same_as_current"]}.
        // Reuse (same_as_current) only fires from this endpoint (server has
        // current_hash); PasswordInput shows a "נבדק בשרת" pending tile
        // pre-submit so the user knows the check happens here.
        setError(firstFailureMessage(detail.failures, tValidation));
      } else if (typeof detail === "string") {
        setError(detail);
      } else {
        setError("שגיאה בעדכון הסיסמה");
      }
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

        {/* New password — MEH-306: PasswordInput owns input + eye toggle
            + live policy preview. showCurrentPasswordReuse renders a
            "נבדק בשרת" pending tile because reuse-vs-current_hash is
            enforced inside the change_password handler (server-only). */}
        <div>
          <label htmlFor="pw-new" className="block text-sm font-medium mb-1">{tReset("password_aria")} *</label>
          <PasswordInput
            id="pw-new"
            name="new"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder=""
            ariaLabel={tReset("password_aria")}
            showCurrentPasswordReuse={true}
            onValidityChange={setNextOk}
          />
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
              // rtl-ok
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
  const { user, deleteAccount } = useAuth();
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
      await deleteAccount(); // clears token + user state via auth context
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
  const t = useTranslations("settings.business");
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
          {t("status_pending")}
        </div>
      )}
      {status === "rejected" && (
        <div className="rounded-[12px] bg-red-50 border border-red-200 px-4 py-4 space-y-3">
          <p className="text-sm font-semibold text-red-700">{t("status_rejected_title")}</p>
          {rejectionReason && (
            <p className="text-sm text-red-600">{rejectionReason}</p>
          )}
          <ul className="space-y-1 text-sm text-red-700">
            <li className="flex items-start gap-2"><span>•</span><span>{t("rejected_tip_details")}</span></li>
            <li className="flex items-start gap-2"><span>•</span><span>{t("rejected_tip_photos")}</span></li>
            <li className="flex items-start gap-2"><span>•</span><span>{t("rejected_tip_address")}</span></li>
          </ul>
          <button
            type="button"
            onClick={() => setSupportOpen(true)}
            className="text-sm text-primary hover:underline"
          >
            {t("support_cta")}
          </button>
        </div>
      )}
      {status === "suspended" && (
        <div className="rounded-[12px] bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-2 text-sm text-amber-800">
          <span>⚠️</span>
          <span className="font-medium">{t("status_suspended")}</span>
          <button
            type="button"
            onClick={() => setSupportOpen(true)}
            className="ms-auto text-primary hover:underline text-xs"
          >
            {t("support_cta_short")}
          </button>
        </div>
      )}

      {/* Stats grid */}
      <section className={`bg-white border border-border rounded-[16px] p-6 ${dimmed ? "opacity-50 pointer-events-none select-none" : ""}`}>
        <h2 className="font-semibold text-site-text mb-4">{t("stats_heading")}</h2>
        {loadingStats ? (
          <p className="text-sm text-site-muted">{t("stats_loading")}</p>
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard label={t("stat_views")} value={stats.views ?? 0} />
            <StatCard label={t("stat_favorites")} value={stats.favorites ?? 0} />
            <StatCard label={t("stat_reviews")} value={stats.reviews ?? 0} />
            <StatCard label={t("stat_avg_rating")} value={stats.avg_rating ? stats.avg_rating.toFixed(1) : "—"} />
            <StatCard label={t("stat_products")} value={stats.products ?? 0} />
            <StatCard label={t("stat_orders")} value={stats.orders ?? 0} />
          </div>
        ) : (
          <p className="text-sm text-site-muted">{t("stats_unavailable")}</p>
        )}
      </section>

      {/* Link to producer profile edit */}
      {status === "approved" && (
        <div className="text-center">
          <Link href="/producer/edit" className="text-sm text-primary hover:underline">
            {t("edit_profile_link")}
          </Link>
        </div>
      )}

      {supportOpen && <SupportModal onClose={() => setSupportOpen(false)} />}
    </div>
  );
}

function ProductsSection() {
  const t = useTranslations("settings.products");
  const tForm = useTranslations("settings.products.form");
  const tErr = useTranslations("settings.products.errors");
  const tCommon = useTranslations("settings.common");
  const [products, setProducts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", image_url: "", price_min: "", price_max: "", is_gluten_free: false, is_vegan: false, is_lactose_free: false });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [editUploading, setEditUploading] = useState(false);

  useEffect(() => {
    api.get("/producers/me/products")
      .then((r) => setProducts(r.data))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!ALLOWED.includes(file.type)) {
      setError(tErr("upload_type"));
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(tErr("upload_size"));
      e.target.value = "";
      return;
    }
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/upload/image", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm((f) => ({ ...f, image_url: r.data.url }));
    } catch (err) {
      setError(err?.response?.data?.detail || tErr("upload_failed_fallback"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError(tErr("name_required")); return; }
    if (form.price_min === "") { setError(tErr("price_required")); return; }
    const minNum = Number(form.price_min);
    const maxNum = form.price_max === "" ? null : Number(form.price_max);
    if (minNum < 1) { setError(tErr("price_min_too_low")); return; }
    if (minNum > 10000 || (maxNum !== null && maxNum > 10000)) { setError(tErr("price_too_high")); return; }
    if (maxNum !== null && maxNum < minNum) { setError(tErr("price_max_below_min")); return; }
    setSaving(true);
    setError("");
    try {
      const body = {
        name: form.name.trim(),
        description: form.description || null,
        image_url: form.image_url || null,
        price_min: minNum,
        price_max: maxNum,
        is_gluten_free: form.is_gluten_free,
        is_vegan: form.is_vegan,
        is_lactose_free: form.is_lactose_free,
      };
      const r = await api.post("/producers/me/products", body);
      setProducts((p) => [...(p || []), r.data]);
      setForm({ name: "", description: "", image_url: "", price_min: "", price_max: "", is_gluten_free: false, is_vegan: false, is_lactose_free: false });
      setAdding(false);
    } catch {
      setError(tErr("save_failed"));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (product) => {
    setEditingId(product.id);
    setEditForm({
      name: product.name,
      description: product.description || "",
      image_url: product.image_url || "",
      price_min: product.price_min != null ? String(Number(product.price_min)) : "",
      price_max: product.price_max != null ? String(Number(product.price_max)) : "",
      is_gluten_free: !!product.is_gluten_free,
      is_vegan: !!product.is_vegan,
      is_lactose_free: !!product.is_lactose_free,
    });
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError("");
  };

  const handleEditImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!ALLOWED.includes(file.type)) {
      setError(tErr("upload_type"));
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(tErr("upload_size"));
      e.target.value = "";
      return;
    }
    setEditUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/upload/image", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setEditForm((f) => ({ ...f, image_url: r.data.url }));
    } catch (err) {
      setError(err?.response?.data?.detail || tErr("upload_failed_fallback"));
    } finally {
      setEditUploading(false);
      e.target.value = "";
    }
  };

  const handleEdit = async (productId, e) => {
    e.preventDefault();
    if (!editForm.name?.trim()) { setError(tErr("name_required")); return; }
    if (editForm.price_min === "") { setError(tErr("price_required")); return; }
    const minNum = Number(editForm.price_min);
    const maxNum = editForm.price_max === "" ? null : Number(editForm.price_max);
    if (minNum < 1) { setError(tErr("price_min_too_low")); return; }
    if (minNum > 10000 || (maxNum !== null && maxNum > 10000)) { setError(tErr("price_too_high")); return; }
    if (maxNum !== null && maxNum < minNum) { setError(tErr("price_max_below_min")); return; }
    setSavingEdit(true);
    setError("");
    try {
      const body = {
        name: editForm.name.trim(),
        description: editForm.description || null,
        image_url: editForm.image_url || null,
        price_min: minNum,
        price_max: maxNum,
        is_gluten_free: !!editForm.is_gluten_free,
        is_vegan: !!editForm.is_vegan,
        is_lactose_free: !!editForm.is_lactose_free,
      };
      const r = await api.put(`/producers/me/products/${productId}`, body);
      setProducts((p) => p.map((x) => (x.id === productId ? r.data : x)));
      setEditingId(null);
    } catch {
      setError(tErr("save_failed"));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/producers/me/products/${id}`);
      setProducts((p) => p.filter((pr) => pr.id !== id));
    } catch {
      setError(tErr("delete_failed"));
    }
  };

  if (loading) return null;

  return (
    <div className="bg-white border border-border rounded-[16px] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-headline text-lg font-bold text-site-text">{t("section_heading")}</h3>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setError(""); }}
            className="inline-flex items-center gap-1.5 text-sm text-primary border border-primary/30 rounded-[8px] px-3 py-1.5 hover:bg-primary/5 transition"
          >
            <Plus size={14} aria-hidden="true" />
            {t("add_cta")}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {products?.length === 0 && !adding && (
        <EmptyState
          emoji="🥕"
          title={t("empty.title")}
          description={t("empty.description")}
          ctaLabel={t("empty.cta")}
          ctaOnClick={() => { setAdding(true); setError(""); }}
        />
      )}

      <div className="space-y-3 mb-4">
        {products?.map((product) => (
          editingId === product.id ? (
            <form
              key={product.id}
              onSubmit={(e) => handleEdit(product.id, e)}
              className="border border-border rounded-[10px] p-4 space-y-3 bg-light"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-site-text">{t("edit_heading")}</p>
                <button type="button" onClick={cancelEdit} aria-label={t("cancel_aria")}>
                  <X size={16} className="text-site-muted" aria-hidden="true" />
                </button>
              </div>
              {product.price_min == null && product.price_range && (
                <p className="text-xs text-site-muted mb-2">
                  {t("edit_legacy_price_note", { range: product.price_range })}
                </p>
              )}
              <div>
                <label className="text-xs text-site-muted mb-1 block">{tForm("name_label")}</label>
                <input
                  required
                  value={editForm.name || ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-border rounded-[8px] px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs text-site-muted mb-1 block">{tForm("description_label")}</label>
                <input
                  value={editForm.description || ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full border border-border rounded-[8px] px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-site-muted mb-1 block">{tForm("price_min_label")}</label>
                  <input
                    required
                    type="number"
                    min={1}
                    max={10000}
                    step={0.5}
                    value={editForm.price_min || ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, price_min: e.target.value }))}
                    className="w-full border border-border rounded-[8px] px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-site-muted mb-1 block">{tForm("price_max_label")} <span className="text-site-muted">{tForm("price_max_optional_suffix")}</span></label>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    step={0.5}
                    value={editForm.price_max || ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, price_max: e.target.value }))}
                    className="w-full border border-border rounded-[8px] px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <p className="text-xs text-site-muted mb-2">{tForm("diet_heading")}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!editForm.is_gluten_free}
                      onChange={(e) => setEditForm((f) => ({ ...f, is_gluten_free: e.target.checked }))}
                      className="w-4 h-4 accent-primary"
                    />
                    <span>{tForm("diet_gluten_free")}</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!editForm.is_vegan}
                      onChange={(e) => setEditForm((f) => ({ ...f, is_vegan: e.target.checked }))}
                      className="w-4 h-4 accent-primary"
                    />
                    <span>{tForm("diet_vegan")}</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!editForm.is_lactose_free}
                      onChange={(e) => setEditForm((f) => ({ ...f, is_lactose_free: e.target.checked }))}
                      className="w-4 h-4 accent-primary"
                    />
                    <span>{tForm("diet_lactose_free")}</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="text-xs text-site-muted mb-1 block">{tForm("image_label")}</label>
                {editForm.image_url ? (
                  <div className="flex items-center gap-2">
                    <div className="relative w-12 h-12 rounded-[6px] overflow-hidden shrink-0">
                      <Image src={editForm.image_url} alt={tForm("image_alt")} fill className="object-cover" sizes="48px" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditForm((f) => ({ ...f, image_url: "" }))}
                      className="text-xs text-red-500 hover:underline"
                    >
                      {tForm("image_remove")}
                    </button>
                  </div>
                ) : (
                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-sm text-primary border border-primary/30 rounded-[8px] px-3 py-1.5 hover:bg-primary/5 transition">
                    <Package size={14} aria-hidden="true" />
                    {editUploading ? tForm("image_uploading") : tForm("image_upload_cta")}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleEditImageUpload}
                      disabled={editUploading}
                    />
                  </label>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingEdit || editUploading}
                  className="flex-1 bg-primary text-white rounded-[8px] py-2 text-sm font-medium hover:bg-primary-light transition disabled:opacity-50"
                >
                  {savingEdit ? t("save_edit_saving") : t("save_edit_cta")}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="px-4 bg-white border border-border text-site-text rounded-[8px] py-2 text-sm font-medium hover:bg-light transition"
                >
                  {t("cancel_edit_cta")}
                </button>
              </div>
            </form>
          ) : (
            <div key={product.id} className="flex items-center gap-3 p-3 rounded-[10px] bg-light">
              {product.image_url ? (
                <div className="relative w-12 h-12 shrink-0 rounded-[6px] overflow-hidden">
                  <Image src={product.image_url} alt={product.name} fill className="object-cover" sizes="48px" />
                </div>
              ) : (
                <div className="w-12 h-12 shrink-0 rounded-[6px] bg-white border border-border flex items-center justify-center">
                  <Package size={20} className="text-site-muted/60" aria-hidden="true" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-site-text truncate">{product.name}</p>
                {(() => {
                  if (product.price_min != null && product.price_max != null)
                    return <p className="text-xs text-accent">₪{Number(product.price_min)}–₪{Number(product.price_max)}</p>;
                  if (product.price_min != null)
                    return <p className="text-xs text-accent">₪{Number(product.price_min)}</p>;
                  if (product.price_range)
                    return <p className="text-xs text-accent">{product.price_range}</p>;
                  return null;
                })()}
              </div>
              <button
                onClick={() => startEdit(product)}
                aria-label={t("card.edit_aria_template", { name: product.name })}
                className="p-1.5 rounded-[6px] text-site-muted hover:text-primary hover:bg-primary/5 transition"
              >
                <Pencil size={16} aria-hidden="true" />
              </button>
              <button
                onClick={() => handleDelete(product.id)}
                aria-label={t("card.delete_aria_template", { name: product.name })}
                className="p-1.5 rounded-[6px] text-site-muted hover:text-red-500 hover:bg-red-50 transition"
              >
                <Trash size={16} aria-hidden="true" />
              </button>
            </div>
          )
        ))}
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="border border-border rounded-[10px] p-4 space-y-3 bg-light">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-site-text">{t("add_heading")}</p>
            <button type="button" onClick={() => { setAdding(false); setError(""); }} aria-label={t("cancel_aria")}>
              <X size={16} className="text-site-muted" aria-hidden="true" />
            </button>
          </div>
          <div>
            <label className="text-xs text-site-muted mb-1 block">{tForm("name_label")}</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-border rounded-[8px] px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs text-site-muted mb-1 block">{tForm("description_label")}</label>
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full border border-border rounded-[8px] px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-site-muted mb-1 block">{tForm("price_min_label")}</label>
              <input
                required
                type="number"
                min={1}
                max={10000}
                step={0.5}
                value={form.price_min}
                onChange={(e) => setForm((f) => ({ ...f, price_min: e.target.value }))}
                className="w-full border border-border rounded-[8px] px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-site-muted mb-1 block">{tForm("price_max_label")} <span className="text-site-muted">{tForm("price_max_optional_suffix")}</span></label>
              <input
                type="number"
                min={1}
                max={10000}
                step={0.5}
                value={form.price_max}
                onChange={(e) => setForm((f) => ({ ...f, price_max: e.target.value }))}
                className="w-full border border-border rounded-[8px] px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
              />
            </div>
          </div>
          <div>
            <p className="text-xs text-site-muted mb-2">{tForm("diet_heading")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_gluten_free}
                  onChange={(e) => setForm((f) => ({ ...f, is_gluten_free: e.target.checked }))}
                  className="w-4 h-4 accent-primary"
                />
                <span>{tForm("diet_gluten_free")}</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_vegan}
                  onChange={(e) => setForm((f) => ({ ...f, is_vegan: e.target.checked }))}
                  className="w-4 h-4 accent-primary"
                />
                <span>{tForm("diet_vegan")}</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_lactose_free}
                  onChange={(e) => setForm((f) => ({ ...f, is_lactose_free: e.target.checked }))}
                  className="w-4 h-4 accent-primary"
                />
                <span>{tForm("diet_lactose_free")}</span>
              </label>
            </div>
          </div>
          <div>
            <label className="text-xs text-site-muted mb-1 block">{tForm("image_label")}</label>
            {form.image_url ? (
              <div className="flex items-center gap-2">
                <div className="relative w-12 h-12 rounded-[6px] overflow-hidden shrink-0">
                  <Image src={form.image_url} alt={tForm("image_alt")} fill className="object-cover" sizes="48px" />
                </div>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, image_url: "" }))}
                  className="text-xs text-red-500 hover:underline"
                >
                  {tForm("image_remove")}
                </button>
              </div>
            ) : (
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-sm text-primary border border-primary/30 rounded-[8px] px-3 py-1.5 hover:bg-primary/5 transition">
                <Package size={14} aria-hidden="true" />
                {uploading ? tForm("image_uploading") : tForm("image_upload_cta")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                  disabled={uploading}
                />
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || uploading}
              className="flex-1 bg-primary text-white rounded-[8px] py-2 text-sm font-medium hover:bg-primary-light transition disabled:opacity-50"
            >
              {saving ? t("add_submitting") : t("add_submit_cta")}
            </button>
          </div>
        </form>
      )}
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
          href={`https://wa.me/${env.NEXT_PUBLIC_SUPPORT_PHONE || "972500000000"}`}
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
