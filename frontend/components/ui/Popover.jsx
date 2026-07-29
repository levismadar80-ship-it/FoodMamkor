"use client";

import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/**
 * Module:   Popover
 * Purpose:  Click/tap-opened rich-content popover primitive — the "press for
 *           more" sibling of ui/Tooltip (which stays hover/focus + string-only).
 *           Built per the MEH-800 locked API plan to absorb BadgeRow's inline
 *           click-popover without redesigning Tooltip. MEH-1334 chunk 3 adds an
 *           OPT-IN mobile bottom-sheet presentation (`sheetOnMobile`) with a
 *           focus trap + backdrop, per the approved a11y spec (revision-2 #10).
 *           MEH-1592 adds a second OPT-IN presentation (`overlay`) — a
 *           body-portalled, viewport-positioned panel that clears a caller-
 *           supplied boundary element instead of opening into the flow.
 * Does NOT: hover-open, portal/float on desktop BY DEFAULT (without `overlay`
 *           it positions absolutely inside its own wrapper, exactly like the
 *           BadgeRow popover it replaces), or trap focus in the default
 *           anchored mode (content is reachable, not a modal). Consumers that
 *           pass neither sheetOnMobile nor overlay are byte-identical to
 *           pre-1334.
 * Related:  components/ui/Tooltip.jsx (hover primitive, untouched) ·
 *           components/BadgeRow.jsx (first consumer; hero seal opts into the
 *           sheet) · components/ProducerCard.jsx (the +N overflow chip; the
 *           only `overlay` consumer) · __tests__/Popover.test.jsx
 * History:  MEH-800 (creation — MEH-792 deferred half / tooltip-unify ch. 2);
 *           MEH-1334 chunk 3 (mobile bottom-sheet + focus trap);
 *           MEH-1547 (ProducerCard +N becomes a Popover trigger);
 *           MEH-1592 (overlay mode — the +N panel collided with sibling
 *           badge pills + the card title, see below).
 */

// MEH-1592: overlay-mode geometry. GAP = distance between the panel and the
// boundary it clears; PAD = minimum distance from any viewport edge (the
// "shift" budget of the flip/shift pair).
const OVERLAY_GAP = 8;
const OVERLAY_PAD = 8;

// `max` is floored at `min` so a panel larger than the viewport degrades to
// "pinned at the near edge" instead of inverting the clamp.
const clamp = (min, value, max) => Math.min(Math.max(value, min), Math.max(min, max));

