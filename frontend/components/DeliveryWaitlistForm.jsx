"use client";

import { useState } from "react";
import { BellRinging } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import api from "@/lib/api";
import { useOptionalAuth } from "@/lib/auth-context";
import { JoinDeliveryWaitlistProducersProducerIdDeliveryWaitlistPostResponse as WaitlistOut } from "@/lib/generated/api.zod";

/**
 * Module:   DeliveryWaitlistForm
 * Purpose:  «תודיעו לי כשתגיעו ל{עיר}» — the Oddbox-style no-account waitlist
 *           under the delivery checker's negative verdict. Email + the city the
 *           verdict is about; the business's later "add city" mails her once.
 * Touches:  POST /api/producers/{id}/delivery-waitlist (201 added / 200 exists
 *           — both land on the same calm "נודיע לך" line). MEH-2674: the
 *           optional «אשמח לארח נקודת מסירה ב{עיר}» box sends
 *           `wants_to_host`; the response's `host_confirm` picks ONE extra
 *           line under the confirmation — sent / already_sent /
 *           limit_reached — and `confirmed` adds none (she is already a
 *           host; the calm line is the whole truth). Nothing is shared
 *           with the business until she clicks the mailed link.
 * Does NOT: decide the city or whether it is covered — both are the caller's
 *           (DeliveryChecker's "no" branch is the ONLY mount), exactly like
 *           CoverageRequestCta beside it. Does not touch favorites/WhatsApp:
 *           a signed-in visitor gets a one-line pointer to the existing
 *           favorite-alert panel, which already owns that opt-in.
 * Related:  backend/app/services/delivery_waitlist.py (the email + trigger);
 *           frontend/components/CoverageRequestCta.jsx (the WhatsApp sibling).
 * History:  MEH-2618 (creation). Plan: claude.ai/artifact/2W4LNWVVxUDBSu8gMQQWsW.
 *           MEH-2674 (host checkbox; server side MEH-2673, PR #3999).
 */

// host_confirm values that add a line under «נודיע לך». `confirmed` is
// deliberately absent: a host who ticks again gets no second message.
const HOST_LINES = {
  sent: "host_sent",
  already_sent: "host_already_sent",
  limit_reached: "host_limit_reached",
};

// idle → open → (busy) → done; error keeps the form open with a message.
export default function DeliveryWaitlistForm({ producer = null, city = "", describedBy = undefined }) {
  const t = useTranslations("group_buys.delivery.waitlist");
  const auth = useOptionalAuth();
  const user = auth?.user ?? null;
  const value = (city || "").trim();

  const [phase, setPhase] = useState("idle");
  // Prefilled for a signed-in visitor — she can still change it.
  const [email, setEmail] = useState(user?.email ?? "");
  const [wantsToHost, setWantsToHost] = useState(false);
  // MEH-2674: the server's word on the confirmation mail (null = box unticked
  // or an older backend that does not answer host_confirm).
  const [hostConfirm, setHostConfirm] = useState(null);
  const [error, setError] = useState(false);

  if (!producer?.id || !value) return null;

  const inputId = `delivery-waitlist-email-${producer.id}`;
  const hostId = `delivery-waitlist-host-${producer.id}`;

  async function submit(e) {
    e.preventDefault();
    setError(false);
    setPhase("busy");
    try {
      const body = { email: email.trim(), city: value };
      // Only sent when ticked: an unticked box must never read as a
      // withdrawal on a repeat signup (the backend ignores false anyway).
      if (wantsToHost) body.wants_to_host = true;
      const r = await api.post(
        `/producers/${producer.id}/delivery-waitlist`,
        body,
      );
      // Rule 19: the extra line is picked from a validated payload; a shape
      // we do not recognise falls back to the calm line alone.
      const parsed = WaitlistOut.safeParse(r.data);
      setHostConfirm(parsed.success ? (parsed.data.host_confirm ?? null) : null);
      setPhase("done");
    } catch {
      setError(true);
      setPhase("open");
    }
  }

  if (phase === "done") {
    return (
      <div className="basis-full" data-testid="delivery-waitlist" data-phase="done">
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
        {HOST_LINES[hostConfirm] && (
          <p
            className="mt-1 text-sm text-text"
            data-testid="delivery-waitlist-host-status"
            data-host-confirm={hostConfirm}
          >
            {t(HOST_LINES[hostConfirm])}
          </p>
        )}
        {/* MEH-2618 chunk 2c: WhatsApp lives in the favorite-alert panel
            (AlertPrefsPanel — whatsapp_opt_in + notify_delivery_area), so a
            signed-in visitor is pointed there instead of a second opt-in. */}
        {user && (
          <p
            className="mt-1 text-sm text-fg-muted"
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
      <p data-testid="delivery-waitlist" data-phase="idle">
        <button
          type="button"
          onClick={() => setPhase("open")}
          data-testid="delivery-waitlist-cta"
          aria-describedby={describedBy}
          className="inline-flex items-center gap-1.5 min-h-touch rounded-full border border-primary/20 bg-surface px-3 text-sm font-medium text-primary transition hover:bg-green-50 focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <BellRinging
            size={16}
            weight="regular"
            className="flex-shrink-0"
            aria-hidden="true"
          />
          {t("cta")}
        </button>
      </p>
    );
  }

  const busy = phase === "busy";
  return (
    <form
      onSubmit={submit}
      className="basis-full"
      data-testid="delivery-waitlist"
      data-phase={phase}
    >
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-text mb-1"
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
          className="flex-1 min-h-touch rounded-full border border-primary/15 bg-surface px-4 text-sm [unicode-bidi:plaintext] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="submit"
          disabled={busy}
          data-testid="delivery-waitlist-submit"
          className="min-h-touch rounded-full bg-primary px-5 text-sm font-medium text-white transition hover:bg-primary-dark disabled:opacity-50"
        >
          {busy ? t("sending") : t("submit")}
        </button>
      </div>
      {/* MEH-2674: opt-in to host a pickup point in this city. Unticked by
          default; the hint under it says the mail-confirmation step out loud
          so nobody thinks the box alone hands her email to the business. */}
      <div className="mt-2 flex items-start gap-2">
        <input
          id={hostId}
          type="checkbox"
          checked={wantsToHost}
          onChange={(e) => setWantsToHost(e.target.checked)}
          data-testid="delivery-waitlist-host"
          className="mt-1 h-4 w-4 flex-shrink-0 accent-primary"
        />
        <label htmlFor={hostId} className="text-sm text-text">
          {t("host_label", { city: value })}
          <span
            className="block text-xs text-fg-muted"
            data-testid="delivery-waitlist-host-hint"
          >
            {t("host_hint")}
          </span>
        </label>
      </div>
      {error && (
        <p
          className="mt-1 text-sm text-danger-700"
          role="alert"
          data-testid="delivery-waitlist-error"
        >
          {t("error")}
        </p>
      )}
    </form>
  );
}
