"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { LinkBreak, WarningCircle } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { detailToMessage } from "@/lib/errors";
import { firstFailureMessage } from "@/lib/passwordMessages";
import { OwnerInvitePublicSchema } from "@/lib/api-schemas";
import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";
import {
  clearOwnerInviteToken,
  readOwnerInviteCodeSent,
  readOwnerInviteToken,
  stashOwnerInviteCodeSent,
  stashOwnerInviteToken,
} from "@/lib/claim-token";
import PasswordInput from "@/components/PasswordInput";
import StatusPage from "@/components/StatusPage";
import BrandLoader from "@/components/BrandLoader";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";

/**
 * Module:   OwnerInviteClient
 * Purpose:  What a business owner opens from the invite link (MEH-2974): she
 *           SEES the page we built for her, proves an address with a 6-digit
 *           code, chooses a password, accepts the terms and signs the
 *           licensing declaration. If the page was still hidden, her approval
 *           is what puts it in front of anyone. She then lands in her
 *           dashboard, signed in.
 * Touches:  GET /auth/owner-invite/{token} · POST /auth/owner-invite/email-code
 *           · POST /auth/owner-invite/accept
 *           (backend/app/routers/producer_owner_invite.py). sessionStorage via
 *           lib/claim-token.js.
 * Does NOT: ask her to sign in first (there is no account until she accepts —
 *           that is the whole difference from /claim), offer Google sign-in
 *           (v1; the account is created with the password she sets), or let
 *           her EDIT the page from here — the preview is read-only and the
 *           note under it points at the dashboard.
 * Related:  app/[locale]/claim/ClaimClient.jsx (the DRAFT sibling) ·
 *           app/[locale]/register/producer/RegisterProducerClient.jsx (the
 *           declaration copy, reused by KEY so there is no second wording) ·
 *           components/admin/OwnerInvitePanel.jsx (where the link is minted).
 * History:  MEH-2974 (v2: a read-only address, no preview, no code —
 *           superseded by the card's v3 revision of 12/11).
 *
 * Why the address is editable and then PROVED, rather than simply trusted:
 * most businesses reach us on Instagram or WhatsApp and we hold no address
 * for them, so the link travels with none on it. A typed address that is
 * never checked is two bugs waiting — a typo locks her out of the account she
 * just created, and a stranger's address chosen on purpose hands the page to
 * someone else. The code is what turns a typed string into a proven one, and
 * `email_verified=true` on the new account rests on it.
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

  // v3. `email` is seeded from the invite when it carries one and is hers to
  // change until a code has been sent; `codeSentTo` is the address the live
  // code belongs to, so changing the address after a send retracts the code
  // rather than letting her submit one address with another's code (the server
  // refuses that too — this is the UI half, so she is not told «הקוד לא תואם»
  // for something she can see is wrong).
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSentTo, setCodeSentTo] = useState(null);
  const [sendingCode, setSendingCode] = useState(false);
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
          // `?? ""` and not `|| ""`: both land on an empty field here, but
          // the nullish form says what the API means — null is "no address was
          // ever entered", which is a different fact from an empty string.
          setEmail(parsed.data.email ?? "");
          // MEH-3025: a code was already sent from this link before a reload.
          // Put her address back and treat that code as live, so she can type
          // it instead of being left with a disabled button and no reason.
          const sentTo = readOwnerInviteCodeSent(token);
          if (sentTo) {
            setEmail(sentTo);
            setCodeSentTo(sentTo.trim().toLowerCase());
          }
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
  const trimmedEmail = email.trim();
  // Two different promises, so two different strings: a hidden page goes live
  // when she presses the button, an already-live one does not. Both strings
  // are approved copy (<hebrew_copy> v3).
  const submitLabel = t(invite?.will_publish ? "submit_publish" : "submit");
  const codeIsLive = Boolean(codeSentTo) && codeSentTo === trimmedEmail.toLowerCase();

  const sendCode = async () => {
    setSubmitError(null);
    setValidation(null);
    if (!trimmedEmail) return setValidation(t("email_required"));
    setSendingCode(true);
    try {
      await api.post("/auth/owner-invite/email-code", {
        token,
        email: trimmedEmail,
      });
      // The server's answer is deliberately the same for an address that is
      // free, one that already has an account, and one whose send failed — it
      // takes an arbitrary address from whoever holds the link, so a different
      // answer would be an account-existence oracle. So this branch cannot and
      // must not tell her which happened; it says a code is on its way and
      // where to look if it is not.
      setCodeSentTo(trimmedEmail.toLowerCase());
      stashOwnerInviteCodeSent(token, trimmedEmail);
      setCode("");
    } catch (error) {
      if (error?.response?.status === 404) {
        clearOwnerInviteToken();
        setView(VIEW.INVALID);
        return;
      }
      setSubmitError(detailToMessage(error?.response?.data?.detail) || tErr("generic"));
    } finally {
      setSendingCode(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    if (!trimmedEmail) return setValidation(t("email_required"));
    if (!codeIsLive) return setValidation(t("code_required"));
    if (!code.trim()) return setValidation(t("code_required"));
    if (!agreedToTerms) return setValidation(tReg("validation.terms_required"));
    if (!declarationConfirmed) return setValidation(tReg("validation.declaration_required"));
    if (farmerRequired && !farmerConfirmed) return setValidation(tReg("validation.farmer_required"));
    setValidation(null);
    setSubmitting(true);
    try {
      const res = await api.post("/auth/owner-invite/accept", {
        token,
        email: trimmedEmail,
        code: code.trim(),
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
      // The accept answers with her access token. Without storing it she is
      // not signed in: refreshUser returns early on an empty token and the
      // dashboard guard sends her to /login — or, in a browser where another
      // account is signed in, opens the dashboard as that account. Same line
      // as RegisterProducerClient's upgrade path.
      localStorage.setItem("token", res.data.access_token);
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

      {invite.preview && <Preview preview={invite.preview} />}
      {invite.preview && (
        <p className="text-sm text-fg-muted mb-6" data-testid="owner-invite-preview-note">
          {t("preview_note")}
        </p>
      )}

      <form onSubmit={submit} noValidate data-testid="owner-invite-form" className="space-y-4">
        <div>
          <label className="block text-sm text-fg-muted mb-1" htmlFor="owner-invite-email">
            {t("email_label")}
          </label>
          <input
            id="owner-invite-email"
            data-testid="owner-invite-email"
            type="email"
            autoComplete="email"
            dir="ltr"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              // Editing the address after a send retracts the code: the one
              // she holds belongs to the address she just left.
              setCodeSentTo(null);
            }}
            className="w-full min-h-touch border border-border rounded-sm ps-4 py-3 bg-surface text-text"
          />
        </div>

        {/* The code step. Rendered as its own block rather than folded into
            the address field, because it is a separate round trip she has to
            wait for — and because the confirmation sentence has to sit where
            she is looking when it arrives. */}
        <div>
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={sendCode}
            disabled={sendingCode || !trimmedEmail}
            data-testid="owner-invite-send-code"
            className="w-full"
          >
            {sendingCode ? t("sending_code") : t("send_code")}
          </Button>
          {codeSentTo && (
            <p
              className="text-sm text-fg-muted mt-2"
              role="status"
              data-testid="owner-invite-code-sent"
            >
              {t("code_sent")}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm text-fg-muted mb-1" htmlFor="owner-invite-code">
            {t("code_label")}
          </label>
          <input
            id="owner-invite-code"
            data-testid="owner-invite-code"
            // `inputMode` + `autoComplete` so a phone offers the digit pad and
            // the OS one-time-code suggestion, the same affordances the phone
            // OTP field in the dashboard relies on.
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            dir="ltr"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full min-h-touch border border-border rounded-sm ps-4 py-3 bg-surface text-text tracking-[0.3em]"
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
          <InlineMessage data-testid="owner-invite-error">
            {validation || submitError}
          </InlineMessage>
        )}

        <Button
          type="submit"
          data-testid="owner-invite-submit"
          disabled={submitting || !password || !code.trim() || !codeIsLive}
          variant="primary"
          size="lg"
          className="w-full"
        >
          {submitting ? t("submitting") : submitLabel}
        </Button>
      </form>
    </Shell>
  );
}

