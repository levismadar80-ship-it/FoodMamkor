"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DotsThreeVertical } from "@phosphor-icons/react";

/**
 * Module:   AdminRowMenu
 * Purpose:  Per-row kebab (overflow) menu for admin tables — moves rarely-used
 *           / destructive row actions out of the always-visible action strip.
 *           First consumer: admin users table, where privilege-escalation
 *           (promote/demote admin) is demoted from primary-inline to this menu
 *           while routine "block" stays inline (MEH-1023).
 * Does NOT: own any action logic — items pass their own onSelect (e.g. opening
 *           the caller's existing confirm dialog); does NOT trap focus.
 *           MEH-1251: the open panel now PORTALS to document.body and positions
 *           `fixed` from the trigger rect — it no longer positions absolutely
 *           inside its own wrapper (that clipped under the admin tables'
 *           overflow-hidden/overflow-x-auto containers on lower rows).
 * Related:  components/ui/Popover.jsx (dismissal idiom mirrored) ·
 *           components/FilterSheet.jsx (portal-to-body precedent) ·
 *           app/[locale]/admin/users/page.js (first consumer) ·
 *           app/[locale]/admin/producers/AdminProducersTable.jsx (consumer) ·
 *           __tests__/AdminRowMenu.test.jsx
 * History:  MEH-1023 (creation — admin destructive-action safeguards, Chunk A);
 *           MEH-1027 (per-item disabled — producers-table busy guards;
 *           Ch.B: native disabled → aria-disabled + click-guard, APG);
 *           MEH-1251 (portal to body + fixed positioning from trigger rect;
 *           close-on-scroll/resize — fixes overflow clipping on lower rows)
 */

/**
 * @param {object} props
 * @param {Array<{key: string, label: string, onSelect: () => void, tone?: "default"|"danger", disabled?: boolean}>} props.items
 *   Menu entries. Empty array → the whole menu (kebab included) renders nothing.
 *   `disabled` mirrors an in-flight busy state — the item renders but can't fire.
 * @param {string} props.ariaLabel — accessible name for the kebab trigger.
 */
// Gap (px) between the trigger's bottom edge and the panel top — mirrors the
// pre-portal `mt-1` (0.25rem).
const MENU_GAP_PX = 4;

// Measure the trigger and pin the panel's inline-END edge to the trigger's
// inline-END edge (opening toward the start — same visual anchor as the old
// `end-0`), one row below it. Direction-aware so the logical `insetInlineEnd`
// value is measured from the correct viewport edge (RTL: from the left; LTR:
// from the right). Returns fixed-position coords for the portaled panel.
function measureCoords(triggerEl) {
  const rect = triggerEl?.getBoundingClientRect();
  if (!rect) return null;
  const rtl =
    document.documentElement.getAttribute("dir") === "rtl" ||
    getComputedStyle(document.documentElement).direction === "rtl";
  return {
    top: rect.bottom + MENU_GAP_PX,
    insetInlineEnd: rtl ? rect.left : window.innerWidth - rect.right,
  };
}

export default function AdminRowMenu({ items = [], ariaLabel }) {
  const [open, setOpen] = useState(false);
  // Fixed-position coords for the portaled panel, measured from the trigger
  // rect at open time (in the toggle handler, synchronously — so the panel's
  // first render is already positioned, no flash). `null` while closed.
  const [coords, setCoords] = useState(null);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  // Toggle: measure on open (the trigger is the only open path — button click,
  // incl. keyboard Enter/Space), clear on close.
  const handleToggle = () => {
    const next = !open;
    setCoords(next ? measureCoords(triggerRef.current) : null);
    setOpen(next);
  };

  // Esc + outside-click dismissal — document mousedown + window keydown.
  // REUSES: components/ui/Popover.jsx:56-73 — same contract. Esc returns
  // focus to the trigger; outside-click deliberately does not steal it back.
  // The panel is now portaled OUTSIDE wrapRef, so the outside-click test must
  // also exempt menuRef — otherwise a mousedown on a menuitem would read as
  // "outside" and close the menu before the item's click fires.
  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (e) => {
      if (
        !wrapRef.current?.contains(e.target) &&
        !menuRef.current?.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    // Close on scroll/resize — the panel is `fixed` from a one-time rect, so
    // any scroll (incl. the table's overflow-x-auto container, hence capture)
    // would drift it. Closing is the simplest correct behavior (per spec).
    const handleReflow = () => setOpen(false);
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleReflow, true);
    window.addEventListener("resize", handleReflow);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleReflow, true);
      window.removeEventListener("resize", handleReflow);
    };
  }, [open]);

  // Nothing to show (e.g. protected super-admin + self) → render nothing.
  if (items.length === 0) return null;

  const panel = (
    // Portaled to document.body + `fixed` positioning (coords) so the panel
    // escapes the admin tables' overflow-hidden/overflow-x-auto clipping on
    // lower rows. insetInlineEnd (logical) pins the panel end edge to the
    // trigger end edge — opening toward the start (right in RTL), matching the
    // pre-portal `end-0` anchor. z-[800] preserved from the token ledger.
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      style={{ position: "fixed", top: coords?.top, insetInlineEnd: coords?.insetInlineEnd }}
      className="z-[800] min-w-[10rem] bg-white border border-border rounded-md shadow-lg py-1 text-start"
    >
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          role="menuitem"
          // MEH-1027 Ch.B: aria-disabled + click-guard instead of native
          // disabled (WAI-ARIA APG) — a busy item stays focusable so
          // keyboard/screen-reader users perceive it instead of silently
          // skipping it. The guard sits BEFORE setOpen so the menu stays
          // open on a no-op click. Items without `disabled` (users page)
          // get no attribute — behavior identical to pre-Ch.B.
          aria-disabled={it.disabled || undefined}
          onClick={() => {
            if (it.disabled) return;
            setOpen(false);
            it.onSelect();
          }}
          className={`block w-full text-start px-3 py-2 text-sm transition ${
            it.disabled
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-gray-50"
          } ${
            it.tone === "danger"
              ? `text-red-600 ${it.disabled ? "" : "hover:bg-red-50"}`
              : "text-text"
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={handleToggle}
        className="inline-flex items-center justify-center rounded-lg p-1 text-muted hover:bg-gray-100 hover:text-text transition"
      >
        <DotsThreeVertical size={18} weight="bold" aria-hidden="true" />
      </button>
      {open && coords && createPortal(panel, document.body)}
    </div>
  );
}
