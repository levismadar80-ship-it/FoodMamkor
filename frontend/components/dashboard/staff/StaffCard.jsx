// @ts-check
"use client";

/**
 * Module:   StaffCard
 * Purpose:  «צוות להזמנות» on the owner's «כלים» tab (MEH-3526): who handles
 *           the business's orders, an invite by email, remove, send again.
 * Touches:  GET /producers/me/order-settings (404 = ordering off → no card) ·
 *           GET/POST /producers/me/staff · DELETE /producers/me/staff/{id}.
 * Does NOT: decide the cap or who may join — the server does (limits.py
 *           MAX_STAFF, producer_staff.py); its Hebrew 409 is shown as is.
 *           Never shown to staff: the tools tab is the owner's.
 * Related:  lib/staff.js · app/[locale]/staff-invite/StaffInviteClient.jsx.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import Heading from "@/components/ui/Heading";
import Input from "@/components/ui/Input";
import InlineMessage from "@/components/ui/InlineMessage";
import { detailToMessage } from "@/lib/errors";
import { loadSettings } from "@/lib/product-orders";
import { inviteStaff, listStaff, removeStaff } from "@/lib/staff";

/** The server's Hebrew reason, or our own fallback. */
const reason = (/** @type {any} */ err, /** @type {string} */ fallback) =>
  detailToMessage(err?.response?.data?.detail) || fallback;

/** @param {{ row: any, onRemove: (id: string) => void, onResend: (email: string) => void, busy: boolean }} props */
function StaffRow({ row, onRemove, onResend, busy }) {
  const t = useTranslations("dashboard.producer.staff");
  const statusKey = row.status === "active" ? "status_active" : row.expired ? "status_expired" : "status_pending";
  return (
    <li data-testid="staff-row" className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text break-all" dir="ltr">{row.email}</p>
        <p data-testid="staff-row-status" className="text-xs text-fg-muted">{t(statusKey)}</p>
      </div>
      <div className="flex gap-2">
        {row.expired && (
          <Button variant="outlined" size="sm" disabled={busy} onClick={() => onResend(row.email)} data-testid="staff-resend">
            {t("resend")}
          </Button>
        )}
        <Button
          variant="outlined"
          size="sm"
          disabled={busy}
          onClick={() => onRemove(row.id)}
          aria-label={t("remove_aria", { email: row.email })}
          data-testid="staff-remove"
        >
          {t("remove")}
        </Button>
      </div>
    </li>
  );
}

/** One read of the card's state. Never throws: a failure is `failed`. */
async function fetchStaff() {
  try {
    const settings = await loadSettings();
    if (settings === null) return { on: false, staff: [], max: 0, failed: false };
    const data = await listStaff();
    return { on: true, staff: data.staff, max: data.max_staff, failed: false };
  } catch {
    return { on: true, staff: [], max: 0, failed: true };
  }
}

/** The list, its loading and its load error. */
function useStaff() {
  const [state, setState] = useState(/** @type {{ on: boolean, staff: any[], max: number, failed: boolean } | null} */ (null));
  useEffect(() => {
    let live = true;
    fetchStaff().then((next) => live && setState(next));
    return () => {
      live = false;
    };
  }, []);
  const reload = useCallback(async () => setState(await fetchStaff()), []);
  return { state, reload };
}

/** @param {{ onSend: (email: string) => Promise<boolean>, busy: boolean, full: boolean }} props */
function InviteForm({ onSend, busy, full }) {
  const t = useTranslations("dashboard.producer.staff");
  const tAuth = useTranslations("auth.login");
  const [email, setEmail] = useState("");
  const submit = async (/** @type {import("react").FormEvent} */ e) => {
    e.preventDefault();
    if (email.trim() && (await onSend(email.trim()))) setEmail("");
  };
  if (full) return <InlineMessage tone="info" data-testid="staff-full">{t("full")}</InlineMessage>;
  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row sm:items-end gap-3" data-testid="staff-invite-form">
      <div className="flex-1">
        <Input
          type="email"
          label={t("email_label")}
          placeholder={tAuth("email_placeholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          dir="ltr"
          required
          data-testid="staff-email"
        />
      </div>
      <Button type="submit" loading={busy} disabled={busy} data-testid="staff-invite-submit">
        {t("invite")}
      </Button>
    </form>
  );
}

export default function StaffCard() {
  const t = useTranslations("dashboard.producer.staff");
  const tErr = useTranslations("dashboard.producer.section_errors");
  const { state, reload } = useStaff();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(/** @type {{ tone: "error" | "success", text: string } | null} */ (null));

  const run = async (/** @type {() => Promise<any>} */ action, /** @type {string | null} */ success) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (success) setMessage({ tone: "success", text: success });
      await reload();
      return true;
    } catch (err) {
      setMessage({ tone: "error", text: reason(err, tErr("tools")) });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const send = (/** @type {string} */ email) => run(() => inviteStaff(email), t("sent", { email }));

  if (!state || !state.on) return null;
  // An expired invite stops counting toward the cap (producer_staff.py `_counted`).
  const counted = state.staff.filter((row) => !row.expired).length;
  return (
    <section data-testid="tools-group-staff" className="mt-8 bg-surface border border-border rounded-lg p-5 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Heading level={2} className="text-lg">{t("heading")}</Heading>
        {!state.failed && <span data-testid="staff-count" className="text-sm text-fg-muted">{t("count", { count: counted, max: state.max })}</span>}
      </div>
      {state.failed ? (
        <div className="space-y-2" data-testid="staff-load-error">
          <InlineMessage tone="error">{t("load_error")}</InlineMessage>
          <Button variant="outlined" size="sm" onClick={reload}>{tErr("retry_cta")}</Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-fg-muted">{t("intro", { max: state.max })}</p>
          {state.staff.length === 0 ? (
            <p data-testid="staff-empty" className="text-sm text-fg-muted">{t("empty")}</p>
          ) : (
            <ul className="divide-y divide-border" data-testid="staff-list">
              {state.staff.map((row) => (
                <StaffRow key={row.id} row={row} busy={busy} onRemove={(id) => run(() => removeStaff(id), null)} onResend={send} />
              ))}
            </ul>
          )}
          <InviteForm onSend={send} busy={busy} full={counted >= state.max} />
        </>
      )}
      {message && <InlineMessage tone={message.tone} data-testid="staff-message">{message.text}</InlineMessage>}
    </section>
  );
}
