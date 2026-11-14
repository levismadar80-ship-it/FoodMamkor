"use client";

import { useEffect, useRef, useState } from "react";
import { ChatCircleText } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import Input from "@/components/ui/Input";

/**
 * PhoneVerifyCard — producer-facing WhatsApp OTP flow.
 *
 * Wires the existing endpoints (POST /producers/me/verify-phone + /confirm)
 * to a dashboard card. A successful confirm sets `phone_verified`, which is
 * one of the five submit-gate requirements; the parent refreshes via
 * onVerified so the banner updates without a reload.
 *
 * Touches:  POST /producers/me/verify-phone, POST /producers/me/verify-phone/confirm.
 * Does NOT: own the status copy banner — that's dashboard/page.js.
 * History:  MEH-745 (origin). The confirm used to also advance the producer
 *           out of a `pending_whatsapp` status; that status was removed in
 *           MEH-2124 and the card's only mount is now DraftSubmitBanner's.
 */
const RESEND_COOLDOWN_SECONDS = 60;
const OTP_LENGTH = 6;
// MEH-2481: mirrors the server's token TTL (producer_me.py send_phone_otp,
// `timedelta(minutes=10)`). After that the stored code is dead anyway.
const OTP_TTL_MS = 10 * 60 * 1000;
const SENT_AT_KEY = "mehamakor.otp_sent_at";

/** When the last code was sent in this tab, or 0. Storage may be absent or
 *  throw (private mode, cleared data) — then it is simply 0. */
function readOtpSentAt() {
  try {
    const raw = globalThis.sessionStorage?.getItem(SENT_AT_KEY);
    const ts = raw ? Number(raw) : 0;
    return Number.isFinite(ts) && Date.now() - ts < OTP_TTL_MS ? ts : 0;
  } catch {
    return 0;
  }
}

function rememberOtpSent() {
  try {
    globalThis.sessionStorage?.setItem(SENT_AT_KEY, String(Date.now()));
  } catch {
    /* per-viewer convenience only — losing it costs one extra tap */
  }
}

function forgetOtpSent() {
  try {
    globalThis.sessionStorage?.removeItem(SENT_AT_KEY);
  } catch {
    /* same */
  }
}

export default function PhoneVerifyCard({ onVerified }) {
  const t = useTranslations("dashboard.producer.phone_verify");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  // MEH-3126: the last code sent on its own at 6 digits. A wrong code is not
  // re-sent until it changes, so a failed auto-verify can't loop or burn the
  // rate limit; the confirm button still sends it on purpose.
  const lastAutoRef = useRef("");

  // MEH-2481: a reload used to hide the code box, so the seller asked for a
  // NEW code — which invalidated the one already on her phone (measured on
  // staging, 28/10). If a code went out from this tab less than 10 minutes
  // ago, open on the code box with whatever cooldown is left.
  useEffect(() => {
    const sentAt = readOtpSentAt();
    if (!sentAt) return;
    setCodeSent(true);
    const elapsed = Math.floor((Date.now() - sentAt) / 1000);
    setCooldown(Math.max(0, RESEND_COOLDOWN_SECONDS - elapsed));
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const handleSend = async () => {
    if (sending || cooldown > 0) return;
    setSending(true);
    setError("");
    try {
      await api.post("/producers/me/verify-phone");
      lastAutoRef.current = ""; // a new code: anything typed may auto-send again
      setCodeSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      rememberOtpSent();
    } catch (err) {
      const sc = err.response?.status;
      if (sc === 400) setError(t("error_no_phone"));
      else if (sc === 429) showToast.error(detailToMessage(err.response?.data?.detail) || t("error_rate_limited"));
      else setError(t("error_generic"));
    } finally {
      setSending(false);
    }
  };

  const handleConfirm = async (value = code) => {
    if (confirming || value.length !== OTP_LENGTH) return;
    setConfirming(true);
    setError("");
    try {
      await api.post("/producers/me/verify-phone/confirm", { code: value });
      forgetOtpSent();
      showToast.success(t("success"));
      onVerified?.();
    } catch (err) {
      const sc = err.response?.status;
      if (sc === 400) setError(t("error_invalid"));
      else if (sc === 429) showToast.error(detailToMessage(err.response?.data?.detail) || t("error_rate_limited"));
      else setError(t("error_generic"));
      // MEH-3126: a server/network failure says nothing about the code, so
      // retyping it may auto-send again. A wrong code (400) or a rate limit
      // (429) stays blocked until it changes; the button still sends.
      if (sc !== 400 && sc !== 429) lastAutoRef.current = "";
    } finally {
      setConfirming(false);
    }
  };

  // MEH-3126: typing or pasting the 6th digit verifies on its own (no tap).
  // Digits are filtered BEFORE the length cap, so a pasted «123 456» or
  // «123-456» keeps all six (a maxLength attribute would cut it at the space).
  const handleCodeChange = (e) => {
    const next = e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH);
    setCode(next);
    if (next.length === OTP_LENGTH && next !== lastAutoRef.current && !confirming) {
      lastAutoRef.current = next;
      handleConfirm(next);
    }
  };

  const sendLabel = cooldown > 0
    ? t("resend_in", { seconds: cooldown })
    : sending
      ? t("sending")
      : t("send_cta");

  return (
    <div className="mt-3 bg-surface border border-primary/20 rounded-md p-4">
      <p className="font-semibold text-text mb-1 inline-flex items-center gap-1.5">
        <ChatCircleText size={18} className="text-primary" aria-hidden="true" />
        {t("title")}
      </p>
      <p className="text-xs text-fg-muted mb-3">{t("description")}</p>

      {/* MEH-1103: send + confirm gain min-h-touch (WCAG 2.5.5). */}
      <button
        type="button"
        onClick={handleSend}
        disabled={sending || cooldown > 0}
        className="btn-whatsapp-outline min-h-touch text-sm rounded-sm px-4 py-2 disabled:opacity-50"
      >
        {sendLabel}
      </button>

      {codeSent && (
        <div className="mt-4">
          <label htmlFor="otp-code" className="block text-xs font-medium text-text mb-1">
            {t("code_label")}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              inline
              size="sm"
              id="otp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              value={code}
              onChange={handleCodeChange}
              placeholder={t("code_placeholder")}
              className="w-40 text-center tracking-[0.3em]"
            />
            <Button
              type="button"
              onClick={() => handleConfirm()}
              disabled={confirming || code.length !== OTP_LENGTH}
              variant="primary" size="sm"
            >
              {confirming ? t("confirming") : t("confirm_cta")}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <InlineMessage size="xs" className="font-medium mt-3">
          {error}
        </InlineMessage>
      )}
    </div>
  );
}
