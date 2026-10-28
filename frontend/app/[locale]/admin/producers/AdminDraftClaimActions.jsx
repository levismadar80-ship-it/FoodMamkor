"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
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
// server's Hebrew detail, or the panel's generic error); `stale` marks a 409 or
// 404 — the row was claimed, submitted or deleted since the list loaded.
class MintError extends Error {
  constructor(message, stale) {
    super(message);
    this.stale = stale;
  }
}

// A stalled mint must not hold the single-flight lock for minutes.
const MINT_TIMEOUT_MS = 20000;
// 409 = claimed / submitted since the list loaded; 404 = deleted meanwhile.
const STALE_STATUSES = [404, 409];

// Mint → parse → compose. Resolves to the message text; rejects with MintError.
function mintMessage(producerId, t, fallbackError) {
  // Bounded: api.js sets no timeout, and the single-flight lock below holds
  // every row's button until this settles.
  return api.post(`/admin/producers/${producerId}/claim-link`, undefined, { timeout: MINT_TIMEOUT_MS }).then(
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
        STALE_STATUSES.includes(err?.response?.status),
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
// A tiny external store, so EVERY row's button renders disabled while one
// mint is in flight — a silently ignored click is worse than a visible one.
let mintInFlight = false;
const lockListeners = new Set();
function setMintInFlight(value) {
  mintInFlight = value;
  lockListeners.forEach((listener) => listener());
}
function subscribeLock(listener) {
  lockListeners.add(listener);
  return () => lockListeners.delete(listener);
}
const readLock = () => mintInFlight;

function ManualCopyBox({ text, tClaim }) {
  const ref = useRef(null);
  const noteId = useId();
  // Move focus to the box and select it: the admin's next keystroke is the
  // copy, and a screen reader announces the alert line it is labelled by.
  // Not if she has moved into a text field while the mint ran — stealing
  // focus mid-typing is worse than leaving the (announced) box unfocused.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = document.activeElement;
    const typing = active && active !== document.body && active.tagName !== "BUTTON";
    if (typing) return;
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
  const locked = useSyncExternalStore(subscribeLock, readLock, () => false);

  if (producer.status !== "draft" || producer.has_owner !== false) return null;

  const onClick = () => {
    if (busy || mintInFlight) return;
    setMintInFlight(true);
    setBusy(true);
    setManualText(null);
    const fallback = tClaim("error");
    let text;
    let write;
    // Only Promise.allSettled below releases the lock, so nothing between
    // here and there may throw past it. The realistic thrower is a
    // ClipboardItem constructor that rejects promise values: treat it as a
    // refused clipboard (the box opens once the mint answers).
    try {
      text = mintMessage(producer.id, t, fallback);
      write = writeClipboard(text);
    } catch {
      if (!text) {
        setMintInFlight(false);
        setBusy(false);
        showToast.error(fallback);
        return;
      }
      write = Promise.reject(new Error("clipboard threw"));
    }
    Promise.allSettled([text, write]).then(([txt, wr]) => {
      setMintInFlight(false);
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
        disabled={busy || locked}
        aria-busy={busy}
        className="text-primary hover:underline text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
      >
        {t("copy_message")}
      </button>
      {manualText && <ManualCopyBox text={manualText} tClaim={tClaim} />}
    </div>
  );
}
