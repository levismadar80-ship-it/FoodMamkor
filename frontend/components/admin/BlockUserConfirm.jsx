// @ts-check
"use client";

/**
 * Module:   BlockUserConfirm
 * Purpose:  MEH-3375 — the confirm step before an admin blocks a user. Blocking
 *           the only owner of a live business hides it and cancels its open
 *           bookings, each mailed (MEH-2871); this shows the business and the
 *           count BEFORE the click, instead of after it.
 * Touches:  GET /admin/users/{id}/block-impact (read only). The block itself
 *           is the caller's onConfirm.
 * Does NOT: unblock — that stays one click on /admin/users. Does not restore a
 *           hidden business: an admin uses «הפעל» on /admin/producers.
 * Related:  backend/app/routers/admin_extra.py block_impact ·
 *           app/[locale]/admin/users/page.js (the role/delete Dialog it mirrors).
 * History:  MEH-3375 (creation).
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import api from "@/lib/api";
import { BlockImpactAdminUsersUserIdBlockImpactGetResponse as BlockImpactOut } from "@/lib/generated/api.zod";

/** @param {{ count: number, t: (key: string, values?: object) => string }} props */
function BookingsLine({ count, t }) {
  if (count === 0) return <>{t("users.confirm.block_none")}</>;
  if (count === 1) return <>{t("users.confirm.block_one")}</>;
  return <>{t("users.confirm.block_many", { count })}</>;
}

/**
 * @param {{ user: { id: string, name?: string }, busy: boolean,
 *   onConfirm: () => void, onClose: () => void }} props
 */
export default function BlockUserConfirm({ user, busy, onConfirm, onClose }) {
  const t = useTranslations("admin");
  // null = loading; { error: true } = the read failed; else the impact.
  const [impact, setImpact] = useState(/** @type {any} */ (null));

  useEffect(() => {
    let live = true;
    api
      .get(`/admin/users/${user.id}/block-impact`)
      .then((r) => {
        // Rule 19: a shape we do not expect reads as a failed read, so the
        // block button stays disabled rather than confirming on a guess.
        const parsed = BlockImpactOut.safeParse(r.data);
        if (live) setImpact(parsed.success ? parsed.data : { error: true });
      })
      .catch(() => live && setImpact({ error: true }));
    return () => {
      live = false;
    };
  }, [user.id]);

  const ready = impact !== null && !impact.error;
  const name = user.name || "";

  return (
    <Dialog
      labelledBy="block-confirm-title"
      size="sm"
      dismissible={!busy}
      onClose={onClose}
      className="space-y-4"
    >
      <div data-testid="block-confirm" className="space-y-2">
        {impact?.error ? (
          <p id="block-confirm-title" className="font-medium text-base">
            {t("users.confirm.block_impact_error")}
          </p>
        ) : !ready ? (
          <p id="block-confirm-title" className="font-medium text-base text-muted">
            {t("users.confirm.submitting")}
          </p>
        ) : impact.business_name ? (
          <>
            <p id="block-confirm-title" className="font-medium text-base">
              {t("users.confirm.block_business", { name, business: impact.business_name })}
            </p>
            <p className="text-sm" data-testid="block-confirm-bookings">
              <BookingsLine count={impact.open_bookings} t={t} />
            </p>
            <p className="text-sm text-muted">{t("users.confirm.block_restore")}</p>
          </>
        ) : (
          <p id="block-confirm-title" className="font-medium text-base">
            {t("users.confirm.block", { name })}
          </p>
        )}
      </div>
      <div className="flex gap-3 justify-start">
        <Button
          variant="danger"
          data-testid="block-confirm-submit"
          disabled={!ready}
          loading={busy}
          onClick={onConfirm}
        >
          {t("users.confirm.block_submit")}
        </Button>
        <Button variant="ghost" data-autofocus onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
    </Dialog>
  );
}
