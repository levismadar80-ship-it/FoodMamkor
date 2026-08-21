"use client";

/**
 * AdminReviewChecklist — the pre-approval review checklist for a pending
 * producer, rendered as a sub-row in AdminProducersTable.
 *
 * MEH-1396 (Phase 1) shipped this against a frozen constant with session-local
 * ticks. MEH-1399 (Phase 2) swapped the source for the API and made the ticks
 * persist; this file stays presentational — all state is in
 * use-review-checklist.js.
 *
 * Still a SOFT aid: ticks never gate the approve request. The hard gates
 * (photo 422 / licence 422) are server-side and untouched.
 *
 * The 5-state rule (CLAUDE.md) applies to the item list as a matrix, not two
 * lists — (0 items / 1 / many) × (closed / open). The closed states are the
 * counter in the header; the open ones are below. `items === null` (loading) is
 * deliberately distinct from `items === []` (an admin deactivated everything):
 * collapsing them would show "no items" during every load.
 */

import { CaretDown, CaretRight, ClipboardText } from "@phosphor-icons/react";
import { ADMIN_REVIEW_CHECKLIST_TITLE } from "@/lib/admin-review-checklist";
import ReviewEvidence from "./ReviewEvidence";

const CARET_SIZE = 16;
const HEADER_ICON_SIZE = 18;
const EMPTY_SET = new Set();

export default function AdminReviewChecklist({
  open,
  onToggleOpen,
  checkedIds,
  onToggleItem,
  items,
  itemsError,
  onReloadItems,
  saving,
  producer,
}) {
  const checked = checkedIds || EMPTY_SET;
  const list = items || [];
  const doneCount = list.filter((item) => checked.has(item.id)).length;
  const Caret = open ? CaretDown : CaretRight;
  const loading = items === null;
  // A producer's recorded ticks are fetched when its row is EXPANDED, so before
  // that `checkedIds` is undefined — which is not the same as "nothing ticked".
  // Rendering the difference matters because the counter is the closed state's
  // only signal: a confident `0/7` on a business somebody already reviewed is
  // exactly the shape this repo keeps getting caught by — an answer that is an
  // artifact of what the query could not see. `?` says "open it and I will
  // tell you", which is true.
  const ticksKnown = checkedIds !== undefined;

  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline"
      >
        <Caret size={CARET_SIZE} weight="bold" aria-hidden="true" />
        <ClipboardText size={HEADER_ICON_SIZE} aria-hidden="true" />
        <span>{ADMIN_REVIEW_CHECKLIST_TITLE}</span>
        {/* The counter is the CLOSED state's only signal, so it has to be
            honest while loading rather than reading a confident 0/0. */}
        <span className="text-muted tabular-nums">
          {loading
            ? "(…)"
            : ticksKnown
              ? `(${doneCount}/${list.length})`
              : `(?/${list.length})`}
        </span>
        {saving && <span className="text-[11px] text-muted">שומרת…</span>}
      </button>

      {open && (
        <>
          {loading && <p className="mt-2 text-xs text-muted">טוענת…</p>}

          {itemsError && (
            <p className="mt-2 text-xs text-error">
              טעינת הרשימה נכשלה.{" "}
              <button
                type="button"
                onClick={onReloadItems}
                className="underline"
              >
                נסי שוב
              </button>
            </p>
          )}

          {/* Distinct from the loading state above: this is a real, loaded,
              empty list — every item was deactivated in settings. Saying so
              beats rendering nothing, which reads as a broken component. */}
          {!loading && !itemsError && list.length === 0 && (
            <p className="mt-2 text-xs text-muted">
              אין סעיפים פעילים. אפשר להוסיף בהגדרות.
            </p>
          )}

          {list.length > 0 && (
            <ul className="mt-2 space-y-2 max-w-xl">
              {list.map((item) => {
                const isChecked = checked.has(item.id);
                return (
                  <li key={item.id}>
                    {/* label wraps the input → no id needed, a11y intact */}
                    <label className="flex items-start gap-2 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggleItem(item.id)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                      />
                      <span className="flex flex-col">
                        <span
                          className={
                            isChecked ? "text-muted line-through" : "text-text"
                          }
                        >
                          {item.label}
                        </span>
                        {item.hint && (
                          <span className="text-[11px] text-muted">
                            {item.hint}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          <ReviewEvidence producer={producer} />
        </>
      )}
    </div>
  );
}
