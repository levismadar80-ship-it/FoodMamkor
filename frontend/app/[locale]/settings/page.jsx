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
  Camera,
  Warning,
  CheckCircle,
  HourglassSimple,
} from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import CitySearch from "@/components/CitySearch";
import PasswordInput from "@/components/PasswordInput";
import { firstFailureMessage } from "@/lib/passwordMessages";
import { env } from "@/lib/env";

function SettingsLoadingFallback() {
  const tCommon = useTranslations("settings.common");
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 text-fg-muted">
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
      <h1 className="font-headline-lg text-3xl font-bold text-text mb-6">
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
              weight={tab === "profile" ? "fill" : "regular"}
            />
          }
        >
          {tCommon("tab_profile")}
        </TabButton>
        <TabButton
          active={tab === "security"}
          onClick={() => selectTab("security")}
          icon={
            <Lock size={16} weight={tab === "security" ? "fill" : "regular"} />
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
                weight={tab === "business" ? "fill" : "regular"}
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
          : "text-fg-muted hover:text-text"
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
      setError(detailToMessage(err?.response?.data?.detail) || t("save_error_fallback"));
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
      setError(detailToMessage(err?.response?.data?.detail) || t("avatar_upload_error_fallback"));
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
          <p className="font-semibold text-text">{user.name}</p>
          <p className="text-sm text-fg-muted" dir="ltr">{user.email}</p>
          <p className="text-xs text-fg-muted mt-0.5">{t("avatar_hint")}</p>
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
            {t("field_city_label")} <span className="text-fg-muted font-normal">{tCommon("optional_suffix")}</span>
          </label>
          <CitySearch
            id="profile-city"
            value={city}
            onChange={setCity}
            placeholder={t("field_city_placeholder")}
          />
          <p className="text-xs text-fg-muted mt-1 text-right">
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
            className="w-full border border-border rounded-[12px] px-3 py-2 bg-green-50 text-fg-muted cursor-not-allowed"
            dir="ltr"
          />
          <p className="text-xs text-fg-muted mt-1 text-right">
            {isOAuth
              ? t("email_oauth_hint", { provider: oAuthProvider ?? t("email_oauth_provider_fallback") })
              : t("email_change_hint")}
          </p>
        </div>
        <div>
          <label htmlFor="profile-phone" className="block text-sm font-medium mb-1">
            {t("field_phone_label")} <span className="text-fg-muted font-normal">{tCommon("optional_suffix")}</span>
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
          <p className="text-xs text-fg-muted mt-1 text-right">
            {t("field_phone_hint")}
          </p>
        </div>

        {message && (
          <p className="text-sm text-primary inline-flex items-center gap-1" role="status">
            <CheckCircle size={15} weight="fill" aria-hidden="true" />
            {message}
          </p>
        )}
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

        <button
          type="submit"
          disabled={!canSave || saving}
          className="bg-primary text-white px-6 py-2.5 rounded-[12px] hover:bg-primary-dark transition font-medium disabled:opacity-50"
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
  // MEH-475 S2-a: card-scoped translator (security.common reserved for S2-b/c).
  const t = useTranslations("settings.security.password");
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
      setMessage(t("save_toast"));
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
        setError(t("error_fallback"));
      }
    } finally {
      setSaving(false);
    }
  };

  if (isOAuth) {
    return (
      <section role="tabpanel" aria-label={t("oauth_tabpanel_aria")} className="bg-white border border-border rounded-[16px] p-6">
        <h2 className="font-semibold text-text mb-2">{t("oauth_heading")}</h2>
        <p className="text-sm text-fg-muted">{t("oauth_body")}</p>
      </section>
    );
  }

  return (
    <section className="bg-white border border-border rounded-[16px] p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-text">{t("heading")}</h2>
        <Link href="/forgot-password" className="text-xs text-primary hover:underline">
          {t("forgot_link")}
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Current password */}
        <div>
          <label htmlFor="sec-current" className="block text-sm font-medium mb-1">{t("current_label")}</label>
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-text transition rounded-full p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label={showCurrent ? t("eye_hide_current") : t("eye_show_current")}
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
          <label htmlFor="sec-confirm" className="block text-sm font-medium mb-1">{t("confirm_label")}</label>
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-text transition rounded-full p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label={showConfirm ? t("eye_hide_confirm") : t("eye_show_confirm")}
              aria-pressed={showConfirm}
            >
              {showConfirm ? <EyeSlash size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          {mismatch && (
            <p className="text-xs text-red-500 mt-1 text-right" role="alert">{t("mismatch_error")}</p>
          )}
        </div>

        {message && (
          <p className="text-sm text-primary inline-flex items-center gap-1" role="status">
            <CheckCircle size={15} weight="fill" aria-hidden="true" />
            {message}
          </p>
        )}
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

        <button
          type="submit"
          disabled={!canSave || saving}
          className="bg-primary text-white px-6 py-2.5 rounded-[12px] hover:bg-primary-dark transition font-medium disabled:opacity-50"
        >
          {saving ? t("submit_saving") : t("submit_cta")}
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
  // MEH-475 S2-b: card-scoped + shared-common translators.
  const t = useTranslations("settings.security.logout_all");
  const tCommon = useTranslations("settings.security.common");
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
      setError(tCommon("error_retry"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-white border border-border rounded-[16px] p-6">
      <h2 className="font-semibold text-text mb-1">{t("heading")}</h2>
      <p className="text-sm text-fg-muted mb-4">
        {t("body")}
      </p>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="border border-amber-500 text-amber-700 px-5 py-2 rounded-[12px] text-sm font-medium hover:bg-amber-50 transition"
        >
          {t("heading")}
        </button>
      ) : (
        <div className="rounded-[12px] bg-amber-50 border border-amber-200 p-4 space-y-3">
          <p className="text-sm text-amber-800 font-medium">{t("confirm_prompt")}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleLogout}
              disabled={loading}
              className="bg-amber-500 text-white px-5 py-2 rounded-[12px] text-sm font-medium hover:bg-amber-600 transition disabled:opacity-50"
            >
              {loading ? t("confirm_submitting") : t("confirm_submit")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-5 py-2 rounded-[12px] text-sm font-medium text-fg-muted hover:text-text transition"
            >
              {tCommon("cancel")}
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
  // MEH-475 S2-c: card-scoped + shared-common translators.
  const t = useTranslations("settings.security.danger_zone");
  const tCommon = useTranslations("settings.security.common");
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
      setError(detailToMessage(err?.response?.data?.detail) || tCommon("error_retry"));
    } finally {
      setLoading(false);
    }
  };

  if (phase === "grace") {
    return (
      <section className="bg-white border border-red-200 rounded-[16px] p-6 text-center space-y-3">
        {/* MEH-990: raw ⏳ emoji → Phosphor HourglassSimple (grace/waiting state) */}
        <HourglassSimple size={32} weight="regular" aria-hidden="true" className="text-fg-muted" />
        <h2 className="font-semibold text-text">{t("grace_heading")}</h2>
        <p className="text-sm text-fg-muted">
          {t("grace_body")}
        </p>
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="mt-2 text-sm text-primary hover:underline"
        >
          {t("back_to_login")}
        </button>
      </section>
    );
  }

  return (
    <section className="bg-white border border-red-200 rounded-[16px] p-6">
      <h2 className="font-semibold text-red-700 mb-1">{t("heading")}</h2>
      <p className="text-sm text-fg-muted mb-4">
        {t("body")}
      </p>

      {phase === "idle" && (
        <button
          type="button"
          onClick={() => setPhase("confirm")}
          className="border border-red-400 text-red-600 px-5 py-2 rounded-[12px] text-sm font-medium hover:bg-red-50 transition"
        >
          {t("delete_cta")}
        </button>
      )}

      {phase === "confirm" && (
        <form onSubmit={handleDelete} className="space-y-3">
          <label htmlFor="danger-email" className="block text-sm font-medium text-red-700">
            {t("confirm_email_label")}
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
              {loading ? t("submit_deleting") : t("submit_cta")}
            </button>
            <button
              type="button"
              onClick={() => { setPhase("idle"); setEmailInput(""); setError(null); }}
              className="px-5 py-2 rounded-[12px] text-sm font-medium text-fg-muted hover:text-text transition"
            >
              {tCommon("cancel")}
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
  const [supportOpen, setSupportOpen] = useState(false);

  const status = user.producer_status || "pending";
  const rejectionReason = user.producer_rejection_reason;

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
          <Warning size={18} weight="fill" aria-hidden="true" />
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

      {/* MEH-963: the canonical analytics + profile-management surface is
          /producer/dashboard. The old statistics grid here read fields the
          /producers/me/dashboard endpoint never returns (views / reviews /
          products / orders / avg_rating), so it rendered a permanent 0/- wall
          for every owner — new or established. Removed in favor of an
          always-visible pointer to the real dashboard (un-gated from
          status === "approved" — owners need it while pending too). */}
      <div className="text-center">
        <Link href="/producer/dashboard" className="text-sm text-primary hover:underline">
          {t("edit_profile_link")}
        </Link>
      </div>

      {supportOpen && <SupportModal onClose={() => setSupportOpen(false)} />}
    </div>
  );
}

function SupportModal({ onClose }) {
  // MEH-652: SupportModal i18n — final settings/page.jsx residual.
  const t = useTranslations("settings.support_modal");
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("section_aria")}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-[24px] sm:rounded-[20px] w-full max-w-sm p-6 space-y-4">
        <h2 className="font-semibold text-text text-lg">{t("heading")}</h2>
        <p className="text-sm text-fg-muted">{t("body")}</p>
        <a
          href={`https://wa.me/${env.NEXT_PUBLIC_SUPPORT_PHONE || "972500000000"}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-[14px] border border-border px-4 py-3 hover:bg-green-50 transition"
        >
          <WhatsappLogo size={22} weight="fill" className="text-[#25D366] shrink-0" />
          <div>
            <p className="text-sm font-medium">{t("whatsapp_label")}</p>
            <p className="text-xs text-fg-muted">{t("whatsapp_hours")}</p>
          </div>
        </a>
        <a
          href="mailto:support@mehamakor.online"
          className="flex items-center gap-3 rounded-[14px] border border-border px-4 py-3 hover:bg-green-50 transition"
        >
          <EnvelopeSimple size={22} className="text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">{t("email_label")}</p>
            <p className="text-xs text-fg-muted">support@mehamakor.online</p>
          </div>
        </a>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-[12px] text-sm font-medium text-fg-muted hover:text-text transition"
        >
          {t("close_cta")}
        </button>
      </div>
    </div>
  );
}
