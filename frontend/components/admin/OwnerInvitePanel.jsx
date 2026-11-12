"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { OwnerInviteCreatedSchema } from "@/lib/api-schemas";
import Button from "@/components/ui/Button";

/**
 * Module:   OwnerInvitePanel
 * Purpose:  The admin side of the owner invite (MEH-2974). On an APPROVED
 *           business's edit page: record the written consent, send the owner a
 *           one-time link, and from then on show whether it is still pending
 *           or has been accepted.
 * Touches:  POST /admin/producers/{id}/owner-invite · POST …/resend ·
 *           DELETE …  (backend/app/routers/producer_owner_invite.py).
 * Does NOT: show the link again later. The server stores only a hash, so there
 *           is nothing to re-read — losing it means resending, which is one
 *           click and mints a new token. Does NOT decide who may be invited;
 *           the server does, and its three 409s are rendered verbatim.
 * Related:  components/admin/ClaimLinkPanel.jsx (the DRAFT sibling — different
 *           precondition, different token; see the backend module docstring) ·
 *           app/[locale]/owner-invite/OwnerInviteClient.jsx (what the owner
 *           opens).
 * History:  MEH-2974.
 *
 * THREE STATES, and the matrix behind them (CLAUDE.md § conditional-UI):
 *
 *   connected (`owner` present)           → who owns it, since when. Terminal.
 *   pending   (`owner_invite_sent_at`,
 *              no `owner_invite_accepted_at`) → to whom, until when, + actions.
 *   none      (neither)                   → the empty line + «הזמנת בעלים».
 *
 * crossed with the form being open or closed, and with whether a link was
 * just minted:
 *
 *   none    × closed → empty line + button
 *   none    × open   → the form
 *   pending × closed → the pending line + resend / cancel
 *   pending × open   → the form (re-inviting a DIFFERENT address), plus the
 *                      pending line above it, so she can see what she is
 *                      replacing
 *   any     × just-minted → the link box, which appears ONLY in the render
 *                      that follows a create or a resend and never again
 *
 * The last row is the one that is easy to get wrong in the other direction:
 * showing a stale «העתקת קישור» button after a reload would copy nothing, and
 * showing it after a cancel would copy a dead link.
 */
