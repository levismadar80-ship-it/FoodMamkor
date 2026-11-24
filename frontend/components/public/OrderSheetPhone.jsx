// @ts-check
"use client";
/**
 * Module:   OrderSheetPhone
 * Purpose:  The phone and its WhatsApp code inside the order sheet: the
 *           number, «שליחת קוד», then the six-digit code field. A guest, and a
 *           logged-in buyer on any other phone, proves it with the code.
 *           A signed-in buyer ordering to her own verified phone gets the
 *           number alone: no code step (MEH-3680).
 * Does NOT: send the order or check the code — the order route checks it
 *           with the order (POST /product-orders), so a code is tried once.
 * Related:  components/public/OrderSheet.jsx, lib/order-sheet.js::askPhoneCode,
 *           backend/app/routers/product_order_buyer.py::send_order_phone_code
 * History:  MEH-3216 stage 5c (creation); MEH-3658 a short label + a help line;
 *           MEH-3680 no code for the account's verified phone
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import InlineMessage from "@/components/ui/InlineMessage";
import { detailToMessage } from "@/lib/errors";
import { askPhoneCode } from "@/lib/order-sheet";
import { usePreviewMode } from "@/lib/preview-mode";
import { validateIsraeliPhone } from "@/lib/validators";

/**
 * @param {{
 *   producerId: string,
 *   phone: string,
 *   code: string,
 *   verified?: boolean,
 *   onChange: (change: { phone?: string, code?: string }) => void,
 * }} props
 */
export default function OrderSheetPhone({ producerId, phone, code, verified = false, onChange }) {
  const t = useTranslations("producer.detail.order_sheet");
  const [sentTo, setSentTo] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const valid = validateIsraeliPhone(phone);
  // MEH-3746: the owner's preview sends no WhatsApp code.
  const preview = usePreviewMode();

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      await askPhoneCode(producerId, phone);
      setSentTo(phone.trim());
    } catch (err) {
      setError(detailToMessage(/** @type {any} */ (err)?.response?.data?.detail) || t("code_failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <Input
          label={t("phone")}
          required
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          value={phone}
          onChange={(e) => {
            onChange({ phone: e.target.value, code: "" });
            setSentTo(null);
          }}
          className="flex-1"
          aria-describedby={sentTo || verified ? undefined : "order-sheet-phone-help"}
          data-testid="order-sheet-phone"
        />
        {/* MEH-3680: one tree either way, so the field keeps focus when
            `verified` flips while she types. */}
        {!verified && <Button type="button" variant="outlined" disabled={preview || !valid || busy} onClick={ask} className="shrink-0 whitespace-nowrap" data-testid="order-sheet-send-code">
          {t(sentTo ? "send_code_again" : "send_code")}
        </Button>}
      </div>
      {/* MEH-3658: the label says what the field is; this says what it is for. */}
      {!sentTo && !verified && <p id="order-sheet-phone-help" className="text-xs text-fg-muted" data-testid="order-sheet-phone-help">{t("phone_help")}</p>}
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      {sentTo && !verified && (
        <Input
          label={t("code")}
          helperText={t("code_sent")}
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          dir="ltr"
          value={code}
          onChange={(e) => onChange({ code: e.target.value.replace(/\D/g, "") })}
          data-testid="order-sheet-code"
        />
      )}
    </div>
  );
}