/**
 * The preview, so she approves something she has SEEN.
 *
 * A near-twin of `ClaimClient`\'s `Preview` and deliberately not shared: that
 * one carries a kicker («הכנו לכם עמוד במהמקור») because the claim page has no
 * heading of its own, while this page already says what the business is in its
 * `h1`. Extracting one component would mean a prop that exists to be absent
 * here. The parts worth sharing — the Cloudinary host guard and the ratio —
 * come from `lib/cloudinary.js`, which both use.
 */
function Preview({ preview }) {
  // next/image throws on a host next.config does not allow, so an image from
  // anywhere else is left out rather than breaking the page.
  const src = isCloudinaryUrl(preview.image)
    ? optimizeCloudinary(preview.image, { aspectRatio: IMAGE_RATIOS.banner, width: 640 })
    : null;
  return (
    // FRAMED, and the frame is the point. The 390 capture showed the preview
    // as loose text directly under the `h1`, where the business name reads as
    // the heading repeating itself rather than as «this is what the page will
    // look like» — the subtitle says so in words, and nothing on screen
    // agreed. A card is the cheapest thing that makes the block legible as a
    // rendering of something else.
    <div
      className="mb-4 rounded-md border border-border bg-background p-4"
      data-testid="owner-invite-preview"
    >
      {src && (
        <div className="relative w-full aspect-video overflow-hidden rounded-md bg-background mb-4">
          <Image
            src={src}
            alt={preview.name}
            fill
            sizes="(max-width: 640px) 100vw, 560px"
            className="object-cover"
          />
        </div>
      )}
      <p className="font-headline-lg text-xl font-black text-text" data-testid="owner-invite-preview-name">
        {preview.name}
      </p>
      {preview.city && <p className="text-fg-muted mt-1">{preview.city}</p>}
      {preview.short_description && (
        <p className="text-text mt-3">{preview.short_description}</p>
      )}
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

function Shell({ children, testid }) {
  return (
    <div className="max-w-xl mx-auto px-4 py-10" data-testid={testid}>
      <div className="bg-surface rounded-md border border-border p-6">{children}</div>
    </div>
  );
}
