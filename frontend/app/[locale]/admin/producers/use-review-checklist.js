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
 *           MEH-1399 (items from API, ticks persisted);
 *           MEH-2175 (soft confirm fails closed when the list is unknown;
 *           state updaters made pure).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";

export function useReviewChecklist(approve) {
  const [openId, setOpenId] = useState(null);
  // Mirrors `openId` so `toggleOpen` can read the CURRENT value without a
  // state updater. See the note on `toggleOpen` for why the state value is
  // not good enough there.
  const openIdRef = useRef(null);
  // The active items, from the API. `null` = not loaded yet, which is NOT the
  // same as `[]` (an admin who deactivated everything) — the component renders
  // those two differently, so they must stay distinguishable.
  const [items, setItems] = useState(null);
  const [itemsError, setItemsError] = useState(false);
  // MEH-2175: whether the list is KNOWN, tracked as its own fact rather than
  // inferred from a count. `items` collapses three worlds into one falsy
  // length — not fetched yet, fetch failed, and an admin genuinely deactivated
  // everything — and only the third is a real "nothing left to check".
  const [itemsLoaded, setItemsLoaded] = useState(false);
  // { [producerId]: Set<itemId> } — mirrors what the server has recorded.
  const [checked, setChecked] = useState({});
  const [approveConfirm, setApproveConfirm] = useState(null);
  // Producer ids with an in-flight save, so the row can show it is working.
  //
  // MEH-2175: this used to add "and a second click cannot race the first",
  // which the code does not deliver — the checkbox has no `disabled`, so a
  // second click lands. The COMMENT is what changed, deliberately, and not the
  // markup: `toggleItem` is optimistic on purpose (see its note below), so
  // disabling the box while a save is in flight would make an admin ticking
  // seven items wait out seven round-trips — the exact cost that design
  // avoids. A redundant second click re-sends the same set and the server's
  // response is authoritative either way, so there is nothing to race.
  const [saving, setSaving] = useState({});

  const loadItems = useCallback(() => {
    setItemsError(false);
    setItemsLoaded(false);
    api
      // Active only. A retired item must never be offered to an admin working
      // a business — the settings screen is the one that asks for all of them.
      .get("/admin/checklist-items")
      .then((res) => {
        setItems(res.data);
        setItemsLoaded(true);
      })
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
  //
  // MEH-2175: the fetch used to sit INSIDE the `setOpenId` updater. A state
  // updater must be pure — React may call it more than once for a single
  // event, and StrictMode does exactly that in development, so every expand
  // issued two identical GETs.
  //
  // The decision reads a REF rather than the `openId` state, and that is the
  // load-bearing detail rather than a style choice. The obvious rewrite —
  // `if (openId === producerId)` over the state value — reintroduces the bug
  // it is meant to fix, in the opposite direction: two clicks batched into one
  // React tick both close over the SAME stale `openId`, so both take the open
  // branch and fire a request each. The functional updater the old code used
  // got that case right (its `prev` was current) and paid for it by having to
  // host the side effect. A ref is current AND writable outside the updater,
  // so it gives both: one request per expand under any number of updater
  // invocations, and correct collapse on a double click.
  const toggleOpen = useCallback((producerId) => {
    const isOpen = openIdRef.current === producerId;
    openIdRef.current = isOpen ? null : producerId;
    setOpenId(openIdRef.current);
    if (isOpen) return;
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

  // MEH-2175: `remaining <= 0` had TWO causes and the code read only one of
  // them. When the item fetch fails, `items` becomes `[]`, so `totalItems` is
  // 0, so `remaining` is 0 — indistinguishable from "the admin ticked
  // everything", and the soft confirm was skipped entirely. A green with two
  // possible causes is not a signal, and this one leaned the unsafe way: the
  // one moment the admin knows least about the business is the moment the
  // dialog stopped appearing.
  //
  // So it fails CLOSED. Unknown means confirm, and `count: null` says the
  // count is unavailable rather than reporting a fabricated zero — the dialog
  // copy branches on it. The HARD gates (photo/licence 422 in admin.py) are
  // untouched and were never affected; this is the soft aid, restored.
  const attemptApprove = useCallback(
    (producer) => {
      if (!itemsLoaded) {
        setApproveConfirm({ producer, count: null });
        return;
      }
      const remaining = uncheckedCount(producer.id);
      if (remaining > 0) setApproveConfirm({ producer, count: remaining });
      else approve(producer);
    },
    [approve, itemsLoaded, uncheckedCount],
  );

  // Same impurity as `toggleOpen` above, found by the Bug Protocol sibling
  // grep rather than named in the ticket: `approve` was called from inside the
  // `setApproveConfirm` updater, so a StrictMode double-invoke fired the
  // approve request TWICE. Read the value, then write it — never both in one
  // updater.
  const confirmApprove = useCallback(() => {
    if (approveConfirm) approve(approveConfirm.producer);
    setApproveConfirm(null);
  }, [approve, approveConfirm]);

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
