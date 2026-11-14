// @ts-check
"use client";

/**
 * Module:   AccountDeleteCard
 * Purpose:  The «מחיקת חשבון» card on /settings → security. It proves the
 *           person asking owns the account before calling POST /auth/me/delete,
 *           and tells a business owner what goes with her account.
 * Touches:  GET /producers/me (business name, owners only) · POST /auth/me/delete
 *           (via auth-context deleteAccount, which then leaves for /account-deleted).
 * Does NOT: decide who may delete — the server does (services/account_guards.py).
 *           The admin branch below only spares an admin a form the server refuses.
 * States:   admin / super-admin → explanation, no button · idle → button ·
 *           confirm → email gate + password, or a Google/Apple sign-in for an
 *           account without one · owner → business warning + «בהפסקה» link
 *           (blocked until the business name loads).
 * History:  MEH-3248 (B3 + B7 + D15, 14/11/2026) — moved out of
 *           app/[locale]/settings/page.jsx; replaced the false 30-day «grace»
 *           screen with the public /account-deleted page.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { env } from "@/lib/env";
import { gsiLang, useGoogleSignIn } from "@/lib/use-google-sign-in";
import Input from "@/components/ui/Input";
import PasswordField from "@/components/ui/PasswordField";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";

const PROVIDER_LABEL = { google: "Google", apple: "Apple" };
const APPLE_JS =
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
// The availability switch lives on the dashboard home (dashboard/page.js).
const PAUSE_HREF = "/producer/dashboard#availability-heading";

/** @param {{ onToken: (token: string) => void }} props */
function GoogleReauth({ onToken }) {
  const ref = useRef(/** @type {HTMLDivElement | null} */ (null));
  const clientId = env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  useGoogleSignIn(
    clientId,
    (/** @type {{ credential: string }} */ response) => onToken(response.credential),
    () => {
      if (ref.current) {
        // @ts-ignore — GSI is a global script, typed nowhere in this repo.
        window.google.accounts.id.renderButton(ref.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          locale: gsiLang(),
        });
      }
    },
  );
  return <div ref={ref} data-testid="delete-reauth-google" />;
}

/** @param {{ onToken: (token: string) => void, label: string }} props */
function AppleReauth({ onToken, label }) {
  const clientId = env.NEXT_PUBLIC_APPLE_CLIENT_ID;
  useEffect(() => {
    if (!clientId) return undefined;
    const script = document.createElement("script");
    script.src = APPLE_JS;
    script.async = true;
    script.onload = () => {
      // @ts-ignore — AppleID is a global script.
      window.AppleID?.auth.init({
        clientId,
        scope: "name email",
        redirectURI: env.NEXT_PUBLIC_APPLE_REDIRECT_URI || window.location.origin,
        usePopup: true,
      });
    };
    document.body.appendChild(script);
    return () => script.remove();
  }, [clientId]);
  const signIn = async () => {
    try {
      // @ts-ignore — AppleID is a global script.
      const res = await window.AppleID?.auth.signIn();
      if (res?.authorization?.id_token) onToken(res.authorization.id_token);
    } catch {
      // popup closed: nothing to do, the prompt stays on screen
    }
  };
  return (
    <button
      type="button"
      onClick={signIn}
      data-testid="delete-reauth-apple"
      className="w-full bg-black text-white py-3 rounded-sm font-medium"
    >
      {label}
    </button>
  );
}

/** The business that goes with the account, or null while loading/failed. */
function useOwnBusinessName(/** @type {boolean} */ isOwner) {
  const [name, setName] = useState(/** @type {string | null} */ (null));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!isOwner) return;
    api
      .get("/producers/me")
      .then((/** @type {{ data: { name?: string } }} */ r) => setName(r.data?.name || ""))
      .catch(() => setFailed(true));
  }, [isOwner]);
  return { name, failed };
}

/** @param {{ isSuper: boolean }} props */
function AdminNotice({ isSuper }) {
  const t = useTranslations("settings.security.danger_zone");
  return (
    <section className="bg-surface border border-danger-200 rounded-lg p-6" data-testid="delete-admin-notice">
      <h2 className="font-semibold text-danger-700 mb-1">{t("heading")}</h2>
      <p className="text-sm text-fg-muted">{t(isSuper ? "super_admin_blocked" : "admin_blocked")}</p>
    </section>
  );
}

