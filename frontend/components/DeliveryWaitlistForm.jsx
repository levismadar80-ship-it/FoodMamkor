"use client";

import { useState } from "react";
import { BellRinging } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import api from "@/lib/api";
import { useOptionalAuth } from "@/lib/auth-context";

/**
 * Module:   DeliveryWaitlistForm
 * Purpose:  «תודיעו לי כשתגיעו ל{עיר}» — the Oddbox-style no-account waitlist
 *           under the delivery checker's negative verdict. Email + the city the
 *           verdict is about; the business's later "add city" mails her once.
 * Touches:  POST /api/producers/{id}/delivery-waitlist (201 added / 200 exists
 *           — both land on the same calm "נודיע לך" line).
 * Does NOT: decide the city or whether it is covered — both are the caller's
 *           (DeliveryChecker's "no" branch is the ONLY mount), exactly like
 *           CoverageRequestCta beside it. Does not touch favorites/WhatsApp:
 *           a signed-in visitor gets a one-line pointer to the existing
 *           favorite-alert panel, which already owns that opt-in.
 * Related:  backend/app/services/delivery_waitlist.py (the email + trigger);
 *           frontend/components/CoverageRequestCta.jsx (the WhatsApp sibling).
 * History:  MEH-2618 (creation). Plan: claude.ai/artifact/2W4LNWVVxUDBSu8gMQQWsW.
 */

// idle → open → (busy) → done; error keeps the form open with a message.
export default function DeliveryWaitlistForm({ producer = null, city = "" }) {
  const t = useTranslations("group_buys.delivery.waitlist");
  const auth = useOptionalAuth();
  const user = auth?.user ?? null;
  const value = (city || "").trim();

  const [phase, setPhase] = useState("idle");
  // Prefilled for a signed-in visitor — she can still change it.
  const [email, setEmail] = useState(user?.email ?? "");
  const [error, setError] = useState(false);

  if (!producer?.id || !value) return null;

  const inputId = `delivery-waitlist-email-${producer.id}`;

  async function submit(e) {
    e.preventDefault();
    setError(false);
    setPhase("busy");
    try {
      await api.post(`/producers/${producer.id}/delivery-waitlist`, {
        email: email.trim(),
        city: value,
      });
      setPhase("done");
    } catch {
      setError(true);
      setPhase("open");
    }
  }

  if (phase === "done") {
    return (
      <div className="mt-2" data-testid="delivery-waitlist" data-phase="done">
        <p
          className="flex items-center gap-2 text-sm font-medium text-primary"
          data-testid="delivery-waitlist-done"
          role="status"
        >
          <BellRinging
            size={16}
            weight="fill"
            className="flex-shrink-0"
            aria-hidden="true"
          />
          {t("done", { city: value })}
        </p>
        {/* MEH-2618 chunk 2c: WhatsApp lives in the favorite-alert panel
            (AlertPrefsPanel — whatsapp_opt_in + notify_delivery_area), so a
            signed-in visitor is pointed there instead of a second opt-in. */}
        {user && (
          <p
            className="mt-1 text-[13px] text-fg-muted"
            data-testid="delivery-waitlist-whatsapp-hint"
          >
            {t("whatsapp_hint")}
          </p>
        )}
      </div>
    );
  }

  if (phase === "idle") {
    return (
      <p className="mt-2" data-testid="delivery-waitlist" data-phase="idle">
        <button
          type="button"
          onClick={() => setPhase("open")}
          data-testid="delivery-waitlist-cta"
          className="inline-flex items-center gap-2 min-h-[44px] text-sm text-primary transition hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
        >
          <BellRinging
            size={16}
            weight="regular"
            className="flex-shrink-0"
            aria-hidden="true"
          />
          {t("cta", { city: value })}
        </button>
      </p>
    );
  }

  const busy = phase === "busy";
  return (
    <form
      onSubmit={submit}
      className="mt-2"
      data-testid="delivery-waitlist"
      data-phase={phase}
    >
      <label
        htmlFor={inputId}
        className="block text-[13px] font-medium text-text mb-1"
      >
        {t("email_label")}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={inputId}
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("email_placeholder")}
          data-testid="delivery-waitlist-email"
          /* MEH-976 pattern: plaintext bidi so a Hebrew placeholder reads RTL
             and the typed Latin address LTR, without flipping the field. */
          className="flex-1 min-h-[44px] rounded-full border border-primary/15 bg-white px-4 text-sm [unicode-bidi:plaintext] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="submit"
          disabled={busy}
          data-testid="delivery-waitlist-submit"
          className="min-h-[44px] rounded-full bg-primary px-5 text-sm font-medium text-white transition hover:bg-primary-dark disabled:opacity-50"
        >
          {busy ? t("sending") : t("submit")}
        </button>
      </div>
      {error && (
        <p
          className="mt-1 text-[13px] text-red-700"
          role="alert"
          data-testid="delivery-waitlist-error"
        >
          {t("error")}
        </p>
      )}
    </form>
  );
}
