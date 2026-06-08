"use client";

/**
 * useAdminAction — double-submit protection for admin fire-and-reload handlers
 * (UIS Pattern A, MEH-228).
 *
 * The audited admin handlers (`reports`, `users`, `content`, `producers`) all
 * shared the same hole: `await api.post(...)` then mutate local state, with
 * **no** in-flight lock and **no** error surface. A rapid double-click fired
 * the mutation twice (double moderation / double block / double delete), and a
 * failed request was swallowed silently — the row just didn't change.
 *
 * `run(key, fn, onError?)`:
 *   - a synchronous `inFlight` ref keyed by `key` rejects a second call before
 *     React re-renders → genuine double-fire protection (a state-only guard
 *     would still race within one tick);
 *   - `busyKeys` state drives the trigger's `disabled` via `isBusy(key)`;
 *   - on throw: `onError` string → that toast; `onError` fn → custom handler;
 *     omitted → the central `errorMessage(err)` Hebrew toast (MEH-251);
 *   - always clears the key in `finally` (success reset).
 *
 * Per-key (not global) locking: distinct rows/actions can run concurrently,
 * only the same key is blocked.
 */

import { useCallback, useRef, useState } from "react";

import { errorMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";

export function useAdminAction() {
  const [busyKeys, setBusyKeys] = useState(() => new Set());
  const inFlight = useRef(new Set());

  const run = useCallback(async (key, fn, onError) => {
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setBusyKeys(new Set(inFlight.current));
    try {
      await fn();
    } catch (err) {
      if (typeof onError === "string") showToast.error(onError);
      else if (typeof onError === "function") onError(err);
      else showToast.error(errorMessage(err));
    } finally {
      inFlight.current.delete(key);
      setBusyKeys(new Set(inFlight.current));
    }
  }, []);

  const isBusy = useCallback((key) => busyKeys.has(key), [busyKeys]);

  return { run, isBusy };
}