/** @param {{ name: string }} props */
function OwnerWarning({ name }) {
  const t = useTranslations("settings.security.danger_zone");
  return (
    <div className="space-y-2 text-sm" data-testid="delete-owner-warning">
      <p className="text-danger-700">{t("business_warning", { name })}</p>
      <p className="text-fg-muted">
        {t("pause_offer")}{" "}
        <Link href={PAUSE_HREF} className="text-primary underline underline-offset-[5px]">
          {t("pause_cta")}
        </Link>
      </p>
    </div>
  );
}

export default function AccountDeleteCard() {
  const { user, deleteAccount } = useAuth();
  const t = useTranslations("settings.security.danger_zone");
  const tPw = useTranslations("settings.security.password");
  const tCommon = useTranslations("settings.security.common");
  const tOauth = useTranslations("auth.oauth");
  const [open, setOpen] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const isOwner = Boolean(user?.producer_id);
  const business = useOwnBusinessName(isOwner && open);

  if (!user) return null;
  if (user.role === "admin" || user.is_super_admin) {
    return <AdminNotice isSuper={Boolean(user.is_super_admin)} />;
  }

  const provider = user.is_oauth ? user.oauth_provider : null;
  const emailMatch = emailInput.trim().toLowerCase() === (user.email || "").toLowerCase();
  const businessReady = !isOwner || business.name !== null;

  const submit = async (/** @type {Record<string, string>} */ body) => {
    setLoading(true);
    setError(null);
    try {
      await deleteAccount(body); // navigates to /account-deleted on success
    } catch (/** @type {any} */ err) {
      setError(detailToMessage(err?.response?.data?.detail) || tCommon("error_retry"));
      setLoading(false);
    }
  };
  const close = () => {
    setOpen(false);
    setEmailInput("");
    setPassword("");
    setError(null);
  };

  return (
    <section className="bg-surface border border-danger-200 rounded-lg p-6">
      <h2 className="font-semibold text-danger-700 mb-1">{t("heading")}</h2>
      <p className="text-sm text-fg-muted mb-4">{t("body")}</p>

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border border-danger-400 text-danger-600 px-5 py-2 rounded-md text-sm font-medium hover:bg-danger-50 transition"
        >
          {t("delete_cta")}
        </button>
      )}

      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (emailMatch && businessReady && !provider) submit({ password });
          }}
          className="space-y-3"
        >
          {isOwner && business.name !== null && <OwnerWarning name={business.name} />}
          {isOwner && business.failed && <InlineMessage size="xs">{tCommon("error_retry")}</InlineMessage>}
          <label htmlFor="danger-email" className="block text-sm font-medium text-danger-700">
            {t("confirm_email_label")}
          </label>
          <Input
            id="danger-email"
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder={user.email || ""}
            dir="ltr"
            autoComplete="off"
          />
          {!provider && (
            <PasswordField
              id="danger-password"
              label={tPw("current_label")}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              showLabel={tPw("eye_show_current")}
              hideLabel={tPw("eye_hide_current")}
              autoComplete="current-password"
            />
          )}
          {provider && emailMatch && businessReady && (
            <div className="space-y-2" data-testid="delete-reauth">
              <p className="text-sm text-fg-muted">
                {t("reauth_prompt", { provider: PROVIDER_LABEL[provider] || provider })}
              </p>
              {provider === "google" && <GoogleReauth onToken={(id_token) => submit({ id_token })} />}
              {provider === "apple" && (
                <AppleReauth onToken={(id_token) => submit({ id_token })} label={tOauth("apple_continue")} />
              )}
            </div>
          )}
          {error && <InlineMessage size="xs">{error}</InlineMessage>}
          <div className="flex gap-2">
            {!provider && (
              <Button
                type="submit"
                disabled={!emailMatch || !password || !businessReady || loading}
                variant="danger"
                size="sm"
              >
                {loading ? t("submit_deleting") : t("submit_cta")}
              </Button>
            )}
            <button
              type="button"
              onClick={close}
              className="px-5 py-2 rounded-md text-sm font-medium text-fg-muted hover:text-text transition"
            >
              {tCommon("cancel")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
