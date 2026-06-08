"use client";

/**
 * Minimal toast store — module-level pub/sub, no context provider needed.
 *
 * API (MEH-685 — semantic methods only; the legacy positional
 * `showToast(message, type, duration, options)` shim was removed once every
 * call site migrated):
 *
 *   showToast.success("נשמר")
 *   showToast.error("שגיאה")
 *   showToast.info("מידע", { action: { label, href } })
 *
 * Each method sets a default icon per type, resolved at render time in
 * Toaster.jsx (success → CheckCircle, error → WarningCircle, info → Info).
 * Pass `{ icon: <Bell size={18} /> }` to override the default for a bespoke
 * surface (favorites Heart, follow Bell, link copied, …). `{ duration }`
 * overrides the default TTL.
 *
 * The <Toaster /> component subscribes to this store and renders toasts
 * fixed to the bottom of the viewport. Mount it once in layout.js.
 *
 * This module is presentation-agnostic: it carries an opaque `icon` node but
 * never imports React/JSX. Default-icon-per-type resolution lives in
 * Toaster.jsx so the store stays a plain pub/sub.
 */

const DEFAULT_DURATION = 2800;

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
 * enqueue — shared core for the semantic methods. Safe on the server (no-op).
 *
 * @param {string} message — Hebrew/English text
 * @param {"success"|"error"|"info"} type
 * @param {number} duration — ms before auto-dismiss
 * @param {{ icon?: React.ReactNode, action?: { label: string, href: string } }} options
 */
function enqueue(message, type, duration, options) {
  if (typeof window === "undefined") return;
  const id = nextId++;
  const action =
    options && options.action && options.action.label && options.action.href
      ? { label: options.action.label, href: options.action.href }
      : null;
  // `icon` is opaque to the store. null → Toaster falls back to the
  // default icon for `type`. A truthy node overrides that default.
  const icon = options && options.icon != null ? options.icon : null;
  toasts = [...toasts, { id, message, type, icon, action }];
  listeners.forEach((l) => l());
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    listeners.forEach((l) => l());
  }, duration);
}

/**
 * semantic — builds a `showToast.<type>(message, options)` method. The icon
 * default for the type is applied at render time in Toaster.jsx; an explicit
 * `options.icon` overrides it. `options.duration` overrides the default TTL.
 */
function semantic(type) {
  return (message, options = {}) => {
    const duration = options.duration ?? DEFAULT_DURATION;
    enqueue(message, type, duration, options);
  };
}

// MEH-685: methods-only object. There is no bare `showToast(...)` callable —
// the positional shim was removed after the call-site migration. errors.js
// dispatches dynamically via `showToast[type](...)`.
export const showToast = {
  success: semantic("success"),
  error: semantic("error"),
  info: semantic("info"),
};
