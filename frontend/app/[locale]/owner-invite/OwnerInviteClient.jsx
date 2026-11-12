"use client";

import { useEffect, useRef, useState } from "react";
import { LinkBreak, WarningCircle } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { detailToMessage } from "@/lib/errors";
import { firstFailureMessage } from "@/lib/passwordMessages";
import { OwnerInvitePublicSchema } from "@/lib/api-schemas";
import {
  clearOwnerInviteToken,
  readOwnerInviteToken,
  stashOwnerInviteToken,
} from "@/lib/claim-token";
import PasswordInput from "@/components/PasswordInput";
import StatusPage from "@/components/StatusPage";
import BrandLoader from "@/components/BrandLoader";
import Button from "@/components/ui/Button";

/**
 * Module:   OwnerInviteClient
 * Purpose:  What a business owner opens from the invite email (MEH-2974): the
 *           page we built for her is already live, and one step is left —
 *           choose a password, accept the terms and sign the licensing
 *           declaration. She then lands in her dashboard, signed in.
 * Touches:  GET /auth/owner-invite/{token} · POST /auth/owner-invite/accept
 *           (backend/app/routers/producer_owner_invite.py). sessionStorage via
 *           lib/claim-token.js.
 * Does NOT: ask her to sign in first (there is no account until she accepts —
 *           that is the whole difference from /claim), offer Google sign-in
 *           (v1; the account is created with the password she sets), or
 *           publish anything — the business is already approved.
 * Related:  app/[locale]/claim/ClaimClient.jsx (the DRAFT sibling) ·
 *           app/[locale]/register/producer/RegisterProducerClient.jsx (the
 *           declaration copy, reused by KEY so there is no second wording) ·
 *           components/admin/OwnerInvitePanel.jsx (where the link is minted).
 * History:  MEH-2974.
 *
 * Token flow, copied from /claim (MEH-2324) because the reasoning carries
 * over and the token here is strictly more powerful: /owner-invite/<token>
 * stashes the token in this tab and replaces the address with /owner-invite,
 * so nothing after the first request carries it — not Speed Insights, not
 * Clarity, not a Sentry breadcrumb. `lib/claim-token.js` also scrubs what was
 * recorded BEFORE the swap.
 */

const VIEW = {
  LOADING: "loading",
  INVALID: "invalid",
  LOAD_ERROR: "load_error",
  READY: "ready",
};

