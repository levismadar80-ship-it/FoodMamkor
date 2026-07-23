"use client";

import { cloneElement, useEffect, useId, useRef, useState } from "react";

/**
 * Module:   Popover
 * Purpose:  Click/tap-opened rich-content popover primitive — the "press for
 *           more" sibling of ui/Tooltip (which stays hover/focus + string-only).
 *           Built per the MEH-800 locked API plan to absorb BadgeRow's inline
 *           click-popover without redesigning Tooltip. MEH-1334 chunk 3 adds an
 *           OPT-IN mobile bottom-sheet presentation (`sheetOnMobile`) with a
 *           focus trap + backdrop, per the approved a11y spec (revision-2 #10).
 * Does NOT: hover-open, portal/float on desktop (positions absolutely inside
 *           its own wrapper, exactly like the BadgeRow popover it replaces),
 *           or trap focus in the default anchored mode (content is reachable,
 *           not a modal). Consumers that don't pass sheetOnMobile are
 *           byte-identical to pre-1334.
 * Related:  components/ui/Tooltip.jsx (hover primitive, untouched) ·
 *           components/BadgeRow.jsx (first consumer; hero seal opts into the
 *           sheet) · __tests__/Popover.test.jsx
 * History:  MEH-800 (creation — MEH-792 deferred half / tooltip-unify ch. 2);
 *           MEH-1334 chunk 3 (mobile bottom-sheet + focus trap).
 */

// Placement is logical (start-anchored) so it flips correctly in RTL.
const PLACEMENT_CLASSES = {
  bottom: "top-full mt-2 start-0",
  top: "bottom-full mb-2 start-0",
};

/**
 * @param {object} props
 * @param {import("react").ReactElement} props.trigger — a single native
 *   element (or forwardRef component); receives onClick toggle,
 *   aria-haspopup, aria-expanded, and an id (kept if it already has one).
 *   Its own onClick, if any, still runs first.
 * @param {import("react").ReactNode} props.children — rich content.
 * @param {"top"|"bottom"} [props.placement="bottom"]
 * @param {"tooltip"|"dialog"} [props.role="tooltip"] — per content kind.
 * @param {boolean} [props.sheetOnMobile=false] — below lg, present as a fixed
 *   bottom sheet with backdrop + focus trap (MEH-1334). Desktop unchanged.
 * @param {string} [props.contentClassName] — width/extras on the ANCHORED
 *   panel only (widths like w-64 would fight the sheet's inset-x-0 stretch).
 * @param {string} [props.sheetContentClassName] — layout extras for the sheet
 *   presentation (no widths).
 * @param {string} [props.contentTestId] — data-testid passthrough.
 */
export default function Popover({
  trigger,
  children,
  placement = "bottom",
  role = "tooltip",
  sheetOnMobile = false,
  contentClassName = "",
  sheetContentClassName = "",
  contentTestId,
}) {
  const [open, setOpen] = useState(false);
  // Sheet presentation is decided ONCE per open (matchMedia at tap time) so
  // the panel doesn't jump between modes on resize while open.
  const [sheetActive, setSheetActive] = useState(false);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const autoId = useId();
  const triggerId = trigger.props?.id ?? `${autoId}-trigger`;

  // Esc + outside-click dismissal — document mousedown + window keydown,
  // the exact contract BadgeRow's tests assert. Esc returns focus to the
  // trigger; outside-click deliberately does NOT steal focus back (the
  // user clicked elsewhere on purpose).
  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const handleKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      // MEH-1334: focus trap — sheet mode only (the sheet is modal-like; the
      // anchored popover stays a non-modal disclosure). Same Tab-loop idiom
      // as LoginPromptModal.
      if (!sheetActive || e.key !== "Tab") return;
      const focusables = panelRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables?.length) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open, sheetActive]);

  // Sheet mode: move focus INTO the sheet on open so the trap has a subject;
  // Esc (above) returns it to the trigger.
  useEffect(() => {
    if (open && sheetActive) panelRef.current?.focus?.();
  }, [open, sheetActive]);

  const triggerEl = cloneElement(trigger, {
    ref: triggerRef,
    id: triggerId,
    onClick: (e) => {
      // Built-in card-Link safety (S12 §03 "first tap shows, never
      // navigates"): the trigger is interactive in its own right — never
      // let the tap bubble into a wrapping Link/card handler.
      e.stopPropagation();
      e.preventDefault();
      trigger.props?.onClick?.(e);
      // Presentation decided at tap time, OUTSIDE the state updater —
      // updaters must stay pure (adversarial-review fix; StrictMode
      // double-invokes them).
      const next = !open;
      if (next) {
        setSheetActive(
          sheetOnMobile &&
            typeof window !== "undefined" &&
            window.matchMedia("(max-width: 1023px)").matches,
        );
      }
      setOpen(next);
    },
    "aria-haspopup": role === "dialog" ? "dialog" : "true",
    "aria-expanded": open,
  });

  return (
    <span ref={wrapRef} className="relative inline-block">
      {triggerEl}
      {open && sheetActive && (
        // Backdrop — rendered INSIDE wrapRef, so the outside-click document
        // listener treats it as "inside" and won't fire; it closes via its
        // own onClick instead. z per the app ledger: sheet family above the
        // global header (1050), below Toaster (2000) — matches FilterSheet.
        <span
          aria-hidden="true"
          data-testid={contentTestId ? `${contentTestId}-backdrop` : undefined}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[1200] bg-black/40"
        />
      )}
      {open && (
        <span
          ref={panelRef}
          role={sheetActive ? "dialog" : role}
          aria-modal={sheetActive ? "true" : undefined}
          aria-labelledby={triggerId}
          tabIndex={sheetActive ? -1 : undefined}
          data-testid={contentTestId}
          className={
            sheetActive
              ? `fixed inset-x-0 bottom-0 z-[1210] block rounded-t-2xl border-t border-border bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-2xl text-sm text-text leading-relaxed text-start ${sheetContentClassName}`
              : `absolute ${PLACEMENT_CLASSES[placement] ?? PLACEMENT_CLASSES.bottom} z-[800] bg-white border border-border rounded-md shadow-lg p-3 text-xs text-text leading-relaxed text-start ${contentClassName}`
          }
        >
          {children}
        </span>
      )}
    </span>
  );
}
