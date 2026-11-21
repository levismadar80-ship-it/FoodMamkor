// @ts-check
"use client";

/**
 * MEH-3592: what a participant sees on the join card — her confirmation, a
 * quantity she can change until the deadline (Kickstarter: a pledge can change
 * until the campaign ends), the leave button, and the leave rule once the
 * group reached its goal (no leave in the last 24 h that drops it below).
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import GroupBuyLineTotal from "@/components/group-buy/GroupBuyLineTotal";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";

const QTY_MIN = 1;
const QTY_MAX = 100;

/** @param {{ gb: any, joinable: boolean, full: boolean, cancelling: boolean, onCancel: () => void, onChanged: () => Promise<void> | void }} props */
export default function GroupBuyMemberPanel({ gb, joinable, full, cancelling, onCancel, onChanged }) {
  const t = useTranslations("group_buys.detail");
  const current = gb.user_commit?.quantity || 1;
  const [qty, setQty] = useState(/** @type {number | string} */ (current));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const room = typeof gb.units_left === "number" ? current + gb.units_left : QTY_MAX;
  const max = Math.min(QTY_MAX, room);
  const changed = Number(qty) !== current;

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      await api.patch(`/group-buys/${gb.id}/commit`, { quantity: Math.min(max, Math.max(QTY_MIN, Math.floor(Number(qty)) || QTY_MIN)) });
      showToast.success(t("quantity_updated_toast"));
      await onChanged();
    } catch (error_) {
      setError(detailToMessage(error_.response?.data?.detail) || t("errors.action_failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="group-buy-member">
      <div className="rounded-md bg-green-50 border border-primary/20 px-4 py-3 text-primary text-sm font-medium text-center">
        {t("committed_confirm")}
        {gb.unit
          ? t("committed_qty_unit", { count: current, unit: gb.unit })
          : current > 1 && t("committed_units", { count: current })}
      </div>
      {joinable && full && (
        <p className="text-sm text-fg-muted text-center" data-testid="group-buy-full-member">{t("full_member")}</p>
      )}
      {joinable && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              type="number"
              label={gb.unit ? t("quantity_label_unit", { unit: gb.unit }) : t("quantity_label")}
              min={QTY_MIN}
              max={max}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              // rtl-ok — dir="ltr" numeric field, same exception as the join form.
              className="text-right"
              dir="ltr"
            />
          </div>
          <Button variant="outlined" size="md" disabled={!changed || saving} onClick={save} data-testid="group-buy-qty-save">
            {t("quantity_update")}
          </Button>
        </div>
      )}
      {joinable && <GroupBuyLineTotal gb={gb} quantity={qty} />}
      {error && <InlineMessage>{error}</InlineMessage>}
      {joinable && (
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling}
          className="w-full text-sm text-fg-muted hover:text-error transition text-center"
        >
          {cancelling ? t("cancelling") : t("cancel_cta")}
        </button>
      )}
      {/* MEH-3597: the leave rule lives in the page's «ביטול» section. */}
    </div>
  );
}
