"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { LinkBreak, Storefront, WarningCircle } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { Link, getPathname, useRouter } from "@/i18n/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { detailToMessage } from "@/lib/errors";
import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";
import { ProducerClaimPreviewSchema, ProducerClaimResultSchema } from "@/lib/api-schemas";
import { requiresFarmerDeclaration } from "@/lib/farmer-declaration";
import { clearClaimToken, readClaimToken, stashClaimToken } from "@/lib/claim-token";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import StatusPage from "@/components/StatusPage";

/**
 * Module:   ClaimClient
 * Purpose:  The page a business owner opens from the claim link (MEH-2321
 *           chunk B): see the draft we prepared, sign in with her OWN account,
 *           tick the same declarations as registration, and take the page.
 * Touches:  POST /producer-claim/preview {token} · POST /producer-claim
 *           (backend/app/routers/producer_claim.py). sessionStorage via
 *           lib/claim-token.js.
 * Does NOT: create accounts (GoogleAuthButton, /register and /login do), send
 *           analytics events (the token is a credential), or publish anything —
 *           the draft stays a draft until she sends it for review.
 * Related:  app/[locale]/register/producer/RegisterProducerClient.jsx (the
 *           declaration boxes and their strings, reused verbatim) ·
 *           components/admin/ClaimLinkPanel.jsx (where the link is minted).
 * History:  MEH-2324.
 *
 * Token flow: /claim/<token> stashes the token in this tab and replaces the
 * address with /claim, so nothing after the first request carries it — not
 * the login/register `redirect`, not Speed Insights, not Clarity.
 */

const VIEW = {
  LOADING: "loading",
  INVALID: "invalid",
  CLAIMED: "claimed",
  LOAD_ERROR: "load_error",
  READY: "ready",
};

