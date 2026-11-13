"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { OwnerInviteCreatedSchema } from "@/lib/api-schemas";
import Button from "@/components/ui/Button";
import { formatDate } from "@/lib/format-date";

/**
 * Module:   OwnerInvitePanel
 * Purpose:  The admin side of the owner invite (MEH-2974). On an approved or
 *           HIDDEN business's edit page: record the written consent, mint a
 *           one-time link (mailed only if an address was typed, copied by hand
 *           otherwise), and from then on show whether it is still pending or
 *           has been accepted.
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
 * History:  MEH-2974 (v3 of the card made the address optional, added the
 *           «העתקת הודעה» button for Instagram and the two status lines).
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
/** How long a «הועתק» confirmation stays up. */
const COPIED_MS = 2000;

/**
 * The two statuses an owner may be invited to, mirroring the backend's
 * `_INVITABLE_STATUSES` (producer_owner_invite.py). Exported because the edit
 * page gates the panel on it: one list, so a page that offers the panel and a
 * server that accepts the request cannot disagree. `inactive` is the hidden
 * page whose publication IS the owner's approval (card v3, decision 11).
 */
export const OWNER_INVITABLE_STATUSES = ["approved", "inactive"];
const HIDDEN_STATUS = "inactive";
const LIVE_STATUS = "approved";

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
  const [messageCopied, setMessageCopied] = useState(false);
  const copiedTimer = useRef(null);
  const messageTimer = useRef(null);

  useEffect(
    () => () => {
      clearTimeout(copiedTimer.current);
      clearTimeout(messageTimer.current);
    },
    [],
  );

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

  const fmtDate = (value) => formatDate(value, locale);

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
    setMessageCopied(false);
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
            // v3: `null`, not "". An empty string is a value the server would
            // have to reject as a malformed address; null is the absence the
            // schema allows, and it is what stops a mail being sent.
            email: form.email.trim() || null,
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
        copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
      })
      .catch(() => setCopyFailed(true));
  };

  // Built in JS, not in messages: it interpolates a URL and a name into one
  // line, and `wa.me` needs the whole thing percent-encoded.
  //
  // THE DELTA FROM ClaimLinkPanel, stated because it is deliberate and a
  // reviewer should not have to guess. That panel mints a comparable
  // credential and offers COPY ONLY. This one also offers WhatsApp, which
  // puts the invite link in the admin's browser history and in
  // web.whatsapp.com's address bar.
  //
  // The reason is that sending it on WhatsApp IS the flow here (MEH-2974
  // <hebrew_copy> specifies the button and its message), where the claim link
  // is pasted wherever the admin already has a thread. The marginal exposure
  // is one more copy of a link the admin is about to paste into WhatsApp
  // anyway, on her own machine — and the token dies in 7 days, on the first
  // use, or on a resend.
  const messageText = minted
    ? t("whatsapp_text", {
        name: firstName(minted.name),
        business: producer?.name || "",
        link: minted.invite_url,
      })
    : "";
  const whatsappHref = minted
    ? `https://wa.me/?text=${encodeURIComponent(messageText)}`
    : null;

  // v3: the same message, on the clipboard. Most of these businesses are
  // reached on Instagram, which has no share URL to hand a prefilled message
  // to — so the only thing that works there is paste. ONE source for the
  // sentence (`messageText`), so the two buttons cannot drift apart.
  const copyMessage = () => {
    if (!minted) return;
    const write = navigator.clipboard?.writeText
      ? navigator.clipboard.writeText(messageText)
      : Promise.reject(new Error("clipboard unavailable"));
    write
      .then(() => {
        setCopyFailed(false);
        setMessageCopied(true);
        clearTimeout(messageTimer.current);
        messageTimer.current = setTimeout(() => setMessageCopied(false), COPIED_MS);
      })
      .catch(() => setCopyFailed(true));
  };

  // v3: the address is NOT required. The name, the consent record and the
  // checkbox still are — they are the audit trail, and decision 4 of the card
  // is that there is no invite without one.
  const canSubmit = form.name.trim() && form.note.trim() && form.consent && !busy;

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
          {/* Two strings, because an invite with no address was not SENT
              anywhere — «נשלח אל» with an empty value would be a lie about
              what happened. */}
          {invite.email
            ? t("pending_with_email", {
                email: invite.email,
                date: fmtDate(invite.expires_at),
              })
            : t("pending", { date: fmtDate(invite.expires_at) })}
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
            <Button
              type="button"
              data-testid="owner-invite-copy-message"
              onClick={copyMessage}
              variant="secondary"
              size="sm"
            >
              {messageCopied ? t("message_copied") : t("copy_message")}
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
          {/* Which of the two is shown is the difference between «the owner's
              approval publishes this» and «it is already out there» — the one
              thing about this invite the admin cannot see from the form, and
              the one she may want to change before minting a link. Rendered
              here rather than next to the button so she reads it while filling
              the form in, not after. */}
          {producer?.status === HIDDEN_STATUS && (
            <p className="text-sm text-text" data-testid="owner-invite-status-hidden">
              {t("status_hidden")}
            </p>
          )}
          {producer?.status === LIVE_STATUS && (
            <p className="text-sm text-warning-700" data-testid="owner-invite-status-live">
              {t("status_live")}
            </p>
          )}
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
