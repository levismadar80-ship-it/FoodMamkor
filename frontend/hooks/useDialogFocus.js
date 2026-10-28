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
 * or a group buy whose action row vanished once it was cancelled — since
 * focusing a detached node silently does nothing. That is the dialog's most
 * common exit, so the caller passes `fallback`: a function returning where
 * focus goes instead (an element that can take focus, e.g. tabIndex={-1}).
 * Without it focus would drop to <body>, the top of the page. The same holds
 * for a trigger that is disabled at close time. `fallback` is read from the
 * render that opened the dialog: a caller must close and reopen, not swap
 * what the dialog is about while it stays open.
 */
import { useEffect } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function useDialogFocus(ref, open, fallback) {
  useEffect(() => {
    if (!open) return undefined;
    const trigger = document.activeElement;
    const focusables = () => Array.from(ref.current?.querySelectorAll(FOCUSABLE) ?? []);
    const initial = ref.current?.querySelector("[data-autofocus]:not([disabled])") ?? focusables()[0];
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
      // A disabled trigger cannot take focus either (the duplicate-name
      // confirm starts the save, which disables the add form's submit).
      if (trigger instanceof HTMLElement && document.contains(trigger) && !trigger.disabled) {
        trigger.focus();
        return;
      }
      fallback?.()?.focus();
    };
    // fallback is read at close time only; leaving it out of the deps keeps an
    // inline arrow from re-running the trap (and re-focusing) on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, open]);
}
