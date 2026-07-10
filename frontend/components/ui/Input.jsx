"use client";

import { useId } from "react";

/**
 * Input — labelled text field primitive (MEH-602).
 *
 * Module:   Input
 * Purpose:  Consistent text field with label + helper/error slots and baked-in
 *           focus/error/disabled states. Net-new atom — forms migrate later.
 * Does NOT: own form state or validation — the consumer controls value/onChange
 *           and passes `error` text when a field is invalid.
 * Related:  globals.css (.focus-ring), tokens (border, surface-card, fg-muted).
 * History:  MEH-602 (creation).
 *
 * Types  : text | email | tel | search (any native type passes through)
 * States : default | focus | error | disabled
 * Slots  : label / helperText / error (error supersedes helperText)
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
  id,
  className = "",
  disabled = false,
  ...rest
}) {
  const autoId = useId();
  const inputId = id || autoId;
  const describedById = `${inputId}-desc`;
  const hasError = !!error;
  const message = error || helperText;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-text">
          {label}
        </label>
      )}

      <input
        id={inputId}
        type={type}
        disabled={disabled}
        aria-invalid={hasError || undefined}
        aria-describedby={message ? describedById : undefined}
        className={[
          "w-full min-h-[44px] rounded-md border bg-surface-card px-3 text-text",
          "placeholder:text-fg-muted transition-colors duration-fast ease-quart focus-ring",
          hasError ? "border-error" : "border-border focus:border-primary",
          disabled ? "opacity-50 cursor-not-allowed bg-background" : "",
          className,
        ].join(" ")}
        {...rest}
      />

      {message && (
        <span
          id={describedById}
          className={hasError ? "text-xs text-error" : "text-xs text-fg-muted"}
        >
          {message}
        </span>
      )}
    </div>
  );
}
