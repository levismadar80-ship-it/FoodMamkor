"use client";
// @ts-check

/**
 * Module:   producer/dashboard/edit/cards/BusinessNameCard
 * Purpose:  Business-name change REQUEST form (admin approves; not a direct save).
 * Does NOT: write `name` directly: the backend removed it from the writable fields (MEH-1851).
 * Related:  ../cards.jsx (re-exports this, so existing imports keep working);
 *           ../page.js (renders the cards).
 * History:  MEH-3152 — moved VERBATIM out of edit/cards.jsx (2,618 lines) into
 *           its own file; the per-change history is in the comments below.
 */

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import { detailToMessage } from "@/lib/errors";
import Input from "@/components/ui/Input";
import { SkeletonForm } from "@/components/Skeleton";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";

// ============================================================
// MEH-1872 — business-name editor with re-moderation.
//
// The ONLY card here that does not write its field. Every sibling PUTs to
// /producers/me and the value moves; this one POSTs a REQUEST and the public
// name stays exactly where it was until an admin approves.
//
// That difference is the feature, not an implementation detail: MEH-1851
// removed `name` from _PRODUCER_WRITABLE_FIELDS because a plain setattr let an
// approved business silently become a different business, against the DNA-LOCK
// "every business is approved by hand". So the copy has to make "you filed a
// request" unmistakable — an owner who reads this as "saved" will think the
// rename already happened and go looking for it on her public page.
//
// One open request at a time (the backend returns 409); when one is pending we
// render the pending state and no form, so the 409 is unreachable from the UI
// rather than merely handled.
//
// Touches: POST + GET /producers/me/name-change-requests.
// ============================================================
export function BusinessNameCard({ profile }) {
  const t = useTranslations("dashboard.producer.name_change");
  const [requestedName, setRequestedName] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api
      .get("/producers/me/name-change-requests")
      .then((r) => {
        if (!alive) return;
        const list = Array.isArray(r.data) ? r.data : [];
        setPending(list.find((x) => x.status === "pending") || null);
      })
      .catch(() => {
        // A failed history read must not present as "no pending request" —
        // that would offer a form whose submit is guaranteed to 409. Leave
        // `pending` null but surface the error so the state is legible.
        if (alive) setError(t("load_error"));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trimmed = requestedName.trim();
  const unchanged = trimmed === (profile?.name || "").trim();
  const canSubmit = trimmed.length >= 2 && !unchanged && !saving;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      const r = await api.post("/producers/me/name-change-requests", {
        requested_name: trimmed,
        reason: reason.trim() || null,
      });
      setPending(r.data);
      setJustSent(true);
      setRequestedName("");
      setReason("");
      showToast.success(t("sent_toast"));
    } catch (err) {
      setError(detailToMessage(err, t("submit_error")));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SkeletonForm fields={2} label={t("loading")} />;

  return (
    <div className="space-y-4" data-testid="name-change-card">
      <p className="text-sm text-fg-muted">{t("intro")}</p>

      {/* Current name is shown read-only so the comparison the owner is about
          to request is visible without leaving the card. */}
      <div>
        <p className="text-sm font-semibold text-text mb-1">{t("current_label")}</p>
        <p
          className="text-base font-bold text-text bg-bg-subtle border border-border rounded-sm px-3 py-2"
          data-testid="name-change-current"
        >
          {profile?.name}
        </p>
      </div>

      {justSent && (
        <div
          className="bg-green-50 border border-primary rounded-md p-4 text-sm text-text"
          role="status"
          data-testid="name-change-sent"
        >
          {t("sent_confirmation")}
        </div>
      )}

      {pending ? (
        <div
          className="bg-yellow-50 border border-yellow-300 rounded-md p-4 space-y-1"
          role="status"
          data-testid="name-change-pending"
        >
          <p className="text-sm font-semibold text-text">{t("pending_heading")}</p>
          <p className="text-sm text-fg-muted">
            {t("pending_detail", { name: pending.requested_name })}
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3" data-testid="name-change-form">
          <Input
            label={t("requested_label")}
            helperText={t("requested_where")}
            value={requestedName}
            onChange={(e) => setRequestedName(e.target.value)}
            placeholder={t("requested_placeholder")}
            maxLength={100}
            data-testid="name-change-input"
          />
          <Input
            label={t("reason_label")}
            helperText={t("reason_where")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("reason_placeholder")}
            maxLength={500}
            data-testid="name-change-reason"
          />
          {unchanged && trimmed.length > 0 && (
            <p className="text-sm text-fg-muted">{t("same_name_hint")}</p>
          )}
          {error && (
            <InlineMessage data-testid="name-change-error">
              {error}
            </InlineMessage>
          )}
          <Button
            type="submit"
            disabled={!canSubmit}
            variant="primary" size="sm"
            data-testid="name-change-submit"
          >
            {saving ? t("submitting") : t("submit_cta")}
          </Button>
        </form>
      )}
    </div>
  );
}
