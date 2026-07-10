"use client";

import { useEffect, useState } from "react";
import { ChatCircleText } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";

/**
 * PhoneVerifyCard — producer-facing WhatsApp OTP flow for pending_whatsapp.
 *
 * Wires the existing endpoints (POST /producers/me/verify-phone + /confirm)
 * to a dashboard card. A successful confirm advances the producer from
 * pending_whatsapp → pending server-side (producer_me.py, MEH-745); the parent
 * flips its local status via onVerified so the banner updates without a reload.
 *
 * Touches:  POST /producers/me/verify-phone, POST /producers/me/verify-phone/confirm.
 * Does NOT: own the status copy banner — that's dashboard/page.js.
 * History:  MEH-745 (origin — closes the pending_whatsapp dead-end).
 */
const RESEND_COOLDOWN_SECONDS = 60;
const OTP_LENGTH = 6;

export default function PhoneVerifyCard({ onVerified }) {
  const t = useTranslations("dashboard.producer.phone_verify");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

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
      setCodeSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      const sc = err.response?.status;
      if (sc === 400) setError(t("error_no_phone"));
      else if (sc === 429) showToast.error(detailToMessage(err.response?.data?.detail) || t("error_rate_limited"));
      else setError(t("error_generic"));
    } finally {
      setSending(false);
    }
  };

  const handleConfirm = async () => {
    if (confirming || code.length !== OTP_LENGTH) return;
    setConfirming(true);
    setError("");
    try {
      await api.post("/producers/me/verify-phone/confirm", { code });
      showToast.success(t("success"));
      onVerified?.();
    } catch (err) {
      const sc = err.response?.status;
      if (sc === 400) setError(t("error_invalid"));
      else if (sc === 429) showToast.error(detailToMessage(err.response?.data?.detail) || t("error_rate_limited"));
      else setError(t("error_generic"));
    } finally {
      setConfirming(false);
    }
  };

  const sendLabel = cooldown > 0
    ? t("resend_in", { seconds: cooldown })
    : sending
      ? t("sending")
      : t("send_cta");

  return (
    <div className="mt-3 bg-white border border-primary/20 rounded-[12px] p-4">
      <p className="font-semibold text-text mb-1 inline-flex items-center gap-1.5">
        <ChatCircleText size={18} className="text-primary" aria-hidden="true" />
        {t("title")}
      </p>
      <p className="text-xs text-fg-muted mb-3">{t("description")}</p>

      <button
        type="button"
        onClick={handleSend}
        disabled={sending || cooldown > 0}
        className="btn-whatsapp-outline text-sm rounded-[8px] px-4 py-2 disabled:opacity-50"
      >
        {sendLabel}
      </button>

      {codeSent && (
        <div className="mt-4">
          <label htmlFor="otp-code" className="block text-xs font-medium text-text mb-1">
            {t("code_label")}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="otp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={OTP_LENGTH}
              dir="ltr"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))}
              placeholder={t("code_placeholder")}
              className="w-40 text-center tracking-[0.3em] border border-border rounded-[8px] px-3 py-2 text-sm focus:border-primary outline-none"
            />
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirming || code.length !== OTP_LENGTH}
              className="bg-primary text-white text-sm rounded-[8px] px-4 py-2 font-medium hover:bg-primary-dark transition disabled:opacity-50"
            >
              {confirming ? t("confirming") : t("confirm_cta")}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-error text-xs font-medium mt-3" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
