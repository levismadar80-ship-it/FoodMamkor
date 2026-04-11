"use client";

import { CircleNotch } from "@phosphor-icons/react";

/**
 * ButtonSpinner — the project's standard in-button loading indicator.
 *
 * Used inside `<button>` elements to replace the static label while an
 * async submit / action is in flight. Pattern:
 *
 *   <button disabled={loading} type="submit" className="...">
 *     {loading ? (
 *       <span className="inline-flex items-center gap-2">
 *         <ButtonSpinner />
 *         שולחת...
 *       </span>
 *     ) : (
 *       "שלחי"
 *     )}
 *   </button>
 *
 * Consumers should:
 *   - Keep `disabled={loading}` on the button so the user can't submit twice
 *   - Pick contextually-appropriate feminine verb text ("שולחת", "נרשמת",
 *     "מתחברת", "מצטרפת", etc.) — CLAUDE.md micro-copy rule: feminine voice
 *   - Reset loading state in `finally` / on error so the button recovers
 *
 * Size defaults to 16px which pairs well with text at the typical button
 * font-size (14-16px). Override with `size` prop if needed.
 *
 * Introduced in tasks_for_claude_code.md task 18 (form submit loading state).
 */
export default function ButtonSpinner({ size = 16, className = "" }) {
  return (
    <CircleNotch
      size={size}
      weight="bold"
      className={`animate-spin ${className}`}
      aria-hidden="true"
    />
  );
}
