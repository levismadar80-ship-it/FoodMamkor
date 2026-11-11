/**
 * Module:   share-link
 * Purpose:  One way for a business owner to share her public link: the
 *           phone's own share sheet when there is one (Instagram stories are
 *           reachable only there), else a copy to the clipboard.
 * Used by:  the dashboard home «הלינק שלי» card (VanityLinkCard) and the
 *           insights «שמרו במועדפים» card — MEH-2884 (placement audit item
 *           9): «שתפו את העמוד» used to navigate to the page instead.
 * History:  MEH-2827 PR 8 (inside VanityLinkCard); MEH-2884 (extracted).
 */

/**
 * @param {{ url: string, text?: string, copy: () => void }} args
 *   copy — the caller's own copy-to-clipboard (it owns the "copied" feedback).
 */
export async function shareOrCopy({ url, text, copy }) {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(text ? { text, url } : { url });
    } catch (err) {
      // Cancelled is the owner's answer. Any other failure (a share target
      // that refused, NotAllowedError) falls back to the copy, so the tap
      // still does something (review of #4178).
      if (err?.name !== "AbortError") copy();
    }
    return;
  }
  copy();
}
