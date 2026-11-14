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

/** Calls `apply(user)` once per signed-in account id (never for a guest). */
function useOncePerAccount(apply) {
  const user = useOptionalAuth()?.user ?? null;
  const id = user?.id ?? null;
  const seen = useRef(null);
  useEffect(() => {
    if (!user || id === null || seen.current === id) return;
    seen.current = id;
    apply(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per account id
  }, [id]);
}

/**
 * Object form: `map` = { formField: accountField }.
 * @param {(update: (prev: Record<string, any>) => Record<string, any>) => void} setForm
 * @param {Record<string, AccountField>} map
 */
export function useAccountPrefill(setForm, map) {
  useOncePerAccount((user) =>
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
    }),
  );
}

/**
 * Single-value form (a plain string state).
 * @param {(update: (prev: string) => string) => void} setValue
 * @param {AccountField} key
 */
export function useAccountPrefillValue(setValue, key) {
  useOncePerAccount((user) => {
    const value = accountValue(user, key);
    if (value) setValue((prev) => (String(prev ?? "").trim() ? prev : value));
  });
}
