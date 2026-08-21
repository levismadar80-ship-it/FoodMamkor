"use client";

/**
 * Module:   use-review-checklist
 * Purpose:  State for the pre-approval review checklist. MEH-1399 Phase 2
 *           switched the source from a frozen constant to the API and made the
 *           ticks PERSIST per producer, with who and when.
 * Touches:  GET /admin/checklist-items (the list, active only) and
 *           GET/PUT /admin/producers/{id}/review-checks (the audit trail).
 * Does NOT: perform the approve request — that stays in use-admin-producers.js
 *           (`quickApprove`), passed in here as `approve`. And it does not gate
 *           approval: the confirm dialog is soft, exactly as in Phase 1.
 * Related:  ./AdminReviewChecklist.jsx (presentation),
 *           backend/app/routers/admin_checklist.py (the four endpoints),
 *           frontend/lib/admin-review-checklist.js (Phase 1 constant — now the
 *           migration's seed; only the title + confirm copy are still read).
 * History:  MEH-1396 (creation, static + session-local);
 *           MEH-1399 (items from API, ticks persisted).
 */

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";

export function useReviewChecklist(approve) {
  const [openId, setOpenId] = useState(null);
  // The active items, from the API. `null` = not loaded yet, which is NOT the
  // same as `[]` (an admin who deactivated everything) — the component renders
  // those two differently, so they must stay distinguishable.
  const [items, setItems] = useState(null);
  const [itemsError, setItemsError] = useState(false);
  // { [producerId]: Set<itemId> } — mirrors what the server has recorded.
  const [checked, setChecked] = useState({});
  const [approveConfirm, setApproveConfirm] = useState(null);
  // Producer ids with an in-flight save, so the row can show it is working and
  // a second click cannot race the first.
  const [saving, setSaving] = useState({});

  const loadItems = useCallback(() => {
    setItemsError(false);
    api
      // Active only. A retired item must never be offered to an admin working
      // a business — the settings screen is the one that asks for all of them.
      .get("/admin/checklist-items")
      .then((res) => setItems(res.data))
      .catch(() => {
        setItems([]);
        setItemsError(true);
      });
  }, []);

  useEffect(loadItems, [loadItems]);

  // Expanding loads that producer's recorded ticks. Phase 1 cleared state on
  // collapse because it was ephemeral; now collapsing must NOT clear anything —
  // the ticks are server state, and dropping them locally would make a reopen
  // look like the checks never happened until the refetch lands.
  const toggleOpen = useCallback((producerId) => {
    setOpenId((prev) => {
      if (prev === producerId) return null;
      api
        .get(`/admin/producers/${producerId}/review-checks`)
        .then((res) =>
          setChecked((cur) => ({
            ...cur,
            [producerId]: new Set(res.data.checks.map((c) => c.item_id)),
          })),
        )
        .catch(() => {
          /* leave whatever is already known; the row still renders */
        });
      return producerId;
    });
  }, []);

  const toggleItem = useCallback(
    (producerId, itemId) => {
      // Optimistic: compute the next set, render it, then persist. The server
      // is the authority and its response replaces this, but an admin ticking
      // seven boxes should not wait for seven round-trips.
      const current = checked[producerId] || new Set();
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);

      setChecked((cur) => ({ ...cur, [producerId]: next }));
      setSaving((cur) => ({ ...cur, [producerId]: true }));

      api
        .put(`/admin/producers/${producerId}/review-checks`, {
          item_ids: [...next],
        })
        .then((res) =>
          setChecked((cur) => ({
            ...cur,
            [producerId]: new Set(res.data.checks.map((c) => c.item_id)),
          })),
        )
        .catch(() =>
          // Roll back to what the server last agreed to. Leaving the optimistic
          // tick on a failed save is the dangerous direction: the admin would
          // believe a check was recorded when nothing was written.
          setChecked((cur) => ({ ...cur, [producerId]: current })),
        )
        .finally(() =>
          setSaving((cur) => ({ ...cur, [producerId]: false })),
        );
    },
    [checked],
  );

  const totalItems = items?.length ?? 0;

  const uncheckedCount = useCallback(
    (producerId) => totalItems - (checked[producerId]?.size || 0),
    [checked, totalItems],
  );

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
    items,
    itemsError,
    reloadItems: loadItems,
    checked,
    toggleItem,
    saving,
    uncheckedCount,
    approveConfirm,
    attemptApprove,
    confirmApprove,
    cancelApprove,
  };
}
