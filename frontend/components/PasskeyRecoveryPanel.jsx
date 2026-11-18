// @ts-check
"use client";

/**
 * PasskeyRecoveryPanel — the second sign-in step when the passkey did not
 * answer (MEH-3305): the admin cancelled the device prompt, or the device is
 * gone. One field for a recovery code, and a way back to the login form.
 *
 * Shown by /login while `passkeyTicket` is set in the auth context. Does NOT
 * ask the device again by itself: a fresh password (or Google) step issues a
 * fresh ticket, and that is the "try again".
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { detailToMessage } from "@/lib/errors";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import SectionHeading from "@/components/ui/SectionHeading";

/** @param {{ onSignedIn: (me: any) => void }} props */
export default function PasskeyRecoveryPanel({ onSignedIn }) {
  const t = useTranslations("auth.passkey");
  const { loginWithRecoveryCode, cancelPasskeyStep } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  /** @param {import("react").FormEvent} e */
  const submit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError("");
    try {
      onSignedIn(await loginWithRecoveryCode(code.trim()));
    } catch (err) {
      const anyErr = /** @type {any} */ (err);
      setError(detailToMessage(anyErr?.response?.data?.detail) || t("error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid gap-4"
      data-testid="passkey-recovery"
    >
      <div className="grid gap-2 text-start">
        <SectionHeading size="content">{t("title")}</SectionHeading>
        <p className="text-base text-fg-muted">{t("body")}</p>
      </div>
      <Input
        id="passkey-recovery-code"
        label={t("code_label")}
        helperText={t("code_hint")}
        error={error || undefined}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoComplete="one-time-code"
        dir="ltr"
        spellCheck={false}
      />
      <Button type="submit" loading={busy} data-testid="passkey-recovery-submit">
        {t("submit")}
      </Button>
      <Button type="button" variant="text" onClick={cancelPasskeyStep}>
        {t("back")}
      </Button>
    </form>
  );
}
