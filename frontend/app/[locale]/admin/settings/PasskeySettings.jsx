// @ts-check
"use client";

/**
 * PasskeySettings — the signed-in admin's own passkeys (MEH-3305).
 *
 * Top → bottom: what a passkey does here · the list (0 / 1 / many rows) ·
 * «הוספת מפתח גישה» · recovery codes (how many are left, new ones).
 * The codes are shown once, right after the first passkey or a renewal, and
 * never again (the server keeps only their hash).
 *
 * Proof before a change (the server decides, this card only collects it):
 * with a passkey → the device is asked; with no passkey but a password → the
 * password field; neither (a Google account) → nothing.
 * Does NOT manage another admin's passkeys — the routes act on the session.
 */

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import api from "@/lib/api";
import { formatDate } from "@/lib/format-date";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";
import { copyText } from "@/lib/clipboard";
import { createPasskey, getPasskeyAssertion, passkeysSupported } from "@/lib/webauthn";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import PasswordField from "@/components/ui/PasswordField";
import InlineMessage from "@/components/ui/InlineMessage";

/**
 * Proof for a change: a recovery code when one was typed (the device is
 * gone), else the device if there is a passkey, else the password.
 * @param {any} state @param {string} password @param {string} recovery
 */
async function stepUp(state, password, recovery) {
  if (state.passkeys.length > 0 && recovery.trim()) return { recovery_code: recovery.trim() };
  if (state.passkeys.length > 0) {
    const { data } = await api.post("/auth/passkey/step-up/options");
    return { ticket: data.ticket, credential: await getPasskeyAssertion(data.options) };
  }
  return state.has_password ? { password } : {};
}

/** @param {{ codes: string[], onDone: () => void }} props */
function CodesOnce({ codes, onDone }) {
  const t = useTranslations("admin.passkeys");
  return (
    <div className="grid gap-3 rounded-md border border-accent p-4" data-testid="passkey-codes">
      <p className="font-semibold">{t("codes_title")}</p>
      <p className="text-sm text-fg-muted">{t("codes_body")}</p>
      <ul dir="ltr" className="grid grid-cols-2 gap-2 font-mono text-sm">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="outlined" onClick={() => copyText(codes.join("\n"))}>
          {t("codes_copy")}
        </Button>
        <Button onClick={onDone}>{t("codes_done")}</Button>
      </div>
    </div>
  );
}

/** @param {{ row: any, onRemove: (id: string) => void, busy: boolean }} props */
function PasskeyRow({ row, onRemove, busy }) {
  const t = useTranslations("admin.passkeys");
  const locale = useLocale();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3" data-testid="passkey-row">
      <div className="grid gap-0.5">
        <span className="font-medium">
          {row.name || t("unnamed")}
          {row.synced && <span className="ms-2 text-xs text-fg-muted">{t("synced")}</span>}
        </span>
        <span className="text-xs text-fg-muted">
          {t("added", { date: formatDate(row.created_at, locale) })}
          {" · "}
          {row.last_used_at
            ? t("last_used", { date: formatDate(row.last_used_at, locale) })
            : t("never_used")}
        </span>
      </div>
      <Button variant="text" disabled={busy} onClick={() => onRemove(row.id)}>
        {t("remove")}
      </Button>
    </li>
  );
}

export default function PasskeySettings() {
  const t = useTranslations("admin.passkeys");
  const [state, setState] = useState(/** @type {any} */ (null));
  const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [recovery, setRecovery] = useState("");
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState(/** @type {string[] | null} */ (null));

  const load = () =>
    api
      .get("/auth/passkey")
      .then((r) => {
        setState(r.data);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));

  useEffect(() => {
    load();
  }, []);

  /** @param {() => Promise<void>} work */
  const run = async (work) => {
    setBusy(true);
    try {
      await work();
      setRecovery("");
      await load();
    } catch (err) {
      const anyErr = /** @type {any} */ (err);
      // The device prompt was cancelled: not an error worth a toast.
      if (anyErr?.name === "NotAllowedError") return;
      showToast.error(detailToMessage(anyErr?.response?.data?.detail) || t("error"));
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    run(async () => {
      const proof = await stepUp(state, password, recovery);
      const { data } = await api.post("/auth/passkey/register/options", proof);
      const credential = await createPasskey(data.options);
      const res = await api.post("/auth/passkey/register/verify", {
        ticket: data.ticket,
        credential,
        name: name.trim() || null,
      });
      setName("");
      setPassword("");
      if (res.data.recovery_codes) setCodes(res.data.recovery_codes);
      showToast.success(t("added_toast"));
    });

  /** @param {string} id */
  const remove = (id) =>
    run(async () => {
      await api.post(`/auth/passkey/${id}/delete`, await stepUp(state, password, recovery));
      showToast.success(t("removed_toast"));
    });

  const renew = () =>
    run(async () => {
      const res = await api.post("/auth/passkey/recovery-codes", await stepUp(state, password, recovery));
      setCodes(res.data.recovery_codes);
    });

  if (loadError) return <InlineMessage tone="error">{t("error")}</InlineMessage>;
  if (!state) return null;

  const none = state.passkeys.length === 0;
  return (
    <section
      className="bg-surface border border-border rounded-md p-5 space-y-4"
      data-testid="passkey-settings"
    >
      <h2 className="font-semibold">{t("title")}</h2>
      <p className="text-sm text-fg-muted">{t("subtitle")}</p>

      {!state.enabled && <InlineMessage tone="info">{t("off")}</InlineMessage>}
      {state.enabled && !passkeysSupported() && (
        <InlineMessage tone="info">{t("unsupported")}</InlineMessage>
      )}

      {codes && <CodesOnce codes={codes} onDone={() => setCodes(null)} />}

      {none ? (
        <p className="text-sm" data-testid="passkey-empty">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {state.passkeys.map((row) => (
            <PasskeyRow key={row.id} row={row} onRemove={remove} busy={busy} />
          ))}
        </ul>
      )}

      {state.enabled && passkeysSupported() && (
        <div className="grid gap-3 sm:max-w-md">
          <Input
            id="passkey-name"
            label={t("name_label")}
            placeholder={t("name_placeholder")}
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {none && state.has_password && (
            <PasswordField
              id="passkey-password"
              label={t("password_label")}
              helperText={t("password_hint")}
              autoComplete="current-password"
              showLabel={t("eye_show")}
              hideLabel={t("eye_hide")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
          <Button onClick={add} loading={busy} data-testid="passkey-add">
            {t("add")}
          </Button>
        </div>
      )}

      {!none && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <span className="text-sm">
            {t("codes_left", { count: state.recovery_codes_left })}
          </span>
          <Button variant="outlined" onClick={renew} disabled={busy}>
            {t("codes_new")}
          </Button>
          <div className="w-full sm:max-w-md">
            <Input
              id="passkey-recovery-step-up"
              label={t("recovery_label")}
              helperText={t("recovery_hint")}
              dir="ltr"
              autoComplete="one-time-code"
              value={recovery}
              onChange={(e) => setRecovery(e.target.value)}
            />
          </div>
        </div>
      )}
    </section>
  );
}