export default function OwnerInviteClient({ tokenFromPath = null }) {
  const t = useTranslations("owner_invite");
  const tReg = useTranslations("auth.register.producer");
  const tErr = useTranslations("error");
  // MEH-628's scoped translator for password-policy failure copy — the same
  // one ResetPasswordClient hands to `firstFailureMessage`. Separate from
  // `tReg` because the strings live in a different namespace, and reusing the
  // existing keys is what keeps this page from inventing a second wording for
  // "that password has appeared in a breach".
  const tPasswordValidation = useTranslations("auth.passwordValidation");
  const router = useRouter();
  // The token effect must run once per token, not once per router identity.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  });
  const { refreshUser } = useAuth();

  const [token, setToken] = useState(null);
  const [view, setView] = useState(VIEW.LOADING);
  const [invite, setInvite] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const [password, setPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [declarationConfirmed, setDeclarationConfirmed] = useState(false);
  const [farmerConfirmed, setFarmerConfirmed] = useState(false);
  const [validation, setValidation] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Move the token out of the address bar before anything else happens.
  useEffect(() => {
    if (tokenFromPath) {
      if (stashOwnerInviteToken(tokenFromPath)) {
        routerRef.current.replace("/owner-invite");
        return;
      }
      // Storage refused (some private modes): keep it in memory for this
      // render tree only. The address keeps the token and the flow still
      // works — this page needs no navigation away and back, unlike /claim,
      // because there is no sign-in step in the middle.
      setToken(tokenFromPath);
      return;
    }
    const stored = readOwnerInviteToken();
    if (stored) setToken(stored);
    else setView(VIEW.INVALID);
  }, [tokenFromPath]);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    setView(VIEW.LOADING);
    api
      .get(`/auth/owner-invite/${encodeURIComponent(token)}`)
      .then((response) => {
        if (cancelled) return;
        // Rule 19: a malformed payload is not an invite to accept.
        const parsed = OwnerInvitePublicSchema.safeParse(response.data);
        if (parsed.success) {
          setInvite(parsed.data);
          setView(VIEW.READY);
        } else {
          setView(VIEW.LOAD_ERROR);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        // The server answers ONE 404 for every dead link — expired, used,
        // replaced, cancelled, never existed — so there is one view for it.
        // Anything else is a fault on our side and keeps its own retry.
        if (error?.response?.status === 404) {
          clearOwnerInviteToken();
          setView(VIEW.INVALID);
        } else {
          setView(VIEW.LOAD_ERROR);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  const farmerRequired = Boolean(invite?.requires_farmer_declaration);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    if (!agreedToTerms) return setValidation(tReg("validation.terms_required"));
    if (!declarationConfirmed) return setValidation(tReg("validation.declaration_required"));
    if (farmerRequired && !farmerConfirmed) return setValidation(tReg("validation.farmer_required"));
    setValidation(null);
    setSubmitting(true);
    try {
      await api.post("/auth/owner-invite/accept", {
        token,
        password,
        // Same fold as registration and /claim: the grower line is part of the
        // ONE licensing declaration the server stamps (MEH-759 Chunk C).
        declaration_accepted: declarationConfirmed && (!farmerRequired || farmerConfirmed),
        terms_accepted: agreedToTerms,
      });
      // Hold the loading view until the dashboard opens: refreshUser returns
      // her as an owner, and any intermediate view would flash in between.
      setView(VIEW.LOADING);
      clearOwnerInviteToken();
      await refreshUser();
      router.push("/producer/dashboard");
    } catch (error) {
      const status = error?.response?.status;
      const detail = error?.response?.data?.detail;
      if (status === 404) {
        // The link died between load and submit (a resend, a cancel, or the
        // expiry passing while the form was open).
        clearOwnerInviteToken();
        setView(VIEW.INVALID);
        return;
      }
      if (status === 422 && detail && typeof detail === "object" && Array.isArray(detail.failures)) {
        // The server-only half of the password policy (deny-list, HIBP) — the
        // live checklist in PasswordInput cannot know these.
        setSubmitError(firstFailureMessage(detail.failures, tPasswordValidation));
        return;
      }
      setSubmitError(detailToMessage(detail) || t("submit_error"));
    } finally {
      setSubmitting(false);
    }
  };

  if (view === VIEW.LOADING) {
    return (
      <Shell>
        <BrandLoader label={t("loading")} testId="owner-invite-loading" className="min-h-0 py-8" />
      </Shell>
    );
  }

  if (view === VIEW.INVALID) {
    return (
      // Body only, no heading. The approved copy for this state is ONE
      // sentence (<hebrew_copy>: «הקישור כבר לא בתוקף. אפשר להשיב למייל
      // ההזמנה ונשלח קישור חדש.»), and the first draft put a heading above it
      // that said the same thing in fewer words — a string nobody approved,
      // stating twice what the approved sentence already says. The screenshot
      // is what made that obvious. StatusPage renders body-only (the claim
      // page's load-error state does the same).
      <StatusPage
        testid="owner-invite-invalid"
        icon={LinkBreak}
        body={t("invalid.body")}
        primary={{ href: "/contact?topic=business", label: t("invalid.contact") }}
      />
    );
  }

  if (view === VIEW.LOAD_ERROR) {
    return (
      <StatusPage
        testid="owner-invite-load-error"
        icon={WarningCircle}
        body={tErr("generic")}
        bodyRole="alert"
        primary={{
          label: tErr("retry"),
          onClick: () => setAttempt((n) => n + 1),
          testid: "owner-invite-retry",
        }}
      />
    );
  }

  return (
    <Shell testid="owner-invite-ready">
      <h1 className="font-headline-lg text-3xl font-black text-text" data-testid="owner-invite-title">
        {t("title", { business: invite.producer_name })}
      </h1>
      <p className="text-fg-muted mt-2 mb-6" data-testid="owner-invite-subtitle">
        {t("subtitle")}
      </p>

      <form onSubmit={submit} noValidate data-testid="owner-invite-form" className="space-y-4">
        <div>
          <label className="block text-sm text-fg-muted mb-1" htmlFor="owner-invite-email">
            {t("email_label")}
          </label>
          <input
            id="owner-invite-email"
            data-testid="owner-invite-email"
            readOnly
            dir="ltr"
            value={invite.email}
            className="w-full min-h-touch border border-border rounded-sm ps-4 py-3 bg-background text-fg-muted"
          />
        </div>

        <PasswordInput
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("password_placeholder")}
          ariaLabel={t("password_label")}
          testId="owner-invite-password"
        />

        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            data-testid="owner-invite-terms"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="w-5 h-5 accent-primary mt-0.5 flex-shrink-0"
          />
          <span className="leading-relaxed text-fg-muted">
            {tReg("terms.intro")}{" "}
            <Link href="/terms" target="_blank" className="text-primary underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current">{tReg("terms.tos_link")}</Link>{" "}
            {tReg("terms.and")}<Link href="/privacy" target="_blank" className="text-primary underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current">{tReg("terms.privacy_link")}</Link>
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            data-testid="owner-invite-declaration"
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
              data-testid="owner-invite-farmer"
              checked={farmerConfirmed}
              onChange={(e) => setFarmerConfirmed(e.target.checked)}
              className="w-5 h-5 accent-primary mt-0.5 flex-shrink-0"
            />
            <span className="leading-relaxed text-fg-muted">{tReg("terms.farmer_declaration")}</span>
          </label>
        )}

        {(validation || submitError) && (
          <p className="text-sm text-error" role="alert" data-testid="owner-invite-error">
            {validation || submitError}
          </p>
        )}

        <Button
          type="submit"
          data-testid="owner-invite-submit"
          disabled={submitting || !password}
          variant="primary"
          size="lg"
          className="w-full"
        >
          {submitting ? t("submitting") : t("submit")}
        </Button>
      </form>
    </Shell>
  );
}

function Shell({ children, testid }) {
  return (
    <div className="max-w-xl mx-auto px-4 py-10" data-testid={testid}>
      <div className="bg-surface rounded-md border border-border p-6">{children}</div>
    </div>
  );
}
