"use client";

/**
 * AdminReviewChecklist — collapsible pre-approval review checklist for a pending
 * producer (MEH-1396, Phase 1). Presentational only: all state lives in
 * use-review-checklist.js. Rendered as a sub-row in AdminProducersTable next to
 * the pending photo strip. Soft aid — ticks never gate the approve request.
 */

import { CaretDown, CaretRight, ClipboardText } from "@phosphor-icons/react";
import {
  ADMIN_REVIEW_CHECKLIST,
  ADMIN_REVIEW_CHECKLIST_TITLE,
} from "@/lib/admin-review-checklist";

const CARET_SIZE = 16;
const HEADER_ICON_SIZE = 18;
// Stable empty set so an un-touched producer doesn't allocate on every render.
const EMPTY_SET = new Set();

export default function AdminReviewChecklist({
  open,
  onToggleOpen,
  checkedIds,
  onToggleItem,
}) {
  const checked = checkedIds || EMPTY_SET;
  const doneCount = ADMIN_REVIEW_CHECKLIST.filter((item) =>
    checked.has(item.id),
  ).length;
  const Caret = open ? CaretDown : CaretRight;

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
        <span className="text-muted tabular-nums">
          ({doneCount}/{ADMIN_REVIEW_CHECKLIST.length})
        </span>
      </button>

      {open && (
        <ul className="mt-2 space-y-2 max-w-xl">
          {ADMIN_REVIEW_CHECKLIST.map((item) => {
            const isChecked = checked.has(item.id);
            return (
              <li key={item.id}>
                {/* label wraps the input → no id needed, keeps a11y intact */}
                <label className="flex items-start gap-2 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggleItem(item.id)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span className="flex flex-col">
                    <span className={isChecked ? "text-muted line-through" : "text-text"}>
                      {item.label}
                    </span>
                    {item.hint && (
                      <span className="text-[11px] text-muted">{item.hint}</span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
