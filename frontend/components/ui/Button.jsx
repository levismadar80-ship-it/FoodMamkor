"use client";

import { CircleNotch } from "@phosphor-icons/react";

/**
 * Button — pill action primitive (MEH-602).
 *
 * Module:   Button
 * Purpose:  Single source for every button across the app. Net-new atom —
 *           pages migrate onto it in MEH-131-135.
 * Does NOT: own navigation semantics — for links use Link.jsx (renders <a>).
 * Related:  Header.jsx:211-218 (filled primary), :245-250 (outlined),
 *           LoginAccount Header.jsx:422-438 (text/ghost ink), globals.css
 *           (.focus-ring, .duration-fast, .ease-quart).
 * History:  MEH-602 (creation).
 *
 * Variants : primary | secondary | ghost | outlined | text
 * Sizes    : sm | md | lg  (all keep a ≥44px touch target — WCAG 2.5.5)
 * States   : default | hover | active | disabled | loading
 * Slots    : leadingIcon / trailingIcon (logical start/end — RTL-correct by
 *            flex order; pass a pre-mirrored glyph for directional arrows).
 *
 * Loading swaps the leading slot for a spinner, sets aria-busy and the feminine
 * aria-label "טוענת…", and blocks pointer events.
 *
 * @example
 * <Button variant="primary" size="lg" leadingIcon={<MagnifyingGlass />}>חיפוש</Button>
 * <Button variant="outlined" loading>שמירה</Button>
 */
const VARIANT_CLASSES = {
  primary:
    "bg-action-primary hover:bg-action-primary-hover active:bg-action-primary-hover text-white border border-transparent",
  secondary:
    "bg-primary/10 hover:bg-primary/20 active:bg-primary/25 text-primary border border-transparent",
  outlined:
    "bg-transparent hover:bg-primary/5 active:bg-primary/10 text-action-primary border border-action-primary",
  ghost:
    "bg-transparent hover:bg-primary/5 active:bg-primary/10 text-text border border-transparent",
  text:
    "bg-transparent text-primary hover:text-primary-dark active:text-primary-dark border border-transparent",
};

const SIZE_CLASSES = {
  sm: "min-h-[44px] px-3 text-sm gap-1.5",
  md: "min-h-[44px] px-5 text-sm gap-2",
  lg: "min-h-[48px] px-6 text-base gap-2",
};

export default function Button({
  variant = "primary",
  size = "md",
  type = "button",
  loading = false,
  disabled = false,
  leadingIcon,
  trailingIcon,
  className = "",
  children,
  ...rest
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-label={loading ? "טוענת…" : undefined}
      className={[
        "inline-flex items-center justify-center rounded-full font-medium",
        "transition-colors duration-fast ease-quart focus-ring",
        "disabled:opacity-50 disabled:pointer-events-none",
        VARIANT_CLASSES[variant] || VARIANT_CLASSES.primary,
        SIZE_CLASSES[size] || SIZE_CLASSES.md,
        className,
      ].join(" ")}
      {...rest}
    >
      {loading ? (
        <CircleNotch size={18} weight="bold" className="animate-spin" aria-hidden="true" />
      ) : (
        leadingIcon && (
          <span className="inline-flex shrink-0" aria-hidden="true">
            {leadingIcon}
          </span>
        )
      )}
      {children}
      {!loading && trailingIcon && (
        <span className="inline-flex shrink-0" aria-hidden="true">
          {trailingIcon}
        </span>
      )}
    </button>
  );
}
