// @ts-check
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { detailToMessage } from "@/lib/errors";
import { clearOwnerInviteToken } from "@/lib/claim-token";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import InlineMessage from "@/components/ui/InlineMessage";
import OwnerInviteConsents from "./OwnerInviteConsents";

/**
 * Module:   OwnerInviteExistingAccount
 * Purpose:  The invite form for an owner who is ALREADY signed in (MEH-3256,
 *           grill retro D8). Until now the page only created a new account, so
 *           an owner who had once signed up as a consumer was told «האימייל
 *           הזה כבר רשום» and had no way forward. Here she proves the account's
 *           own address with a code, signs the same consents, and the business
 *           moves onto the account she already has.
 * Touches:  POST /auth/owner-invite/email-code-existing ·
 *           POST /auth/owner-invite/accept-existing
 *           (backend/app/routers/producer_owner_invite_existing.py).
 * Does NOT: take an address or a password — the code goes to the account's
 *           own address and her password is untouched. Does not decide who may
 *           accept: an admin account or one that already has a business is
 *           refused by the server, and its Hebrew reason is shown as is.
 * Related:  ./OwnerInviteClient.jsx (the new-account form, which renders this
 *           one when a user is signed in) · ./OwnerInviteConsents.jsx.
 * History:  MEH-3256 (creation).
 */

/**
 * @param {{
 *   token: string,
 *   invite: { requires_farmer_declaration?: boolean, will_publish?: boolean },
 *   accountEmail: string,
 *   onInvalid: () => void,
 * }} props
 */
export default function OwnerInviteExistingAccount({ token, invite, accountEmail, onInvalid }) {
  const t = useTranslations("owner_invite");
  const tReg = useTranslations("auth.register.producer");
  const tErr = useTranslations("error");
  const router = useRouter();
  const { refreshUser } = useAuth();

  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [code, setCode] = useState("");
  const [terms, setTerms] = useState(false);
  const [declaration, setDeclaration] = useState(false);
  const [farmer, setFarmer] = useState(false);
  const [message, setMessage] = useState(/** @type {string|null} */ (null));
  const [submitting, setSubmitting] = useState(false);

  const farmerRequired = Boolean(invite?.requires_farmer_declaration);
  const submitLabel = t(invite?.will_publish ? "submit_publish" : "submit");

  /** @param {any} error @param {string} fallback */
  const fail = (error, fallback) => {
    // One 404 for every dead link, as on the new-account form.
    if (error?.response?.status === 404) {
      clearOwnerInviteToken();
      onInvalid();
      return;
    }
    setMessage(detailToMessage(error?.response?.data?.detail) || fallback);
  };

  const sendCode = async () => {
    setMessage(null);
    setSendingCode(true);
    try {
      await api.post("/auth/owner-invite/email-code-existing", { token });
      setCodeSent(true);
      setCode("");
    } catch (error) {
      fail(error, tErr("generic"));
    } finally {
      setSendingCode(false);
    }
  };

  /** @param {import("react").FormEvent} e */
  const submit = async (e) => {
    e.preventDefault();
    if (!codeSent || !code.trim()) return setMessage(t("code_required"));
    if (!terms) return setMessage(tReg("validation.terms_required"));
    if (!declaration) return setMessage(tReg("validation.declaration_required"));
    if (farmerRequired && !farmer) return setMessage(tReg("validation.farmer_required"));
    setMessage(null);
    setSubmitting(true);
    try {
      const res = await api.post("/auth/owner-invite/accept-existing", {
        token,
        code: code.trim(),
        terms_accepted: terms,
        declaration_accepted: declaration && (!farmerRequired || farmer),
        ...(farmerRequired && { farmer_declaration_accepted: farmer }),
      });
      clearOwnerInviteToken();
      // The accept retires every older session of this account (its
      // token_version is bumped), so the session it answers with is the only
      // one that still works. Store it before the refresh, as the new-account
      // form does.
      localStorage.setItem("token", res.data.access_token);
      await refreshUser();
      router.push("/producer/dashboard");
    } catch (error) {
      fail(error, t("submit_error"));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate data-testid="owner-invite-existing-form" className="space-y-4">
      <p className="text-fg-muted" data-testid="owner-invite-existing-account">
        {t("existing.signed_in_as", { email: accountEmail })}
      </p>

      <div>
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={sendCode}
          disabled={sendingCode}
          data-testid="owner-invite-existing-send-code"
          className="w-full"
        >
          {sendingCode ? t("sending_code") : t("send_code")}
        </Button>
        {codeSent && (
          <p className="text-sm text-fg-muted mt-2" role="status" data-testid="owner-invite-existing-code-sent">
            {t("existing.code_sent", { email: accountEmail })}
          </p>
        )}
      </div>

      <Input
        label={t("code_label")}
        id="owner-invite-existing-code"
        data-testid="owner-invite-existing-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        dir="ltr"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="tracking-[0.3em]"
      />

      <OwnerInviteConsents
        terms={terms}
        onTerms={setTerms}
        declaration={declaration}
        onDeclaration={setDeclaration}
        farmerRequired={farmerRequired}
        farmer={farmer}
        onFarmer={setFarmer}
      />

      {message && <InlineMessage data-testid="owner-invite-existing-error">{message}</InlineMessage>}

      <Button
        type="submit"
        data-testid="owner-invite-existing-submit"
        disabled={submitting || !codeSent || !code.trim()}
        variant="primary"
        size="lg"
        className="w-full"
      >
        {submitting ? t("submitting") : submitLabel}
      </Button>
    </form>
  );
}
