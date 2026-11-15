// @ts-check
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
// MEH-3173: live auto-dismiss timer per toast key.
const keyedTimers = new Map();

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
 * @param {{ id?: string, icon?: React.ReactNode, action?: { label: string, href: string } }} options
 */
function enqueue(message, type, duration, options) {
  if (typeof window === "undefined") return;
  // MEH-3173: one visible toast per key (sonner / react-hot-toast `id`
  // semantics). Raising the same key again replaces the visible toast in place
  // and restarts its timer, instead of stacking a copy. The key is the
  // explicit `options.id` when given; otherwise the type + message, so the
  // same sentence raised twice in a row (a double tap, parallel requests that
  // all fail the same way) is never stacked either. Different text → its own
  // toast, as before.
  const key =
    options && options.id != null ? `id:${options.id}` : `msg:${type}:${message}`;
  const id = `${key}#${nextId++}`;
  const existing = toasts.find((t) => t.key === key);
  const action =
    options && options.action && options.action.label && options.action.href
      ? { label: options.action.label, href: options.action.href }
      : null;
  // `icon` is opaque to the store. null → Toaster falls back to the
  // default icon for `type`. A truthy node overrides that default.
  const icon = options && options.icon != null ? options.icon : null;
  // Keep the existing entry's React key so the Toaster updates it in place
  // (no exit/enter flicker) rather than remounting it.
  const entry = { id: existing ? existing.id : id, key, message, type, icon, action };
  toasts = existing
    ? toasts.map((t) => (t.key === key ? entry : t))
    : [...toasts, entry];
  listeners.forEach((l) => l());
  clearTimeout(keyedTimers.get(key));
  const timer = setTimeout(() => {
    keyedTimers.delete(key);
    toasts = toasts.filter((t) => t.key !== key);
    listeners.forEach((l) => l());
  }, duration);
  keyedTimers.set(key, timer);
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
