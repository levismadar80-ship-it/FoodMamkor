// @ts-check
"use client";

import { useEffect, useRef } from "react";
import useDialogFocus, { useDialogEscape } from "@/hooks/useDialogFocus";

/**
 * Dialog — the one centred modal of the site (MEH-3096).
 *
 * Module:   Dialog
 * Purpose:  Overlay + panel + the modal contract in one place, so every
 *           confirm / form dialog looks and behaves the same: black/40 overlay,
 *           rounded-xl panel with shadow-xl, focus moves in and stays in
 *           (useDialogFocus), focus returns to the opener, Escape and a click
 *           on the overlay close it unless `dismissible` is false.
 * Does NOT: render a title, buttons or a close X — the caller owns its copy;
 *           pass the title's id as `labelledBy`. Bottom sheets, the lightbox,
 *           the filter sheet and popovers keep their own shells (different
 *           anatomy), and still meet the contract (DialogContractGuard).
 * Related:  hooks/useDialogFocus.js, __tests__/DialogContractGuard.test.js.
 * History:  MEH-3093 (the contract, per dialog); MEH-3096 (this shell —
 *           13/11/2026, 28 hand-built overlays before it).
 *
 * `fallbackFocus` returns the element to focus on close when the opener is
 * gone (e.g. its row was removed). The page behind does not scroll while open.
 *
 * Mark the safe button `data-autofocus` («ביטול»), so Enter never confirms a
 * destructive action by accident.
 *
 * @param {{
 *   open?: boolean,
 *   onClose: () => void,
 *   dismissible?: boolean,
 *   labelledBy?: string,
 *   label?: string,
 *   size?: "sm" | "md" | "lg",
 *   as?: "div" | "form",
 *   onSubmit?: (e: any) => void,
 *   className?: string,
 *   testId?: string,
 *   fallbackFocus?: () => HTMLElement | null | undefined,
 *   closeOnBackdrop?: boolean,
 *   children?: any,
 * }} props
 */
export default function Dialog({
  open = true,
  onClose,
  dismissible = true,
  labelledBy,
  label,
  size = "md",
  as = "div",
  onSubmit,
  className = "",
  testId,
  fallbackFocus,
  closeOnBackdrop = true,
  children,
}) {
  const ref = useRef(null);
  useDialogFocus(ref, open, fallbackFocus);
  useDialogEscape(open && dismissible, onClose);
  // The page behind a modal does not scroll (same as Radix / Headless UI).
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;

  const dismiss = () => {
    if (dismissible) onClose();
  };
  const Panel = as;
  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        // A dialog holding typed text passes closeOnBackdrop={false}: a stray
        // click (or a text-selection drag ending on the scrim) must not discard it.
        if (closeOnBackdrop && e.target === e.currentTarget) dismiss();
      }}
    >
      <Panel
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        data-testid={testId}
        onSubmit={onSubmit}
        className={`w-full ${SIZES[size] ?? SIZES.md} max-h-[90dvh] overflow-y-auto rounded-xl bg-surface p-6 text-start shadow-xl ${className}`.trim()}
      >
        {children}
      </Panel>
    </div>
  );
}

const SIZES = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg" };
