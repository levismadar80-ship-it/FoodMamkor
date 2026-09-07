"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { computeMenuTop, MENU_GAP_PX } from "@/lib/panel-position";
import { DotsThreeVertical } from "@phosphor-icons/react";

/**
 * Module:   AdminRowMenu
 * Purpose:  Per-row kebab (overflow) menu for admin tables — moves rarely-used
 *           / destructive row actions out of the always-visible action strip.
 *           First consumer: admin users table, where privilege-escalation
 *           (promote/demote admin) is demoted from primary-inline to this menu
 *           while routine "block" stays inline (MEH-1023).
 * Does NOT: own any action logic — items pass their own onSelect (e.g. opening
 *           the caller's existing confirm dialog); does NOT trap focus — MEH-2267
 *           MOVES focus into the panel on open and returns it on Escape/Tab, but
 *           Tab still leaves the menu (APG menu-button), it is not a focus trap.
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
 *           close-on-scroll/resize — fixes overflow clipping on lower rows);
 *           MEH-2230 (viewport fit via lib/panel-position.js);
 *           MEH-2267 (APG keyboard: focus the first item on open, Arrow
 *           navigation with wrap, Tab closes and returns focus to the trigger)
 */

/**
 * @param {object} props
 * @param {Array<{key: string, label: string, onSelect: () => void, tone?: "default"|"danger", disabled?: boolean}>} props.items
 *   Menu entries. Empty array → the whole menu (kebab included) renders nothing.
 *   `disabled` mirrors an in-flight busy state — the item renders but can't fire.
 * @param {string} props.ariaLabel — accessible name for the kebab trigger.
 */
// MEH-2230: MENU_GAP_PX + the viewport-fit maths now live in
// lib/panel-position.js, shared with Popover, which already solved this.
// SSR-safe layout effect — mirrors the Popover idiom (Popover.jsx:59-60):
// this is a client component that Next still renders on the server, where
// useLayoutEffect warns. The measurement can only run in a browser anyway.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

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
    // First-paint placement: below the trigger. Corrected before paint by the
    // layout effect below, which is the only point the panel's height is known
    // (it is not rendered yet here). MEH-2230.
    top: rect.bottom + MENU_GAP_PX,
    insetInlineEnd: rtl ? rect.left : window.innerWidth - rect.right,
    triggerTop: rect.top,
    triggerBottom: rect.bottom,
  };
}

// MEH-2267 — the panel's own menuitems, in DOM order. Arrow navigation walks
// ALL of them, aria-disabled included: MEH-1027 Ch.B swapped native `disabled`
// for `aria-disabled` precisely so a busy item stays perceivable to keyboard
// and screen-reader users instead of being silently skipped.
function menuItemsOf(panelEl) {
  return Array.from(panelEl?.querySelectorAll('[role="menuitem"]') ?? []);
}

// Where each navigation key lands, given the current index (-1 when focus is
// not on an item) and the item count.
//
// A Map rather than an object literal, and the reason is worth recording
// because the obvious test for it does not work. A plain `KEYS[e.key]` lookup
// would resolve `toString` / `constructor` / `valueOf` off Object.prototype and
// call one of them as a mover. That hazard is NOT reachable here: React
// normalises `e.key` through a plain object of its own
// (`getEventKey` -> `normalizeKey[key] || key`), so a prototype-named key comes
// out of the synthetic event as a FUNCTION, not a string, and matches nothing.
// Measured 2026-09-06 with a stderr probe in this handler:
// `fireEvent.keyDown(menu, { key: "toString" })` arrives as
// `typeof e.key === "function"`.
//
// So the Map buys defence in depth against a future non-React caller, not a fix
// for a live bug — and there is deliberately no unit test asserting it, because
// no test can distinguish the two implementations through React. Writing one
// anyway is the `size="enormous"` trap in .claude/rules/testing.md; the first
// draft of this change carried exactly that test and it passed against a
// deliberate Map -> object swap.
const MENU_NAV = new Map([
  ["ArrowDown", (at, n) => (at === -1 ? 0 : (at + 1) % n)],
  ["ArrowUp", (at, n) => (at === -1 ? n - 1 : (at - 1 + n) % n)],
  ["Home", () => 0],
  ["End", (at, n) => n - 1],
]);

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

  // MEH-2230 — fit the panel to the viewport once its real height exists.
  // `measureCoords` runs in the toggle handler, before the panel is mounted, so
  // it cannot know the height and pinned `top` to the trigger's bottom edge
  // unconditionally. Measured at 375x812 on /admin/producers: the FIRST row's
  // panel already overflowed by 77px, the last row's by 1457px — and because
  // any scroll closes the menu (handleReflow above), there was no way to reach
  // it. Runs before paint, so the corrected position is the first one shown.
  useIsomorphicLayoutEffect(() => {
    if (!open || !coords || !menuRef.current) return;
    const height = menuRef.current.getBoundingClientRect().height;
    if (!height) return;
    const next = computeMenuTop(
      { top: coords.triggerTop, bottom: coords.triggerBottom },
      height,
      window.innerHeight,
    );
    // Guard the loop: only write when the position actually moves.
    if (Math.abs(next - coords.top) > 0.5) {
      setCoords((c) => (c ? { ...c, top: next } : c));
    }
  }, [open, coords]);

  // MEH-2267 — WAI-ARIA APG menu-button: opening the menu moves focus INTO it.
  // Before this, the panel was portaled to the end of <body> and nothing moved
  // focus, so from the open trigger a Tab landed on the next table row's
  // favourites button and the items were only reachable by tabbing through the
  // rest of the page. Measured on /admin/users at 1440 and Pixel 5.
  //
  // The initial target skips an aria-disabled item (a busy row action cannot be
  // chosen, so landing on it is a dead end), but falls back to the first item
  // when every item is disabled — losing focus to <body> would be worse than
  // landing somewhere inert.
  //
  // `preventScroll` is load-bearing, not hygiene: handleReflow above closes the
  // menu on ANY scroll (capture), so a focus() that scrolled its target into
  // view would close the menu it had just opened.
  useEffect(() => {
    if (!open) return;
    const all = menuItemsOf(menuRef.current);
    const target =
      all.find((el) => !el.hasAttribute("aria-disabled")) ?? all[0];
    target?.focus({ preventScroll: true });
  }, [open]);

  // Roving focus inside the open panel (APG). Escape is already handled by the
  // window listener above — it lives there because it must also fire while
  // focus sits on the trigger.
  const handleMenuKeyDown = (e) => {
    if (e.key === "Tab") {
      // APG: Tab moves out of the menu and closes it. The trigger is where the
      // user came from, so return focus there and let the NEXT Tab continue the
      // page order from a sane place.
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
      return;
    }
    const move = MENU_NAV.get(e.key);
    if (!move) return;
    const all = menuItemsOf(menuRef.current);
    if (all.length === 0) return;
    e.preventDefault();
    const next = move(all.indexOf(document.activeElement), all.length);
    all.at(next)?.focus({ preventScroll: true });
  };

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
      onKeyDown={handleMenuKeyDown}
      style={{
        position: "fixed",
        top: coords?.top,
        insetInlineEnd: coords?.insetInlineEnd,
      }}
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
            it.disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"
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
