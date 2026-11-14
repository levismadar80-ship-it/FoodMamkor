// @ts-check
/**
 * field — what every form field on the site shares (MEH-3136).
 *
 * Module:   fieldClasses, FieldShell
 * Purpose:  One source for the look of a compact field (border, radius, focus
 *           ring, error border, disabled) and for the label + message wiring
 *           around it, so Input, Select and Textarea cannot drift apart.
 * Does NOT: own the 44px "md" Input — its class string lives in Input.jsx and
 *           is locked byte-for-byte by ui-Input.test.jsx snapshots.
 * Related:  ui/Input.jsx, ui/Select.jsx, ui/Textarea.jsx,
 *           __tests__/FieldLookGuard.test.js (radius + focus ring),
 *           __tests__/HandWrittenRatchet.test.js (no new raw field).
 * History:  MEH-3136 (creation).
 */

/** Padding + text size per compact size. `sm` is a form field, `xs` sits in a row of controls. */
export const FIELD_SIZES = {
  sm: "px-3 py-2 text-sm",
  xs: "px-2 py-1 text-sm",
};

/**
 * @param {{ size?: "sm" | "xs", invalid?: boolean, block?: boolean }} [opts]
 * `block` false leaves the width to the caller (`flex-1`, `w-20`): a field
 * inside a row must not also say `w-full`.
 */
export function fieldClasses({ size = "sm", invalid = false, block = true } = {}) {
  return [
    block ? "w-full" : "",
    "rounded-sm border bg-surface text-text",
    FIELD_SIZES[size] || FIELD_SIZES.sm,
    "placeholder:text-fg-muted focus-ring",
    invalid ? "border-error" : "border-border",
    "disabled:opacity-50 disabled:cursor-not-allowed",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Label above, message below — the same wiring Input's "md" path has.
 * @param {{
 *   id: string,
 *   label?: import("react").ReactNode,
 *   required?: boolean,
 *   message?: import("react").ReactNode,
 *   describedById?: string,
 *   invalid?: boolean,
 *   children: import("react").ReactNode,
 * }} props
 */
export function FieldShell({ id, label, required = false, message, describedById, invalid = false, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-text">
          {label}
          {required && (
            <span className="text-error" aria-hidden="true">
              {" *"}
            </span>
          )}
        </label>
      )}
      {children}
      {message && (
        <span id={describedById} className={invalid ? "text-xs text-error" : "text-xs text-fg-muted"}>
          {message}
        </span>
      )}
    </div>
  );
}
