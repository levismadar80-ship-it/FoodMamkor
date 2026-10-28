/**
 * Module:   useDialogFocus
 * Purpose:  The focus half of a modal dialog's contract, in one place: focus
 *           moves into the dialog when it opens, Tab and Shift+Tab stay inside
 *           it, and focus returns to whatever opened it when it closes.
 * Does NOT: render anything, handle Escape, or decide when the dialog is open.
 *           Each caller keeps its own Escape rule, because they differ (some
 *           dialogs ignore Escape while a request is in flight).
 * Related:  app/[locale]/group-buys/[id]/GroupBuyDetailClient.jsx (MEH-2199,
 *           the inline version this follows), components/FilterSheet.jsx.
 * History:  MEH-2491 — the owner dashboard's confirm dialogs (group-buy
 *           actions, product delete, duplicate name) declared aria-modal and
 *           delivered no trap and no focus return.
 *
 * INITIAL FOCUS
 * -------------
 * The element marked `data-autofocus` inside the dialog, else its first
 * focusable. Mark the safe choice («חזרה» / «ביטול»), so Enter never confirms
 * a destructive action by accident. Do NOT use React's `autoFocus` with this
 * hook: it fires during commit, before this effect, so the element read as
 * "what opened the dialog" would be the dialog's own button.
 *
 * FOCUS RETURN
 * ------------
 * Rides the effect cleanup, so every way of closing (Escape, a button, the
 * dialog unmounting) restores focus by construction. `document.contains`
 * guards the trigger having left the page meanwhile — a deleted product's row,
 * say — since focusing a detached node silently does nothing.
 */
import { useEffect } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function useDialogFocus(ref, open) {
  useEffect(() => {
    if (!open) return undefined;
    const trigger = document.activeElement;
    const focusables = () => Array.from(ref.current?.querySelectorAll(FOCUSABLE) ?? []);
    const initial = ref.current?.querySelector("[data-autofocus]") ?? focusables()[0];
    initial?.focus();

    const onKey = (e) => {
      if (e.key !== "Tab") return;
      const els = focusables();
      if (!els.length) {
        e.preventDefault();
        return;
      }
      const first = els[0];
      const last = els.at(-1);
      const inside = ref.current?.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (trigger instanceof HTMLElement && document.contains(trigger)) {
        trigger.focus();
      }
    };
  }, [ref, open]);
}