// ProducerCard IS server-rendered on /producers (page.jsx SSR-seeds page 1), so
// this component renders on the server — where useLayoutEffect logs a React
// warning on every card. The overlay measurement needs real layout and can only
// run in the browser, so the server gets the (never-invoked) useEffect instead.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

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
 * @param {boolean} [props.overlay=false] — MEH-1592. Render the ANCHORED panel
 *   in an overlay layer (portal → document.body, `position: fixed`) positioned
 *   against the viewport instead of absolutely inside the wrapper. Use when the
 *   default in-flow panel would overlap siblings or be clipped by an ancestor's
 *   `overflow-hidden`. No effect in sheet mode (the sheet is already fixed).
 * @param {import("react").RefObject<HTMLElement>} [props.avoidRef] — overlay
 *   mode only. The panel is placed so it fully clears THIS element's box
 *   (above it, flipping below when there is no room). Defaults to the trigger,
 *   which only clears the trigger itself — pass the row/container when the
 *   siblings inside it must be cleared too.
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
  overlay = false,
  avoidRef = null,
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

  // MEH-1592 — overlay placement. `null` until measured so the panel never
  // paints at 0,0 for a frame before it is positioned (it renders hidden).
  const [pos, setPos] = useState(null);
  const overlayActive = open && overlay && !sheetActive;

  const reposition = useCallback(() => {
    const triggerEl = triggerRef.current;
    const panelEl = panelRef.current;
    if (!triggerEl || !panelEl) return;

    const t = triggerEl.getBoundingClientRect();
    // The box the panel must clear. Defaults to the trigger; ProducerCard
    // passes the whole badge strip so WRAPPED siblings are cleared too —
    // clearing only the trigger leaves a second-line pill in the panel's path.
    const boundary = avoidRef?.current?.getBoundingClientRect() ?? t;
    const panelRect = panelEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // FLIP — prefer above the boundary (on a card the strip sits at the photo's
    // bottom edge, so "above" is open photo space and everything that could
    // collide is below). Fall back to below it when there is no room.
    let top = boundary.top - OVERLAY_GAP - panelRect.height;
    if (top < OVERLAY_PAD) top = boundary.bottom + OVERLAY_GAP;
    top = clamp(OVERLAY_PAD, top, vh - panelRect.height - OVERLAY_PAD);

    // SHIFT — align the panel's inline-start edge to the trigger's, then clamp
    // into the viewport. Logical throughout: `inset-inline-start` measures from
    // the RIGHT edge under RTL, so the offset is derived per direction rather
    // than with a physical left/right (.claude/rules/rtl.md).
    //
    // Direction MUST be read from the PANEL, not the trigger: `insetInlineStart`
    // resolves against the panel's containing block, which after portalling is
    // <body> (dir="rtl"). The +N trigger carries its own dir="ltr" so the "+2"
    // numeral renders LTR (ProducerCard.jsx) — reading direction there returned
    // "ltr" and mirrored the panel to the far edge (measured 982px from its own
    // trigger at 1440px, while still passing the 0-intersection assertions).
    const rtl = getComputedStyle(panelEl).direction === "rtl";
    const rawStart = rtl ? vw - t.right : t.left;
    const start = clamp(
      OVERLAY_PAD,
      rawStart,
      vw - panelRect.width - OVERLAY_PAD,
    );

    setPos({ top, start });
  }, [avoidRef]);

  // Measure AFTER the panel is in the DOM but BEFORE paint.
  useIsomorphicLayoutEffect(() => {
    if (!overlayActive) {
      setPos(null);
      return undefined;
    }
    reposition();
    // `scroll` in capture phase catches scrolling ancestors, not just window.
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [overlayActive, reposition]);

  // Esc + outside-click dismissal — document mousedown + window keydown,
  // the exact contract BadgeRow's tests assert. Esc returns focus to the
  // trigger; outside-click deliberately does NOT steal focus back (the
  // user clicked elsewhere on purpose).
  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (e) => {
      // MEH-1592: in overlay mode the panel is portalled to <body>, so it is no
      // longer a descendant of wrapRef — without the second check a click on
      // the disclosed content would read as "outside" and close the panel.
      if (wrapRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
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

  const panel = open && (
    <span
      ref={panelRef}
      role={sheetActive ? "dialog" : role}
      aria-modal={sheetActive ? "true" : undefined}
      aria-labelledby={triggerId}
      tabIndex={sheetActive ? -1 : undefined}
      data-testid={contentTestId}
      // MEH-1592: overlay coordinates are measured viewport values, so they are
      // applied inline rather than as classes. `insetInlineStart` keeps the
      // horizontal axis logical (RTL-correct) — no physical left/right.
      style={
        overlayActive
          ? {
              top: pos ? `${pos.top}px` : 0,
              insetInlineStart: pos ? `${pos.start}px` : 0,
              visibility: pos ? "visible" : "hidden",
            }
          : undefined
      }
      className={
        sheetActive
          ? `fixed inset-x-0 bottom-0 z-[1210] block rounded-t-2xl border-t border-border bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-2xl text-sm text-text leading-relaxed text-start ${sheetContentClassName}`
          : overlayActive
            ? // Same visual as the anchored panel; `fixed` + measured offsets
              // replace `absolute` + the placement classes. z unchanged at 800
              // (rtl.md ledger) — portalling to <body> already lifts it out of
              // the card's overflow-hidden and its stacking context.
              `fixed z-[800] block bg-white border border-border rounded-md shadow-lg p-3 text-xs text-text leading-relaxed text-start ${contentClassName}`
            : `absolute ${PLACEMENT_CLASSES[placement] ?? PLACEMENT_CLASSES.bottom} z-[800] bg-white border border-border rounded-md shadow-lg p-3 text-xs text-text leading-relaxed text-start ${contentClassName}`
      }
    >
      {children}
    </span>
  );

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
      {/* MEH-1592: overlay mode portals the panel to <body> so no ancestor's
          `overflow-hidden` can clip it and no ancestor stacking context can
          trap it. Every other mode keeps the panel in place — unchanged. */}
      {overlayActive && typeof document !== "undefined"
        ? createPortal(panel, document.body)
        : panel}
    </span>
  );
}
