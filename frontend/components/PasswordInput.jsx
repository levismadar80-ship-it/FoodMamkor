"use client";

/**
 * MEH-306 — reusable password input with live policy feedback.
 *
 * Composes:
 *   - <input type="password" | "text"> with eye toggle (Israeli banking
 *     convention: eye at the visual end of the LTR input field).
 *   - Synchronous length check (PASSWORD_MIN_LENGTH from validators).
 *   - Async breach check via POST /auth/check-password (rate-limited
 *     30/min/IP server-side; debounced 500ms client-side; AbortController
 *     cancels stale requests).
 *
 * Rendering layers (intentional split):
 *   1. *Inline checklist below the input* — sync length, async breach,
 *      and (when `showCurrentPasswordReuse`) a pending tile noting that
 *      reuse is verified server-side at submit. This is the live-typing
 *      coach.
 *   2. *Form-level error div* — owned by the parent page (/signup,
 *      /reset-password, /settings). Surfaces 422 failures from the
 *      submit handler (`too_short`, `too_common`, `same_as_current`)
 *      via passwordMessages.firstFailureMessage. PasswordInput does
 *      NOT render reuse-failure tiles itself because it cannot know
 *      the user's current_hash; the server has the only authority on
 *      that, and it ships the failure on the actual submit response.
 *
 * Failures the input renders inline (preview):
 *   - "✓ N תווים" / "○ N תווים"     — sync; reflects the immediate value
 *   - "✓ לא דלפה ברשת" / "○ לא דלפה ברשת" / "בודק..." — async / pending
 *   - "○ שונה מהקודמת — נבדק בשרת"   — informational only (when prop set)
 *
 * Failures the parent page renders (post-submit):
 *   - All three Hebrew strings via passwordMessages, on the form-level
 *     error div, on 422 from /auth/{register,reset-password} or
 *     PATCH /users/me/password.
 *
 * Fail-soft on /auth/check-password errors (network, 429, 5xx) — leaves
 * the last known apiFailures in place; backend re-validates on submit
 * regardless. Avoids blocking submit on a transient client-side check.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeSlash } from "@phosphor-icons/react";

import api from "@/lib/api";
import { failureMessage } from "@/lib/passwordMessages";
import { PASSWORD_MIN_LENGTH } from "@/lib/validators";

const HIBP_DEBOUNCE_MS = 500;

export default function PasswordInput({
  name = "password",
  id,
  value,
  onChange,
  showCurrentPasswordReuse = false,
  placeholder,
  ariaLabel,
  required = true,
  autoComplete = "new-password",
  onValidityChange,
}) {
  // MEH-628: scoped translator for password-policy failure copy.
  const tValidation = useTranslations("auth.passwordValidation");
  const tForm = useTranslations("forms.password");
  const placeholderText = placeholder ?? tForm("placeholder_default");
  const ariaLabelText = ariaLabel ?? tForm("aria_label_default");
  const [show, setShow] = useState(false);
  const [apiFailures, setApiFailures] = useState([]);
  const [isChecking, setIsChecking] = useState(false);
  const abortRef = useRef(null);

  const inputId = id || `pw-${name}`;
  const tooShort = (value || "").length < PASSWORD_MIN_LENGTH;

  // Debounced /auth/check-password. Fires only when the candidate is
  // long enough to potentially pass schema validation server-side
  // (Pydantic strips + rejects below PASSWORD_MIN_LENGTH with 422
  // anyway). Skipping the call for short values saves a round-trip
  // and keeps us well under the 30/min/IP ceiling.
  useEffect(() => {
    if (tooShort) {
      // Drop any stale apiFailures so the checklist resets cleanly.
      setApiFailures([]);
      setIsChecking(false);
      if (abortRef.current) abortRef.current.abort();
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsChecking(true);

    const handle = setTimeout(async () => {
      try {
        const res = await api.post(
          "/auth/check-password",
          { candidate: value },
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const failures = Array.isArray(res?.data?.failures)
          ? res.data.failures
          : [];
        setApiFailures(failures);
      } catch (err) {
        // Fail-soft: 429 / 5xx / network → reset to "no known failure"
        // so the next keystroke retries cleanly. Backend re-validates
        // on the actual submit; the user doesn't get blocked from
        // progressing on a transient error.
        if (controller.signal.aborted) return;
        setApiFailures([]);
      } finally {
        if (!controller.signal.aborted) setIsChecking(false);
      }
    }, HIBP_DEBOUNCE_MS);

    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [value, tooShort]);

  // Bubble overall validity to the parent (used to gate submit buttons).
  // "valid" means: length OK + no async failures known. We deliberately
  // allow submit while `isChecking` so the UX doesn't deadlock on slow
  // networks — backend is the authority on submit anyway.
  useEffect(() => {
    if (typeof onValidityChange !== "function") return;
    onValidityChange(!tooShort && apiFailures.length === 0);
  }, [tooShort, apiFailures, onValidityChange]);

  const breachOk =
    !tooShort && !isChecking && !apiFailures.includes("too_common");
  const breachPending = !tooShort && isChecking;

  return (
    <div>
      <div className="relative">
        <input
          id={inputId}
          name={name}
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange}
          placeholder={placeholderText}
          aria-label={ariaLabelText}
          required={required}
          autoComplete={autoComplete}
          dir="ltr"
          className="w-full border border-border rounded-[12px] pr-11 pl-3 py-2 text-right outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-text transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-full p-1"
          aria-label={show ? tForm("toggle_hide") : tForm("toggle_show")}
          aria-pressed={show}
          tabIndex={0}
        >
          {show ? (
            <EyeSlash size={20} weight="regular" aria-hidden="true" />
          ) : (
            <Eye size={20} weight="regular" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Checklist — only render once the user starts typing so the form
          doesn't show "failing" tiles before any input. aria-live keeps
          screen readers in the loop without spamming on every keystroke. */}
      {(value || "").length > 0 && (
        <ul className="mt-2 space-y-1" aria-live="polite">
          <li
            className={`text-xs flex items-center gap-1.5 ${
              tooShort ? "text-fg-muted" : "text-primary"
            }`}
          >
            <span aria-hidden="true">{tooShort ? "○" : "✓"}</span>
            {tooShort
              ? failureMessage("too_short", tValidation)
              : tForm("min_length", { min: PASSWORD_MIN_LENGTH })}
          </li>
          <li
            className={`text-xs flex items-center gap-1.5 ${
              breachOk
                ? "text-primary"
                : breachPending
                  ? "text-fg-muted"
                  : "text-red-500"
            }`}
          >
            <span aria-hidden="true">
              {breachOk ? "✓" : breachPending ? "…" : "○"}
            </span>
            {breachPending
              ? tForm("checking")
              : apiFailures.includes("too_common")
                ? failureMessage("too_common", tValidation)
                : tForm("not_breached")}
          </li>
          {showCurrentPasswordReuse && (
            <li className="text-xs flex items-center gap-1.5 text-fg-muted">
              <span aria-hidden="true">○</span>
              {tForm("different_from_current")}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
