"use client";

import { useTranslations } from "next-intl";

import { israelTime, shekels } from "@/lib/rescue";

/**
 * Module:   RescueConfirmation
 * Purpose:  What a buyer sees the moment a bag is reserved — the 4-digit code
 *           they read out at the counter, what to pay there, and until when
 *           cancelling is free.
 * Does NOT: take payment or count down. The pilot has neither: the money
 *           changes hands at the counter and the reservation does not expire
 *           (03/11 ruling, which removed the 10-minute hold).
 *           It also does NOT promise an SMS — nothing in this stack sends one,
 *           so the copy says «אומרים בקופה» and stops there.
 * Related:  components/rescue/RescueSection.jsx (reserves, then renders this)
 * History:  MEH-2648 (creation)
 */
export default function RescueConfirmation({ order, onCancel, cancelling = false }) {
  const t = useTranslations("rescue");
  if (!order) return null;

  const price = shekels(order.price_agorot);
  const cancelUntil = israelTime(order.cancel_until);
  const from = israelTime(order.pickup_start);
  const until = israelTime(order.pickup_end);
  const started = order.pickup_start ? new Date(order.pickup_start) <= new Date() : false;
  // MEH-2694: once the bag is handed, or the cancel cutoff has passed, the API
  // refuses a cancel (409), so the button would be a tap that can only fail.
  const handed = order.status === "handed";
  const cancellable =
    !handed &&
    (!order.cancel_until || new Date(order.cancel_until) > new Date());

  return (
    <div
      data-testid="rescue-confirmation"
      className="border border-primary/20 bg-background rounded-md px-4 py-5 text-center"
    >
      <p className="font-body-sm text-sm text-text">{t("confirm.title")}</p>

      {/* 56px, LTR: the code is digits and must not render reversed, and it is
          read aloud across a counter — it is the largest thing on the screen
          on purpose. */}
      <p
        dir="ltr"
        data-testid="rescue-confirmation-code"
        className="font-headline-md font-black text-text tracking-[0.2em] mt-2"
        style={{ fontSize: "56px", lineHeight: 1.1 }}
      >
        {order.pickup_code}
      </p>

      <p className="font-body-sm text-sm text-fg-muted mt-1" data-testid="rescue-confirmation-say">
        {t("confirm.say_at_counter")}
      </p>

      {price !== null && (
        <p className="font-headline-md text-base font-black text-text mt-3" data-testid="rescue-confirmation-price">
          {t("confirm.pay", { price })}
        </p>
      )}

      {from && until && (
        <p className="font-body-sm text-sm text-text mt-1" data-testid="rescue-confirmation-window">
          {t("row.pickup", { from, until })}
        </p>
      )}

      {cancelUntil && !handed && (
        <p className="font-body-sm text-sm text-fg-muted mt-2" data-testid="rescue-confirmation-terms">
          {t("confirm.terms", { cancel_until: cancelUntil })}
        </p>
      )}

      {/* Three steps, and the last is disabled until the window opens: before
          pickup_start there is nothing to have collected. */}
      <ol className="flex items-center justify-center gap-2 mt-4 font-body-sm text-sm" data-testid="rescue-confirmation-steps">
        <li className="text-text font-semibold">{t("confirm.step_reserved")}</li>
        <li aria-hidden="true" className="text-fg-muted">·</li>
        <li className={started || handed ? "text-text font-semibold" : "text-fg-muted"}>{t("confirm.step_collect")}</li>
        <li aria-hidden="true" className="text-fg-muted">·</li>
        <li className={handed ? "text-text font-semibold" : "text-fg-muted"} data-testid="rescue-confirmation-step-done">
          {t("confirm.step_done")}
        </li>
      </ol>

      {onCancel && cancellable && (
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling}
          data-testid="rescue-confirmation-cancel"
          className="mt-4 font-body-sm text-sm text-fg-muted underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
        >
          {t("confirm.cancel")}
        </button>
      )}
    </div>
  );
}
