// @ts-check
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import InlineMessage from "@/components/ui/InlineMessage";

/**
 * Module:   OwnerDetachControl
 * Purpose:  «ניתוק בעלים» (MEH-3256, grill retro D9) — under the «מחובר» line
 *           of the owner panel. The admin types the business name to confirm;
 *           the owner's account stays, the business stays live, and the panel
 *           then offers a fresh owner invite.
 * Touches:  POST /admin/producers/{id}/detach-owner
 *           (backend/app/routers/producer_owner_detach.py).
 * Does NOT: invite the new owner — the panel's own invite form does, once the
 *           page reloads without an owner.
 * Related:  components/admin/OwnerInvitePanel.jsx (the parent).
 */

/**
 * @param {{ producerId: string, business: string,
 *   owner: { id?: string | null, name: string, email: string },
 *   onDetached: () => void }} props
 */
export default function OwnerDetachControl({ producerId, business, owner, onDetached }) {
  const t = useTranslations("admin.producers.owner_invite.detach");
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  // Without the id there is nothing to name as "the owner I saw" — an older
  // payload; the button stays hidden rather than sending a guess.
  if (!owner?.id) return null;

  const matches = typed.trim() === (business || "").trim();

  const detach = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/producers/${producerId}/detach-owner`, {
        confirm_name: typed.trim(),
        expected_owner_user_id: owner.id,
      });
      onDetached();
    } catch (err) {
      setError(detailToMessage(err?.response?.data?.detail) || t("error"));
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-3"
        data-testid="owner-detach-open"
        onClick={() => setOpen(true)}
      >
        {t("button")}
      </Button>
    );
  }

  return (
    <div className="mt-3 space-y-3" data-testid="owner-detach-form">
      <p className="text-sm text-text">{t("explain", { name: owner.name, email: owner.email })}</p>
      <Input
        label={t("confirm_label", { business })}
        id="owner-detach-name"
        data-testid="owner-detach-name"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
      />
      {error && (
        <InlineMessage size="sm" data-testid="owner-detach-error">
          {error}
        </InlineMessage>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          data-testid="owner-detach-confirm"
          disabled={!matches || busy}
          onClick={detach}
        >
          {busy ? t("confirming") : t("confirm")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-testid="owner-detach-cancel"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setTyped("");
            setError(null);
          }}
        >
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
