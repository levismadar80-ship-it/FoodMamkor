"use client";
// @ts-check

import { useId } from "react";
import { fieldClasses, FieldShell } from "./field";

/**
 * Textarea — the shared <textarea> (MEH-3136).
 *
 * Module:   Textarea
 * Purpose:  A <textarea> with the same label, error and aria-describedby wiring
 *           and the same look as ui/Input, so a form does not hand-write one.
 * Does NOT: own form state or validation — the caller controls value/onChange
 *           and passes `error` text. Without `label`, pass `aria-label`.
 * Related:  ui/field.jsx (look + shell), ui/Input.jsx.
 * History:  MEH-3136 (creation).
 *
 * No resize default: pass `resize-none` or `resize-y` in `className`.
 *
 * `inline` renders the bare <textarea> with no wrapper and no `w-full`, for a
 * control inside a row (the caller sets the width in `className`).
 *
 * @param {{
 *   label?: import("react").ReactNode,
 *   helperText?: import("react").ReactNode,
 *   error?: import("react").ReactNode,
 *   size?: "sm" | "xs",
 *   inline?: boolean,
 *   id?: string,
 *   className?: string,
 *   required?: boolean,
 *   [key: string]: any,
 * }} props
 */
export default function Textarea({
  label,
  helperText,
  error,
  size = "sm",
  inline = false,
  id,
  className = "",
  required = false,
  rows = 3,
  ...rest
}) {
  const autoId = useId();
  const fieldId = id || autoId;
  const describedById = `${fieldId}-desc`;
  const invalid = !!error;
  const message = error || helperText;
  const hasShell = !inline || !!label || !!message;

  const el = (
    <textarea
      id={fieldId}
      required={required || undefined}
      aria-invalid={invalid || undefined}
      aria-describedby={message ? describedById : undefined}
      className={`${fieldClasses({ size, invalid, block: !inline })} ${className}`.trim()}
      rows={rows}
      {...rest}
    />
  );

  if (!hasShell) return el;
  return (
    <FieldShell id={fieldId} label={label} required={required} message={message} describedById={describedById} invalid={invalid}>
      {el}
    </FieldShell>
  );
}
