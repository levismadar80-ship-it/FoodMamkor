// @ts-check
/**
 * Module:   clipboard
 * Purpose:  The one way to copy text on the site. It tries the Clipboard API,
 *           then the old textarea + execCommand path, and always answers
 *           true/false. It never throws, so a button can say «הועתק» or
 *           report the failure, and never stay silent.
 * Used by:  every copy button (share cards, dashboard link cards, admin
 *           invite/claim panels, story/review captions, contact card e-mail
 *           fallback). The caller owns the feedback (label flip or toast).
 * Not for:  AdminDraftClaimActions' ClipboardItem write, which has to start
 *           before its text exists (a promise inside the user gesture). It is
 *           the one listed exception in __tests__/ClipboardGuard.test.js.
 * Rule:     call it straight from the tap handler, with no await before it.
 *           Safari counts the write as part of the gesture only in that tick.
 * History:  MEH-1223 (honest copy toasts, the execCommand fallback in
 *           ShareSiteActions) · MEH-1428 (missing rejection paths) ·
 *           MEH-3064 (shared-components research item 7, one helper).
 */

/**
 * @param {string} value
 * @returns {Promise<boolean>} true only when the text really reached the clipboard.
 */
export async function copyText(value) {
  const text = value ?? "";
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      throw new Error("clipboard unavailable");
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return legacyCopy(text);
  }
}

/** @param {string} text */
function legacyCopy(text) {
  if (typeof document === "undefined" || !document.body) return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  // Off-screen and read-only: no flash and no keyboard on a phone.
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    return document.execCommand("copy") === true;
  } catch {
    return false;
  } finally {
    document.body.removeChild(ta);
  }
}

/**
 * Same copy for promise chains: resolves when the text was copied, rejects
 * when it was not, so an existing `.then(success).catch(failure)` keeps its
 * shape.
 * @param {string} value
 * @returns {Promise<void>}
 */
export async function copyOrThrow(value) {
  if (!(await copyText(value))) throw new Error("copy failed");
}
