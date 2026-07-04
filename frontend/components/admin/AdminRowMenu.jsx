"use client";

import { useEffect, useId, useRef, useState } from "react";
import { DotsThreeVertical } from "@phosphor-icons/react";

/**
 * Module:   AdminRowMenu
 * Purpose:  Per-row kebab (overflow) menu for admin tables — moves rarely-used
 *           / destructive row actions out of the always-visible action strip.
 *           First consumer: admin users table, where privilege-escalation
 *           (promote/demote admin) is demoted from primary-inline to this menu
 *           while routine "block" stays inline (MEH-1023).
 * Does NOT: own any action logic — items pass their own onSelect (e.g. opening
 *           the caller's existing confirm dialog); does NOT portal/float
 *           (positions absolutely inside its own wrapper) or trap focus.
 * Related:  components/ui/Popover.jsx (dismissal idiom mirrored) ·
 *           app/[locale]/admin/users/page.js (first consumer) ·
 *           __tests__/AdminRowMenu.test.jsx
 * History:  MEH-1023 (creation — admin destructive-action safeguards, Chunk A)
 */

/**
 * @param {object} props
 * @param {Array<{key: string, label: string, onSelect: () => void, tone?: "default"|"danger"}>} props.items
 *   Menu entries. Empty array → the whole menu (kebab included) renders nothing.
 * @param {string} props.ariaLabel — accessible name for the kebab trigger.
 */
export default function AdminRowMenu({ items = [], ariaLabel }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const menuId = useId();

  // Esc + outside-click dismissal — document mousedown + window keydown.
  // REUSES: components/ui/Popover.jsx:56-73 — same contract. Esc returns
  // focus to the trigger; outside-click deliberately does not steal it back.
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

  // Nothing to show (e.g. protected super-admin + self) → render nothing.
  if (items.length === 0) return null;

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center rounded-lg p-1 text-muted hover:bg-gray-100 hover:text-text transition"
      >
        <DotsThreeVertical size={18} weight="bold" aria-hidden="true" />
      </button>
      {open && (
        // Anchored end-0: pins the panel's end edge (left in RTL) to the cell
        // end, so the menu opens toward the start (right in RTL). rtl-ok — end-0
        // is a logical property, direction-correct.
        <div
          id={menuId}
          role="menu"
          className="absolute end-0 top-full mt-1 z-[800] min-w-[10rem] bg-white border border-border rounded-md shadow-lg py-1 text-start"
        >
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className={`block w-full text-start px-3 py-2 text-sm transition hover:bg-gray-50 ${
                it.tone === "danger" ? "text-red-600 hover:bg-red-50" : "text-text"
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
