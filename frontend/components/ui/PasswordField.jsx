"use client";
// @ts-check

import { useId, useState } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { fieldClasses, FieldShell } from "./field";

/**
 * PasswordField — a password input with a show/hide eye toggle (MEH-3141).
 *
 * Module:   PasswordField
 * Purpose:  The ONE field for typing an existing or repeated password: current
 *           password, "confirm password". Same look and label/error wiring as
 *           ui/Input, plus the 44px eye toggle.
 * Does NOT: check password strength or policy — a NEW password is
 *           components/PasswordInput.jsx (live policy list + breach check).
 *           Does not own the value; the caller controls value/onChange.
 * Related:  ui/field.jsx (look + label shell), .claude/rules/rtl.md (the eye
 *           toggle is the documented physical-side exception).
 * History:  MEH-3141 (creation — replaces four hand-written copies in
 *           settings and reset-password).
 *
 * The input is always dir="ltr" (passwords are typed left to right), so the
 * toggle sits on the physical right and the input reserves pr-12 for it.
 * Text is right-aligned, as in PasswordInput, so the two sit alike in a form.
 *
 * @param {{
 *   label?: import("react").ReactNode,
 *   helperText?: import("react").ReactNode,
 *   error?: import("react").ReactNode,
 *   invalid?: boolean,
 *   showLabel: string,
 *   hideLabel: string,
 *   id?: string,
 *   className?: string,
 *   required?: boolean,
 *   size?: "md" | "sm",
 * } & Omit<import("react").InputHTMLAttributes<HTMLInputElement>, "size" | "type">} props
 *   `showLabel` / `hideLabel` are the toggle's accessible names (translated by
 *   the caller). `invalid` marks the field red without a message of its own
 *   (the caller shows one elsewhere); `error` does both.
 *
 * @example
 * <PasswordField label="סיסמה נוכחית" required value={v} onChange={…}
 *   showLabel="הצגת הסיסמה" hideLabel="הסתרת הסיסמה" />
 */
export default function PasswordField({
  label,
  helperText,
  error,
  invalid = false,
  showLabel,
  hideLabel,
  id,
  className = "",
  required = false,
  size = "md",
  ...rest
}) {
  const [shown, setShown] = useState(false);
  const autoId = useId();
  const inputId = id || autoId;
  const describedById = `${inputId}-desc`;
  const isInvalid = invalid || !!error;
  const message = error || helperText;

  return (
    <FieldShell id={inputId} label={label} required={required} message={message} describedById={describedById} invalid={!!error}>
      <div className="relative">
        <input
          id={inputId}
          type={shown ? "text" : "password"}
          dir="ltr"
          required={required || undefined}
          aria-invalid={isInvalid || undefined}
          aria-describedby={message ? describedById : undefined}
          // rtl-ok: pr-12 reserves the 44px eye toggle inside the dir="ltr" input
          className={`${fieldClasses({ size, invalid: isInvalid })} pr-12 text-right ${className}`.trim()}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          // eslint-disable-next-line no-restricted-syntax -- rtl-ok: eye toggle inside the dir="ltr" input
          className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-fg-muted transition-colors hover:text-text focus-ring"
          aria-label={shown ? hideLabel : showLabel}
          aria-pressed={shown}
        >
          {shown ? <EyeSlash size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    </FieldShell>
  );
}
