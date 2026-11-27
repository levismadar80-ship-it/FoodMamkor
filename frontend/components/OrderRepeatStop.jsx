// @ts-check
"use client";

/**
 * Module:   OrderRepeatStop
 * Purpose:  «לעצור את ההזמנה הקבועה» behind one confirm step, for the buyer's
 *           status page and the business's order card alike (MEH-3933).
 * Touches:  whatever `onStop` posts; a refusal is shown inline in Hebrew.
 * Does NOT: know who is stopping: the caller passes the request.
 * Related:  app/[locale]/order/[id]/OrderRepeatBlock.jsx,
 *           components/dashboard/orders/OrderRepeatControl.jsx
 * History:  MEH-3933 (creation, 27/11/2026)
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import { detailToMessage } from "@/lib/errors";

/**
 * @param {{ onStop: () => Promise<any>, onDone: (order: any) => void, variant?: string }} props
 */
export default function OrderRepeatStop({ onStop, onDone, variant = "outlined" }) {
  const t = useTranslations("order_repeat");
  const tStatus = useTranslations("order_status");  // «חזרה», one key site-wide
  const [step, setStep] = useState(/** @type {"idle" | "asking" | "busy"} */ ("idle"));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const stop = async () => {
    setStep("busy");
    setError(null);
    try {
      onDone(await onStop());
    } catch (err) {
      setError(detailToMessage(/** @type {any} */ (err)?.response?.data?.detail) || t("failed"));
      setStep("asking");
    }
  };
  if (step === "idle") {
    return (
      <Button variant={variant} size="sm" onClick={() => setStep("asking")} data-testid="order-repeat-stop">
        {t("stop")}
      </Button>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-text">{t("stop_confirm")}</p>
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" size="sm" onClick={stop} loading={step === "busy"} data-testid="order-repeat-stop-confirm">
          {t("stop_yes")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setStep("idle")}>{tStatus("back")}</Button>
      </div>
    </div>
  );
}
