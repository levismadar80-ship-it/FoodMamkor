"use client";

/**
 * Minimal toast store — module-level pub/sub, no context provider needed.
 * Any component can call `showToast("נשמר למועדפים ❤️")` from anywhere.
 *
 * The <Toaster /> component subscribes to this store and renders toasts
 * fixed to the bottom of the viewport. Mount it once in layout.js.
 */

let nextId = 1;
const listeners = new Set();
let toasts = [];

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToasts() {
  return toasts;
}

/**
 * showToast — call from anywhere. Safe on the server (no-op).
 *
 * @param {string} message — Hebrew/English text
 * @param {"success"|"error"|"info"} [type="success"]
 * @param {number} [duration=2800] — ms before auto-dismiss
 * @param {{ action?: { label: string, href: string } }} [options]
 *        Optional action link rendered inside the toast (snackbar
 *        pattern). Used by the logged-out heart flow to offer a "התחברי"
 *        link without opening a modal. The link navigates via <a href>,
 *        keeping the Next.js app-router default behavior for `next=…`.
 */
export function showToast(message, type = "success", duration = 2800, options = {}) {
  if (typeof window === "undefined") return;
  const id = nextId++;
  const action =
    options && options.action && options.action.label && options.action.href
      ? { label: options.action.label, href: options.action.href }
      : null;
  toasts = [...toasts, { id, message, type, action }];
  listeners.forEach((l) => l());
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    listeners.forEach((l) => l());
  }, duration);
}