export default function ClaimClient({ tokenFromPath = null }) {
  const t = useTranslations("claim");
  const tReg = useTranslations("auth.register.producer");
  const tErr = useTranslations("error");
  const locale = useLocale();
  const router = useRouter();
  // The token effect must run once per token, not once per router identity:
  // re-running it after a 404/409 has dropped the stored token would turn
  // "already claimed" into "invalid link".
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  });
  const { user, loading: authLoading, logout, refreshUser } = useAuth();

  const [token, setToken] = useState(null);
  const [view, setView] = useState(VIEW.LOADING);
  const [preview, setPreview] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [declarationConfirmed, setDeclarationConfirmed] = useState(false);
  const [farmerConfirmed, setFarmerConfirmed] = useState(false);
  const [validation, setValidation] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  // Sign-in errors are the guest view's only; the form never shows them.
  const [authError, setAuthError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Move the token out of the address bar before anything else happens.
  useEffect(() => {
    if (tokenFromPath) {
      if (stashClaimToken(tokenFromPath)) {
        routerRef.current.replace("/claim");
        return;
      }
      // Storage refused (some private modes): keep it in memory for this
      // render tree only. The address keeps the token, and the claim works for
      // an owner already signed in. A guest who signs in from here lands on a
      // token-less /claim and sees "link not active"; reopening the emailed
      // link then works. Accepted as rare; a dedicated message needs new copy.
      setToken(tokenFromPath);
      return;
    }
    const stored = readClaimToken();
    if (stored) setToken(stored);
    else setView(VIEW.INVALID);
  }, [tokenFromPath]);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    setView(VIEW.LOADING);
    api
      .post("/producer-claim/preview", { token })
      .then((response) => {
        if (cancelled) return;
        // Rule 19: a malformed payload is not a page to claim.
        const parsed = ProducerClaimPreviewSchema.safeParse(response.data);
        if (parsed.success) {
          setPreview(parsed.data);
          setView(VIEW.READY);
        } else {
          setView(VIEW.LOAD_ERROR);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        const status = error?.response?.status;
        if (status === 404) {
          clearClaimToken();
          setView(VIEW.INVALID);
        } else if (status === 409) {
          clearClaimToken();
          setView(VIEW.CLAIMED);
        } else {
          setView(VIEW.LOAD_ERROR);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  // Where /login and /register send her back to: the token-less address, with
  // this locale's prefix (their redirect is a plain path, not locale-aware).
  const backHere = getPathname({ href: "/claim", locale });
  const loginHref = `/login?redirect=${encodeURIComponent(backHere)}`;
  const registerHref = `/register?redirect=${encodeURIComponent(backHere)}`;

  const farmerRequired = requiresFarmerDeclaration(preview?.category_names);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    if (!agreedToTerms) return setValidation(tReg("validation.terms_required"));
    if (!declarationConfirmed) return setValidation(tReg("validation.declaration_required"));
    if (farmerRequired && !farmerConfirmed) return setValidation(tReg("validation.farmer_required"));
    setValidation(null);
    setSubmitting(true);
    try {
      const response = await api.post("/producer-claim", {
        token,
        // Same fold as registration: the grower line is part of the one
        // licensing declaration the server stamps (MEH-759 Chunk C).
        declaration_accepted: declarationConfirmed && (!farmerRequired || farmerConfirmed),
        terms_accepted: agreedToTerms,
      });
      // Any 2xx means the draft is already hers. An unexpected body is logged,
      // not shown: calling it a failure would send her into a retry that the
      // server answers with "already claimed".
      if (!ProducerClaimResultSchema.safeParse(response.data).success) {
        console.warn("[claim] unexpected claim response shape");
      }
      // Hold the loading view until the dashboard opens: refreshUser returns
      // her as an owner, and the has-business view would flash in between.
      setView(VIEW.LOADING);
      clearClaimToken();
      await refreshUser();
      router.push("/producer/dashboard");
    } catch (error) {
      setSubmitError(detailToMessage(error?.response?.data?.detail) || t("submit_error"));
    } finally {
      setSubmitting(false);
    }
  };

  if (view === VIEW.LOADING || (view === VIEW.READY && authLoading)) {
    return (
      <Shell>
        <p className="text-center text-fg-muted" role="status" data-testid="claim-loading">
          {t("loading")}
        </p>
      </Shell>
    );
  }

  // MEH-2567: the three dead-end states share StatusPage (line icon, no
  // card, centred) with the 404 and the email pages. Copy unchanged.
  if (view === VIEW.INVALID) {
    return (
      <StatusPage
        testid="claim-invalid"
        icon={LinkBreak}
        title={t("invalid.title")}
        body={t("invalid.body")}
        primary={{ href: "/contact", label: t("invalid.contact") }}
      />
    );
  }

  if (view === VIEW.CLAIMED) {
    const contact = { href: "/contact", label: t("claimed.contact") };
    return (
      <StatusPage
        testid="claim-claimed"
        icon={Storefront}
        title={t("claimed.title")}
        body={t("claimed.body")}
        primary={user ? contact : { href: "/login", label: t("claimed.login") }}
        secondary={user ? null : contact}
      />
    );
  }

  if (view === VIEW.LOAD_ERROR) {
    return (
      <StatusPage
        testid="claim-load-error"
        icon={WarningCircle}
        body={tErr("generic")}
        bodyRole="alert"
        primary={{ label: tErr("retry"), onClick: () => setAttempt((n) => n + 1), testid: "claim-retry" }}
      />
    );
  }

  const isAdmin = user?.role === "admin";
  const hasBusiness = Boolean(user && (user.producer_id || user.is_producer));

  return (
    <Shell testid="claim-ready">
      <Preview preview={preview} kicker={t("kicker")} />
      <p className="text-fg-muted mb-6" data-testid="claim-explainer">
        {t("explainer")}
      </p>

      {!user && (
        <div data-testid="claim-logged-out" className="space-y-4">
          <p className="text-text">{t("logged_out.body")}</p>
          <GoogleAuthButton onError={(msg) => setAuthError(msg)} />
          <PrimaryLink href={registerHref} testid="claim-email-signup">
            {t("logged_out.email_signup")}
          </PrimaryLink>
          <p className="text-sm text-fg-muted">{t("logged_out.email_note")}</p>
          <p className="text-sm text-fg-muted">
            {t("logged_out.have_account")}{" "}
            <Link href={loginHref} data-testid="claim-login" className="text-primary font-medium hover:underline">
              {t("logged_out.login")}
            </Link>
          </p>
          {authError && (
            <p className="text-sm text-error" role="alert" data-testid="claim-auth-error">
              {authError}
            </p>
          )}
        </div>
      )}

      {user && isAdmin && (
        <div data-testid="claim-admin" className="space-y-4">
          <p className="text-text">{t("admin.body")}</p>
          <SwitchAccount onClick={logout}>{t("admin.switch_account")}</SwitchAccount>
        </div>
      )}

      {user && !isAdmin && hasBusiness && (
        <div data-testid="claim-has-business" className="space-y-4">
          <p className="text-text">{t("has_business.body")}</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <PrimaryLink href="/producer/dashboard">{t("has_business.dashboard")}</PrimaryLink>
            <SwitchAccount onClick={logout}>{t("has_business.switch_account")}</SwitchAccount>
          </div>
        </div>
      )}

      {user && !isAdmin && !hasBusiness && (
        <form onSubmit={submit} noValidate data-testid="claim-form" className="space-y-4">
          <p className="text-sm text-fg-muted">
            {/* The address is LTR inside an RTL sentence: isolate it, or the
                trailing dot jumps to its other side. */}
            {t.rich("eligible.signed_in_as", {
              email: user.email,
              addr: (chunks) => <bdi dir="ltr">{chunks}</bdi>,
            })}{" "}
            {t("eligible.not_you")}{" "}
            <button
              type="button"
              onClick={logout}
              data-testid="claim-switch-account"
              className="text-primary font-medium hover:underline"
            >
              {t("eligible.switch_account")}
            </button>
          </p>

          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              data-testid="claim-terms"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="w-5 h-5 accent-primary mt-0.5 flex-shrink-0"
            />
            <span className="leading-relaxed text-fg-muted">
              {tReg("terms.intro")}{" "}
              <Link href="/terms" target="_blank" className="text-primary hover:underline">{tReg("terms.tos_link")}</Link>{" "}
              {tReg("terms.and")}<Link href="/privacy" target="_blank" className="text-primary hover:underline">{tReg("terms.privacy_link")}</Link>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              data-testid="claim-declaration"
              checked={declarationConfirmed}
              onChange={(e) => setDeclarationConfirmed(e.target.checked)}
              className="w-5 h-5 accent-primary mt-0.5 flex-shrink-0"
            />
            <span className="leading-relaxed text-fg-muted">{tReg("terms.declaration")}</span>
          </label>

          {farmerRequired && (
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                data-testid="claim-farmer"
                checked={farmerConfirmed}
                onChange={(e) => setFarmerConfirmed(e.target.checked)}
                className="w-5 h-5 accent-primary mt-0.5 flex-shrink-0"
              />
              <span className="leading-relaxed text-fg-muted">{tReg("terms.farmer_declaration")}</span>
            </label>
          )}

          {(validation || submitError) && (
            <p className="text-sm text-error" role="alert" data-testid="claim-error">
              {validation || submitError}
            </p>
          )}

          <button
            type="submit"
            data-testid="claim-submit"
            disabled={submitting}
            className="min-h-[44px] w-full bg-primary text-white rounded-[12px] px-6 py-2 font-medium hover:bg-primary-dark transition disabled:opacity-50"
          >
            {submitting ? t("eligible.submitting") : t("eligible.submit")}
          </button>
        </form>
      )}
    </Shell>
  );
}

function Shell({ children, testid }) {
  return (
    <div className="max-w-xl mx-auto px-4 py-10" data-testid={testid}>
      <div className="bg-white rounded-[12px] border border-border p-6">{children}</div>
    </div>
  );
}

function isCloudinaryUrl(value) {
  try {
    return new URL(value).hostname === "res.cloudinary.com";
  } catch {
    return false;
  }
}

function Preview({ preview, kicker }) {
  // next/image throws on a host next.config does not allow, so an image from
  // anywhere else is left out rather than breaking the page.
  const src = isCloudinaryUrl(preview.image)
    ? optimizeCloudinary(preview.image, { aspectRatio: IMAGE_RATIOS.banner, width: 640 })
    : null;
  return (
    <div className="mb-4" data-testid="claim-preview">
      <p className="text-sm font-medium text-primary mb-2">{kicker}</p>
      {src && (
        <div className="relative w-full aspect-video overflow-hidden rounded-[12px] bg-background mb-4">
          <Image src={src} alt={preview.name} fill sizes="(max-width: 640px) 100vw, 560px" className="object-cover" />
        </div>
      )}
      <h1 className="font-headline-lg text-3xl font-black text-text" data-testid="claim-name">
        {preview.name}
      </h1>
      {preview.city && <p className="text-fg-muted mt-1">{preview.city}</p>}
      {preview.short_description && <p className="text-text mt-3">{preview.short_description}</p>}
    </div>
  );
}

function PrimaryLink({ href, children, testid }) {
  return (
    <Link
      href={href}
      data-testid={testid}
      className="min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center bg-primary text-white rounded-[12px] px-6 py-2 font-medium hover:bg-primary-dark transition"
    >
      {children}
    </Link>
  );
}

function SwitchAccount({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="claim-switch-account"
      className="min-h-[44px] w-full sm:w-auto bg-white border border-primary text-primary rounded-[12px] px-6 py-2 font-medium hover:bg-background transition"
    >
      {children}
    </button>
  );
}
