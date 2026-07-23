"use client";

/**
 * Module:   use-review-checklist
 * Purpose:  Session-local state for the pre-approval review checklist
 *           (MEH-1396): which pending producer's checklist is expanded, which
 *           items are ticked, and the soft approve-confirm gate. Wraps the real
 *           approve so an "אשר" click with unticked items opens a confirm
 *           dialog instead of firing straight through.
 * Touches:  nothing persistent — all state is React-only and resets on collapse
 *           / list reload. No API, no DB (Phase 1 constraint).
 * Does NOT: perform the approve request — that stays in use-admin-producers.js
 *           (`quickApprove`), passed in here as `approve`.
 * Related:  frontend/lib/admin-review-checklist.js,
 *           frontend/app/[locale]/admin/producers/page.js (composition).
 * History:  MEH-1396 (creation).
 */

import { useCallback, useState } from "react";
import { ADMIN_REVIEW_CHECKLIST } from "@/lib/admin-review-checklist";

const TOTAL_ITEMS = ADMIN_REVIEW_CHECKLIST.length;

export function useReviewChecklist(approve) {
  // Producer id whose checklist sub-row is expanded (single-open), or null.
  const [openId, setOpenId] = useState(null);
  // { [producerId]: Set<itemId> } — ticked items. Ephemeral, never persisted.
  const [checked, setChecked] = useState({});
  // Soft approve-confirm: { producer, count } while the warning dialog is open.
  const [approveConfirm, setApproveConfirm] = useState(null);

  // Drop a producer's ticks (used on collapse — "resets on close", Phase 1).
  const clearChecks = useCallback((producerId) => {
    setChecked((prev) => {
      if (!prev[producerId]) return prev;
      const next = { ...prev };
      delete next[producerId];
      return next;
    });
  }, []);

  // Expand/collapse a producer's checklist. Collapsing resets its ticks so the
  // next open starts clean.
  const toggleOpen = useCallback(
    (producerId) => {
      setOpenId((prev) => {
        if (prev === producerId) {
          clearChecks(producerId);
          return null;
        }
        return producerId;
      });
    },
    [clearChecks],
  );

  const toggleItem = useCallback((producerId, itemId) => {
    setChecked((prev) => {
      const set = new Set(prev[producerId] || []);
      if (set.has(itemId)) set.delete(itemId);
      else set.add(itemId);
      return { ...prev, [producerId]: set };
    });
  }, []);

  const uncheckedCount = useCallback(
    (producerId) => TOTAL_ITEMS - (checked[producerId]?.size || 0),
    [checked],
  );

  // Approve entry point wired to the row's "אשר" button. Any items left
  // unticked → open the soft confirm dialog; all ticked → approve straight
  // through (no extra dialog).
  const attemptApprove = useCallback(
    (producer) => {
      const remaining = uncheckedCount(producer.id);
      if (remaining > 0) setApproveConfirm({ producer, count: remaining });
      else approve(producer);
    },
    [approve, uncheckedCount],
  );

  const confirmApprove = useCallback(() => {
    setApproveConfirm((cur) => {
      if (cur) approve(cur.producer);
      return null;
    });
  }, [approve]);

  const cancelApprove = useCallback(() => setApproveConfirm(null), []);

  return {
    openId,
    toggleOpen,
    checked,
    toggleItem,
    uncheckedCount,
    approveConfirm,
    attemptApprove,
    confirmApprove,
    cancelApprove,
  };
}
