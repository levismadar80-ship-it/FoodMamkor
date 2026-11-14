/**
 * Module:   share-link
 * Purpose:  One way for a business owner to share her public link: the
 *           phone's own share sheet when there is one (Instagram stories are
 *           reachable only there), else a copy to the clipboard.
 * Used by:  the dashboard home «הלינק שלי» card (VanityLinkCard) and the
 *           insights «שמרו במועדפים» card — MEH-2884 (placement audit item
 *           9): «שתפו את העמוד» used to navigate to the page instead.
 * Also:     every other share button on the site (ShareButton,
 *           ShareSiteActions, group-buy page, rescue tab, register success)
 *           goes through tryNativeShare / shareOrCopyText below — MEH-2996
 *           found five more hand-written copies of the same sequence.
 * Rule:     put a link ONLY in `url`. Inside `text` too, iOS may share plain
 *           text instead of a link card (MEH-2827 PR 6).
 * History:  MEH-2827 PR 8 (inside VanityLinkCard); MEH-2884 (extracted);
 *           MEH-2996 (the one owner of navigator.share — guarded by
 *           __tests__/ShareLink.test.js).
 */

import { copyText as copyClipboard } from "@/lib/clipboard";

/**
 * Open the device share sheet.
 * @param {{title?: string, text?: string, url?: string}} data
 * @returns {Promise<"shared"|"cancelled"|"unavailable">} "unavailable" = no
 *   sheet on this device, or the sheet refused (anything but AbortError):
 *   the caller falls back, so the tap still does something (review of #4178).
 *   "cancelled" is the person's answer — never fall back on it.
 */
export async function tryNativeShare(data) {
  if (typeof navigator === "undefined" || !navigator.share) return "unavailable";
  try {
    await navigator.share(data);
    return "shared";
  } catch (err) {
    return err?.name === "AbortError" ? "cancelled" : "unavailable";
  }
}

/**
 * The sheet, else the caller's own copy.
 * @param {{ url: string, text?: string, copy: () => void }} args
 *   copy — the caller's own copy-to-clipboard (it owns the "copied" feedback).
 */
export async function shareOrCopy({ url, text, copy }) {
  // No sheet → copy in the same tick as the tap (no await before it), so the
  // clipboard write still counts as part of the user gesture.
  if (typeof navigator === "undefined" || !navigator.share) return copy();
  if ((await tryNativeShare(text ? { text, url } : { url })) === "unavailable") copy();
}

/**
 * The sheet, else the clipboard; the caller shows the feedback.
 * @param {object} args
 * @param {{title?: string, text?: string, url?: string}} args.data
 * @param {string} args.copyText  What the clipboard gets when there is no sheet.
 * @returns {Promise<"shared"|"cancelled"|"copied"|"failed">}
 */
export async function shareOrCopyText({ data, copyText }) {
  // With a sheet, wait for its answer; with none, go straight to the copy —
  // no await before the clipboard write, so it stays inside the user gesture
  // (Safari is strict about that).
  const hasSheet = typeof navigator !== "undefined" && Boolean(navigator.share);
  if (hasSheet) {
    const outcome = await tryNativeShare(data);
    if (outcome !== "unavailable") return outcome;
  }
  return (await copyClipboard(copyText)) ? "copied" : "failed";
}