export default function OwnerInvitePanel({ producerId, producer, onChanged }) {
  const t = useTranslations("admin.producers.owner_invite");
  const locale = useLocale();

  const [form, setForm] = useState({ email: "", name: "", note: "", consent: false });
  const [minted, setMinted] = useState(null);
  // The invite as THIS panel last saw it, overriding what the page loaded.
  // `undefined` = no local opinion, read the producer; `null` = we cancelled it.
  const [localInvite, setLocalInvite] = useState(undefined);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const copiedTimer = useRef(null);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const owner = producer?.owner || null;
  const acceptedAt = producer?.owner_invite_accepted_at || null;
  // MEH-2974: the panel must NOT depend on the page re-fetching to show what
  // it just did, and the reason is specific rather than stylistic — the edit
  // page renders `<SkeletonForm>` INSTEAD of its tree while `fetching`
  // (edit/page.js), so any refetch UNMOUNTS this component and takes its state
  // with it. The link is shown exactly once and the server stores only a hash,
  // so losing that render loses the link for good. Measured: the first version
  // called `onChanged()` after a successful create, and the «העתקת קישור» box
  // never appeared.
  //
  // So a create or a resend updates this panel from its OWN response (which
  // carries email, name, sent_at and expires_at) and does not ask the page to
  // reload. Only a cancel does — there is nothing left to preserve then.
  const invite =
    localInvite === undefined
      ? {
          email: producer?.owner_invite_email || null,
          name: producer?.owner_invite_name || null,
          sent_at: producer?.owner_invite_sent_at || null,
          expires_at: producer?.owner_invite_expires_at || null,
        }
      : localInvite || { email: null, name: null, sent_at: null, expires_at: null };
  const pending = Boolean(invite.sent_at) && !acceptedAt && !owner;

  const fmtDate = (value) =>
    value
      ? new Intl.DateTimeFormat(locale === "he" ? "he-IL" : locale, {
          // guard-ok: display formatting of a server-issued stamp, not a
          // "today" decision (MEH-2383)
          timeZone: "Asia/Jerusalem",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(new Date(value))
      : "";

  // Every request shares this shape: clear the previous link FIRST (after a
  // refusal the link on screen may belong to an invite that no longer exists,
  // and a dead link that still looks copyable is worse than none), then let
  // the caller do its own call.
  const run = async (call, { reload = false } = {}) => {
    setBusy(true);
    setError(null);
    setMinted(null);
    setCopied(false);
    setCopyFailed(false);
    try {
      const result = await call();
      if (result !== undefined) setMinted(result);
      setOpen(false);
      // See the `invite` comment above for why this is opt-in.
      if (reload) onChanged?.();
      return true;
    } catch (err) {
      setError(detailToMessage(err?.response?.data?.detail) || t("error"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const parseMinted = (response) => {
    const parsed = OwnerInviteCreatedSchema.safeParse(response.data);
    // Rule 19: a malformed payload is an error, never a link to send.
    if (!parsed.success) throw new Error("malformed owner-invite response");
    return parsed.data;
  };

  const adopt = (created) => {
    setLocalInvite({
      email: created.email,
      name: created.name,
      sent_at: created.sent_at,
      expires_at: created.expires_at,
    });
    return created;
  };

  const create = (e) => {
    e.preventDefault();
    return run(async () =>
      adopt(
        parseMinted(
          await api.post(`/admin/producers/${producerId}/owner-invite`, {
            email: form.email.trim(),
            name: form.name.trim(),
            consent_confirmed: form.consent,
            consent_note: form.note.trim(),
          }),
        ),
      ),
    );
  };

  const resend = () =>
    run(async () =>
      adopt(parseMinted(await api.post(`/admin/producers/${producerId}/owner-invite/resend`))),
    );

  const cancel = () =>
    run(
      async () => {
        await api.delete(`/admin/producers/${producerId}/owner-invite`);
        setLocalInvite(null);
        return undefined;
      },
      // The only action with nothing to preserve, so it is the only one that
      // asks the page to reload — which is also what re-reads `owner` in case
      // the invite was accepted while this tab sat open.
      { reload: true },
    );

  const copy = () => {
    if (!minted) return;
    const write = navigator.clipboard?.writeText
      ? navigator.clipboard.writeText(minted.invite_url)
      : Promise.reject(new Error("clipboard unavailable"));
    write
      .then(() => {
        setCopyFailed(false);
        setCopied(true);
        clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setCopyFailed(true));
  };

  // Built in JS, not in messages: it interpolates a URL and a name into one
  // line, and `wa.me` needs the whole thing percent-encoded.
  const whatsappHref = minted
    ? `https://wa.me/?text=${encodeURIComponent(
        t("whatsapp_text", {
          name: firstName(minted.name),
          business: producer?.name || "",
          link: minted.invite_url,
        }),
      )}`
    : null;

  const canSubmit =
    form.email.trim() && form.name.trim() && form.note.trim() && form.consent && !busy;

  return (
    <section
      data-testid="owner-invite-panel"
      className="bg-surface rounded-md border border-border p-6 mb-6 max-w-4xl"
    >
      <h2 className="font-semibold text-lg mb-2 text-primary">{t("title")}</h2>

      {owner && (
        <p className="text-sm text-text" data-testid="owner-invite-connected">
          {t("connected", {
            name: owner.name,
            email: owner.email,
            date: fmtDate(acceptedAt),
          })}
        </p>
      )}

      {!owner && pending && (
        <p className="text-sm text-text mb-4" data-testid="owner-invite-pending">
          {t("pending", {
            email: invite.email || "",
            date: fmtDate(invite.expires_at),
          })}
        </p>
      )}

      {!owner && !pending && !open && (
        <p className="text-sm text-muted mb-4" data-testid="owner-invite-empty">
          {t("empty")}
        </p>
      )}

      {minted && (
        <div className="mb-4" data-testid="owner-invite-result">
          <label className="block text-sm text-muted mb-1" htmlFor="owner-invite-url">
            {t("url_label")}
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="owner-invite-url"
              data-testid="owner-invite-url"
              readOnly
              dir="ltr"
              value={minted.invite_url}
              onFocus={(e) => e.target.select()}
              className="flex-1 min-w-0 border border-border rounded-md px-3 py-2 text-sm bg-background"
            />
            <Button type="button" data-testid="owner-invite-copy" onClick={copy} variant="primary" size="sm">
              {copied ? t("copied") : t("copy")}
            </Button>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="owner-invite-whatsapp"
              className="min-h-touch inline-flex items-center justify-center bg-surface border border-primary text-primary rounded-md px-4 py-2 text-sm font-medium hover:bg-background transition"
            >
              {t("send_whatsapp")}
            </a>
          </div>
          <p className="text-xs text-muted mt-2" data-testid="owner-invite-expires">
            {t("expires", { date: fmtDate(minted.expires_at) })}
          </p>
          <p className="text-xs text-muted mt-1">{t("link_shown_once")}</p>
          {copyFailed && (
            <p className="text-sm text-error mt-2" role="alert" data-testid="owner-invite-copy-failed">
              {t("copy_failed")}
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-error mb-4" role="alert" data-testid="owner-invite-error">
          {error}
        </p>
      )}

      {!owner && open && (
        <form onSubmit={create} noValidate className="space-y-3" data-testid="owner-invite-form">
          <Field
            id="owner-invite-name"
            label={t("fields.name")}
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
          />
          <Field
            id="owner-invite-email"
            label={t("fields.email")}
            type="email"
            dir="ltr"
            value={form.email}
            onChange={(v) => setForm((f) => ({ ...f, email: v }))}
          />
          <Field
            id="owner-invite-note"
            label={t("fields.note")}
            placeholder={t("fields.note_placeholder")}
            value={form.note}
            onChange={(v) => setForm((f) => ({ ...f, note: v }))}
          />
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              data-testid="owner-invite-consent"
              checked={form.consent}
              onChange={(e) => setForm((f) => ({ ...f, consent: e.target.checked }))}
              className="w-5 h-5 accent-primary mt-0.5 flex-shrink-0"
            />
            <span className="leading-relaxed text-text">{t("consent")}</span>
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button type="submit" data-testid="owner-invite-submit" disabled={!canSubmit} variant="primary" size="sm">
              {busy ? t("sending") : t("send")}
            </Button>
            <Button type="button" onClick={() => setOpen(false)} variant="secondary" size="sm">
              {t("cancel_form")}
            </Button>
          </div>
        </form>
      )}

      {!owner && !open && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            data-testid="owner-invite-open"
            onClick={() => {
              setError(null);
              // Prefill from the invite on the row, so a resend-to-a-different
              // -address starts from what is there instead of a blank form.
              setForm({
                email: invite.email || "",
                name: invite.name || "",
                note: producer?.owner_invite_consent_note || "",
                consent: false,
              });
              setOpen(true);
            }}
            disabled={busy}
            variant="primary"
            size="sm"
          >
            {pending ? t("invite_again") : t("invite")}
          </Button>
          {pending && (
            <>
              <Button type="button" data-testid="owner-invite-resend" onClick={resend} disabled={busy} variant="secondary" size="sm">
                {t("resend")}
              </Button>
              <Button type="button" data-testid="owner-invite-cancel" onClick={cancel} disabled={busy} variant="secondary" size="sm">
                {t("cancel_invite")}
              </Button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** First word of a full name, or "" — mirrors the backend's `_first_name`. */
function firstName(full) {
  const parts = (full || "").trim().split(/\s+/);
  return parts[0] || "";
}

function Field({ id, label, value, onChange, type = "text", dir, placeholder }) {
  return (
    <div>
      <label className="block text-sm text-muted mb-1" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        data-testid={id}
        type={type}
        dir={dir}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-h-touch border border-border rounded-md px-3 py-2 text-sm bg-background"
      />
    </div>
  );
}
