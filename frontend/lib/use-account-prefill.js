// @ts-check
"use client";

/**
 * Module:   use-account-prefill
 * Purpose:  Fill a public form's empty contact fields from the signed-in
 *           visitor's own account (MEH-3112, Sapir 14/11 option א: prefilled,
 *           still editable — the Luma / Shop Pay pattern).
 * Rules:    only EMPTY fields — never over what she already typed; only from
 *           the account the server returned for this session (nothing is read
 *           from or written to browser storage); runs once per account, also
 *           when the account loads after the form is already on screen.
 * Related:  lib/auth-context.js (useOptionalAuth — no provider → no prefill),
 *           components/RegistrationCta.jsx, app/[locale]/contact/ContactClient.jsx,
 *           app/[locale]/recommend/RecommendClient.jsx,
 *           components/ReportInfoModal.jsx, components/DeliveryWaitlistForm.jsx.
 * History:  MEH-3112 (creation).
 */

import { useEffect, useRef } from "react";
import { useOptionalAuth } from "@/lib/auth-context";

/** @typedef {"name" | "email" | "phone"} AccountField */

/** A trimmed account value, or "" when the account has none. */
function accountValue(user, key) {
  const v = user?.[key];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Calls `apply(user)` once per signed-in account id (never for a guest), and
 * `clear(previousUser)` when that account signs out — so one person's details
 * never stay on screen for the next (review, MEH-3112). Returns `refill()`,
 * which re-applies for the current account (a form that resets after a send).
 */
function useOncePerAccount(apply, clear) {
  const user = useOptionalAuth()?.user ?? null;
  const id = user?.id ?? null;
  const seen = useRef(null);
  const userRef = useRef(user);
  userRef.current = user;
  useEffect(() => {
    if (id === null) {
      if (seen.current !== null) clear(seen.current);
      seen.current = null;
      return;
    }
    if (seen.current?.id === id) return;
    seen.current = userRef.current;
    apply(userRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per account id
  }, [id]);
  return () => {
    if (userRef.current) apply(userRef.current);
  };
}

/**
 * Object form: `map` = { formField: accountField }.
 * @param {(update: (prev: Record<string, any>) => Record<string, any>) => void} setForm
 * @param {Record<string, AccountField>} map
 * @returns {() => void} refill — call after resetting the form
 */
export function useAccountPrefill(setForm, map) {
  const fill = (user) =>
    setForm((prev) => {
      let next = prev;
      for (const [field, key] of Object.entries(map)) {
        const value = accountValue(user, key);
        if (value && !String(prev?.[field] ?? "").trim()) {
          if (next === prev) next = { ...prev };
          next[field] = value;
        }
      }
      return next;
    });
  // Sign-out: empty only what is still exactly the old account's value.
  const clear = (old) =>
    setForm((prev) => {
      let next = prev;
      for (const [field, key] of Object.entries(map)) {
        const value = accountValue(old, key);
        if (value && String(prev?.[field] ?? "").trim() === value) {
          if (next === prev) next = { ...prev };
          next[field] = "";
        }
      }
      return next;
    });
  return useOncePerAccount(fill, clear);
}

/**
 * Single-value form (a plain string state).
 * @param {(update: (prev: string) => string) => void} setValue
 * @param {AccountField} key
 * @returns {() => void} refill
 */
export function useAccountPrefillValue(setValue, key) {
  return useOncePerAccount(
    (user) => {
      const value = accountValue(user, key);
      if (value) setValue((prev) => (String(prev ?? "").trim() ? prev : value));
    },
    (old) => {
      const value = accountValue(old, key);
      if (value) setValue((prev) => (String(prev ?? "").trim() === value ? "" : prev));
    },
  );
}
