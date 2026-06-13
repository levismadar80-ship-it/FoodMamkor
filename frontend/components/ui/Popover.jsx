"use client";

import { cloneElement, useEffect, useId, useRef, useState } from "react";

/**
 * Module:   Popover
 * Purpose:  Click/tap-opened rich-content popover primitive — the "press for
 *           more" sibling of ui/Tooltip (which stays hover/focus + string-only).
 *           Built per the MEH-800 locked API plan to absorb BadgeRow's inline
 *           click-popover without redesigning Tooltip.
 * Does NOT: hover-open, portal/float (positions absolutely inside its own
 *           wrapper, exactly like the BadgeRow popover it replaces), trap
 *           focus (content is reachable, not a modal).
 * Related:  components/ui/Tooltip.jsx (hover primitive, untouched) ·
 *           components/BadgeRow.jsx (first consumer) ·
 *           __tests__/Popover.test.jsx
 * History:  MEH-800 (creation — MEH-792 deferred half / tooltip-unify ch. 2)
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
 * @param {string} [props.contentClassName] — width/extras on the panel.
 * @param {string} [props.contentTestId] — data-testid passthrough.
 */
export default function Popover({
  trigger,
  children,
  placement = "bottom",
  role = "tooltip",
  contentClassName = "",
  contentTestId,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
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
      }
    };
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

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
      setOpen((v) => !v);
    },
    "aria-haspopup": role === "dialog" ? "dialog" : "true",
    "aria-expanded": open,
  });

  return (
    <span ref={wrapRef} className="relative inline-block">
      {triggerEl}
      {open && (
        <span
          role={role}
          aria-labelledby={triggerId}
          data-testid={contentTestId}
          className={`absolute ${PLACEMENT_CLASSES[placement] ?? PLACEMENT_CLASSES.bottom} z-[800] bg-white border border-border rounded-md shadow-lg p-3 text-xs text-text leading-relaxed text-start ${contentClassName}`}
        >
          {children}
        </span>
      )}
    </span>
  );
}
