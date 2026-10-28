"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { ProducerClaimLinkSchema } from "@/lib/api-schemas";
import { showToast } from "@/lib/toast";

/**
 * Module:   AdminDraftClaimActions
 * Purpose:  The drafts list's per-row claim surface (MEH-2495): a chip saying
 *           whether the owner has claimed the draft yet, and — while she has
 *           not — one click that mints a fresh claim link and copies a ready
 *           WhatsApp message carrying it.
 * Touches:  POST /admin/producers/{id}/claim-link (producer_claim.py) — the
 *           same stateless 14-day mint as ClaimLinkPanel; no DB write.
 * Does NOT: send anything (the admin pastes the message herself), keep any
 *           link history (MEH-2496), or decide who may claim — the server
 *           does, and its 409 detail is shown verbatim.
 * Related:  components/admin/ClaimLinkPanel.jsx (the edit-page panel, same
 *           endpoint + schema) · routers/admin.py `_attach_has_owner`.
 * History:  MEH-2495.
 *
 * `has_owner` is read strictly (=== true / === false): a row from a backend
 * that does not send the field renders neither the chip nor the action,
 * rather than offering a link for a page that may already be claimed.
 */

export function DraftOwnerBadge({ producer }) {
  const t = useTranslations("admin.producers.table.draft_claim");
  if (producer.status !== "draft" || typeof producer.has_owner !== "boolean") {
    return null;
  }
  const claimed = producer.has_owner;
  return (
    <span
      data-testid="draft-owner-badge"
      data-owner={claimed ? "claimed" : "waiting"}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
        claimed ? "bg-green-100 text-green-800" : "bg-sky-100 text-sky-800"
      }`}
    >
      {claimed ? t("owner_claimed") : t("owner_waiting")}
    </span>
  );
}

// A refused mint. `message` is always a string fit for the admin (the
// server's Hebrew detail, or the panel's generic error); `stale` marks a 409 —
// the row was claimed or submitted since the list loaded, so it is out of date.
class MintError extends Error {
  constructor(message, stale) {
    super(message);
    this.stale = stale;
  }
}

// Mint → parse → compose. Resolves to the message text; rejects with MintError.
function mintMessage(producerId, t, fallbackError) {
  return api.post(`/admin/producers/${producerId}/claim-link`).then(
    (r) => {
      // Rule 19: a malformed payload is an error, never a link to paste.
      const parsed = ProducerClaimLinkSchema.safeParse(r.data);
      if (!parsed.success) throw new MintError(fallbackError, false);
      return t("message", { url: parsed.data.url });
    },
    // The 409s carry the server's Hebrew reason (draft already submitted /
    // already claimed) — shown as-is, the same as ClaimLinkPanel.
    (err) => {
      throw new MintError(
        detailToMessage(err?.response?.data?.detail) || fallbackError,
        err?.response?.status === 409,
      );
    },
  );
}

// The clipboard write must start inside the click (Safari drops a write that
// begins after an await). A ClipboardItem accepts a PROMISE of its content,
// so the write is issued synchronously and the text arrives when the mint
// resolves. Without ClipboardItem, fall back to writeText after the mint —
// fine in browsers with a transient-activation window; if it is refused the
// caller shows the text to copy by hand.
function writeClipboard(textPromise) {
  const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  if (clip?.write && typeof ClipboardItem !== "undefined") {
    const blob = textPromise.then((s) => new Blob([s], { type: "text/plain" }));
    // The browser may refuse the write (focus / permission) before it ever
    // reads `blob`; a mint failing after that would leave `blob` rejected with
    // no handler — an unhandledrejection. The failure itself is reported
    // through `textPromise` by the caller, so this handler only absorbs it.
    blob.catch(() => {});
    return clip.write([new ClipboardItem({ "text/plain": blob })]);
  }
  if (clip?.writeText) return textPromise.then((s) => clip.writeText(s));
  return Promise.reject(new Error("clipboard unavailable"));
}

// One mint at a time across ALL rows. Two in flight would race for the
// clipboard, and both would toast «הועתקה» — so the admin could paste row A's
// link to row B's owner. The link is a bearer credential (first one to claim
// wins, producer_claim.py), so that paste hands A's draft to a stranger.
let mintInFlight = false;

function ManualCopyBox({ text, tClaim }) {
  const ref = useRef(null);
  const noteId = useId();
  // Move focus to the box and select it: the admin's next keystroke is the
  // copy, and a screen reader announces the alert line it is labelled by.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(0, el.value.length);
  }, [text]);
  return (
    <>
      <p id={noteId} role="alert" className="text-xs text-error" data-testid="draft-claim-copy-failed">
        {tClaim("copy_failed")}
      </p>
      <textarea
        ref={ref}
        data-testid="draft-claim-message-manual"
        aria-labelledby={noteId}
        readOnly
        rows={4}
        value={text}
        onFocus={(e) => e.target.setSelectionRange(0, e.target.value.length)}
        // No min-width: the producers table keeps its columns at 375
        // (MEH-2070), and a wide box would push the actions column off-screen.
        className="w-full border border-border rounded-[12px] px-3 py-2 text-xs bg-background"
      />
    </>
  );
}

export function CopyClaimMessageButton({ producer, onStale }) {
  const t = useTranslations("admin.producers.table.draft_claim");
  const tClaim = useTranslations("admin.producers.claim");
  const [busy, setBusy] = useState(false);
  const [manualText, setManualText] = useState(null);

  if (producer.status !== "draft" || producer.has_owner !== false) return null;

  const onClick = () => {
    if (busy || mintInFlight) return;
    mintInFlight = true;
    setBusy(true);
    setManualText(null);
    const fallback = tClaim("error");
    const text = mintMessage(producer.id, t, fallback);
    const write = writeClipboard(text);
    Promise.allSettled([text, write]).then(([txt, wr]) => {
      mintInFlight = false;
      setBusy(false);
      if (txt.status === "rejected") {
        const reason = txt.reason;
        // Anything that is not a MintError (a formatter throw, say) is a bug
        // on our side — never toast its raw English message.
        showToast.error(reason instanceof MintError ? reason.message : fallback);
        // The row is out of date: reload, so it stops offering the action.
        if (reason instanceof MintError && reason.stale) onStale?.();
      } else if (wr.status === "fulfilled") {
        showToast.success(t("copied"));
      } else {
        setManualText(txt.value);
      }
    });
  };

  return (
    <div className="flex flex-col items-start gap-1 basis-full">
      <button
        type="button"
        data-testid="draft-copy-claim-message"
        onClick={onClick}
        disabled={busy}
        aria-busy={busy}
        className="text-primary hover:underline text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
      >
        {t("copy_message")}
      </button>
      {manualText && <ManualCopyBox text={manualText} tClaim={tClaim} />}
    </div>
  );
}
