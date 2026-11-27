// @ts-check
"use client";

/**
 * MEH-3592: what a participant sees on the join card — her confirmation, a
 * quantity she can change until the deadline (Kickstarter: a pledge can change
 * until the campaign ends), the leave button, and the leave rule once the
 * group reached its goal (no leave in the last 24 h that drops it below).
 */
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import GroupBuyLineTotal from "@/components/group-buy/GroupBuyLineTotal";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";
import { cancelUntilText, pickupWindowText } from "@/lib/group-buy-pickup"; // MEH-3610 · MEH-3734
import { Link } from "@/i18n/navigation";
import PrepayButton from "@/components/ui/PrepayButton";

const QTY_MIN = 1;
const QTY_MAX = 100;

/** @param {{ gb: any, joinable: boolean, full: boolean, cancelling: boolean, onCancel: () => void, onChanged: () => Promise<void> | void, prepay?: { link: string | null, timing: string | null } | null }} props */
export default function GroupBuyMemberPanel({ gb, joinable, full, cancelling, onCancel, onChanged, prepay = null }) {
  const t = useTranslations("group_buys.detail");
  const locale = useLocale();
  // MEH-3610: the join confirmation says until when she can leave.
  const cancelUntil = joinable ? cancelUntilText(gb.deadline, locale) : null;
  const current = gb.user_commit?.quantity || 1;
  const [qty, setQty] = useState(/** @type {number | string} */ (current));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const room = typeof gb.units_left === "number" ? current + gb.units_left : QTY_MAX;
  const max = Math.min(QTY_MAX, room);
  const changed = Number(qty) !== current;
  // MEH-3734: what happens next, in one line under the confirmation.
  // A delivery-only group shows no pickup time, as on the page (MEH-3597).
  const deliveryOnly = Boolean(gb.delivery_note) && !gb.pickup_note && !gb.fulfillment_note;
  const pickupWhen = deliveryOnly ? null : pickupWindowText(gb.pickup_starts_at, gb.pickup_ends_at, locale);
  // Funded without a pickup time: the page header already says «צרו קשר עם…»,
  // so the card adds nothing rather than repeat it (review, MEH-3734).
  const next = !joinable
    ? null
    : gb.status === "funded"
      ? pickupWhen && t("member_next_funded_pickup", { when: pickupWhen })
      : cancelUntil && t("member_next_open", { date: cancelUntil });
  // A cancelled or closed group has nothing left to pay for (edge-case audit).
  const stillOn = gb.status === "open" || gb.status === "funded";

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
        {cancelUntil && (
          <span className="block text-xs font-normal text-text mt-1" data-testid="group-buy-cancel-until">
            {t("cancel_until_short", { date: cancelUntil })}
          </span>
        )}
      </div>
      {next && (
        <p className="text-sm text-text text-center" data-testid="group-buy-member-next">{next}</p>
      )}
      {/* MEH-3735: the code she shows at pickup; the business sees codes, not names. */}
      {stillOn && gb.user_commit?.pickup_code && (
        <p className="text-sm text-text text-center" data-testid="group-buy-pickup-code">
          {t("pickup_code_line", { code: gb.user_commit.pickup_code })}
        </p>
      )}
      {/* MEH-3734: the page's approved pay line, repeated where she now looks.
          MEH-3895: once the group is funded and the business asked to be paid
          ahead, «לא משלמים עכשיו» is no longer true — the pay button takes its
          place, right under the pickup code it asks her to quote. */}
      {stillOn && prepay?.link ? (
        <PrepayButton link={prepay.link} timing={prepay.timing} code={gb.user_commit?.pickup_code} testId="group-buy-prepay" />
      ) : (
        stillOn && <p className="text-xs text-fg-muted text-center" data-testid="group-buy-member-pay">{t("pay_line")}</p>
      )}
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
        // MEH-3734: leaving is a real button, not grey text («לא יודעת איך לבטל»).
        <Button
          variant="outlined"
          size="md"
          onClick={onCancel}
          disabled={cancelling}
          className="w-full"
          data-testid="group-buy-member-cancel"
        >
          {cancelling ? t("cancelling") : t("cancel_cta")}
        </Button>
      )}
      <Link href="/my-group-buys" className="block text-sm text-primary underline text-center" data-testid="group-buy-my-groups">
        {t("member_my_groups")}
      </Link>
      {/* MEH-3597: the leave rule lives in the page's «ביטול» section. */}
    </div>
  );
}
