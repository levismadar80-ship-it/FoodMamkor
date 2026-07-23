"use client";

import { useId } from "react";
import { Check } from "@phosphor-icons/react";

/**
 * Input — labelled text field primitive (MEH-602).
 *
 * Module:   Input
 * Purpose:  Consistent text field with label + helper/error slots and baked-in
 *           focus/error/disabled states. Net-new atom — forms migrate later.
 * Does NOT: own form state or validation — the consumer controls value/onChange
 *           and passes `error` text when a field is invalid.
 * Related:  globals.css (.focus-ring), tokens (border, surface-card, fg-muted).
 * History:  MEH-602 (creation); MEH-1128 D1 (startAdornment + success —
 *           default path byte-identical, locked by ui-Input.test.jsx snapshots).
 *
 * Types  : text | email | tel | search (any native type passes through)
 * States : default | focus | error | success | disabled
 * Slots  : label / helperText / error / successText / startAdornment
 *          (precedence: error > successText > helperText)
 *
 * startAdornment — decorative node (icon/currency) at the field's
 * inline-start (start-3 on the wrapper; right in RTL), pointer-events-none +
 * aria-hidden. The input's clearing padding follows the INPUT's dir: ps-10
 * normally, pe-10 when dir="ltr" (the adornment stays at the page's start
 * side while an ltr input's "ps" is its left — MEH-992 ₪ parity; the /en
 * mismatch is inherited from MEH-992 and out of scope per MEH-472).
 * success — primary-family tint only: DESIGN.md "success = primary" and
 * ADR-019 forbid new state-color tokens. error always wins over success.
 *
 * Error styling uses red utility classes (not the brand palette) — error red is
 * a system signal and is distinct from the MEH-636 heart "never red" lock, which
 * is about the favorite affordance, not validation. a11y: label is linked via
 * htmlFor, and helper/error text is wired through aria-describedby +
 * aria-invalid.
 *
 * @example
 * <Input type="email" label="אימייל" helperText="לא נשתף עם אף אחד" />
 * <Input type="text" label="שם" error="שדה חובה" />
 */
export default function Input({
  type = "text",
  label,
  helperText,
  error,
  success = false,
  successText,
  startAdornment,
  id,
  className = "",
  disabled = false,
  ...rest
}) {
  const autoId = useId();
  const inputId = id || autoId;
  const describedById = `${inputId}-desc`;
  const hasError = !!error;
  // MEH-1128 D1: error wins over success (a field can't be valid and invalid).
  const showSuccess = !hasError && !!success;
  const successMessage = showSuccess && successText;
  const message = error || successMessage || helperText;

  const inputEl = (
    <input
      id={inputId}
      type={type}
      disabled={disabled}
      aria-invalid={hasError || undefined}
      aria-describedby={message ? describedById : undefined}
      className={[
        // DO NOT reorder/reword the default branches — the no-adornment,
        // no-success class string must stay byte-identical (D1 snapshot lock).
        // Clearing pad follows the input's own dir (see header: MEH-992 parity).
        startAdornment
          ? rest.dir === "ltr"
            ? "w-full min-h-[44px] rounded-md border bg-surface-card ps-3 pe-10 text-text"
            : "w-full min-h-[44px] rounded-md border bg-surface-card ps-10 pe-3 text-text"
          : "w-full min-h-[44px] rounded-md border bg-surface-card px-3 text-text",
        "placeholder:text-fg-muted transition-colors duration-fast ease-quart focus-ring",
        hasError
          ? "border-error"
          : showSuccess
            ? "border-primary"
            : "border-border focus:border-primary",
        disabled ? "opacity-50 cursor-not-allowed bg-background" : "",
        className,
      ].join(" ")}
      {...rest}
    />
  );

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-text">
          {label}
        </label>
      )}

      {startAdornment ? (
        <div className="relative">
          {/* REUSES: group-buys/page.js MEH-992 ₪ span — generalized;
              decorative only, so hidden from AT and click-through. */}
          <span
            aria-hidden="true"
            className="absolute inset-y-0 start-3 flex items-center text-fg-muted pointer-events-none"
          >
            {startAdornment}
          </span>
          {inputEl}
        </div>
      ) : (
        inputEl
      )}

      {message &&
        (successMessage ? (
          <span
            id={describedById}
            className="text-xs text-primary inline-flex items-center gap-1"
          >
            <Check size={12} weight="bold" aria-hidden="true" />
            {successText}
          </span>
        ) : (
          <span
            id={describedById}
            className={hasError ? "text-xs text-error" : "text-xs text-fg-muted"}
          >
            {message}
          </span>
        ))}
    </div>
  );
}
