// @ts-check
"use client";

/**
 * Module:   RegisterIdentityCheck
 * Purpose:  Under the phone field of the sign-up form: when this business
 *           already has a page (any status, with an account or without), say
 *           so before a second one is created, and name the account it sits
 *           in, masked (MEH-3884, Farmerim 26/11).
 * Touches:  POST /producer-identity-check (read-only;
 *           backend/app/routers/producer_identity_check.py).
 * Does NOT: block the form (Sapir 26/11: warn, she may go on; the admin is
 *           emailed about the pair either way), send an email address (the
 *           server reads only the signed-in user's own one, MEH-328), or
 *           compare names (RegisterNameCheck does). A failed or malformed
 *           answer renders nothing.
 * Related:  components/RegisterNameCheck.jsx (same shape, for the name) ·
 *           app/[locale]/register/producer/steps/DetailsStep.jsx (caller).
 * History:  MEH-3884 (creation).
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import api from "@/lib/api";
import { IdentityCheckResponseSchema } from "@/lib/api-responses";
import { validateIsraeliPhone } from "@/lib/validators";

const DEBOUNCE_MS = 600;

/** @typedef {{ owner_email: string | null }} IdentityMatch */

/**
 * The page this business already has, or null. A signed-in user is checked
 * on her own account even before she types a phone. The answer is kept WITH
 * the phone it was asked for, so an old answer never sits beside a new phone.
 * @param {string} phone
 * @param {boolean} signedIn
 * @returns {IdentityMatch | null}
 */
function useIdentityMatch(phone, signedIn) {
  const [answer, setAnswer] = useState(
    /** @type {{ key: string, match: IdentityMatch | null }} */ ({ key: "", match: null })
  );
  const clean = (phone || "").trim();
  const phoneOk = !!clean && !!validateIsraeliPhone(clean);
  const key = `${signedIn ? "1" : "0"}|${phoneOk ? clean : ""}`;

  useEffect(() => {
    if (!phoneOk && !signedIn) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      Promise.resolve()
        .then(() => api.post("/producer-identity-check", { phone: phoneOk ? clean : null }))
        .then((res) => {
          const parsed = IdentityCheckResponseSchema.safeParse(res?.data);
          if (!cancelled && parsed.success) setAnswer({ key, match: parsed.data.match ?? null });
        })
        .catch(() => {});
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, clean, phoneOk, signedIn]);

  return answer.key === key ? answer.match : null;
}

/** @param {{ phone: string, signedIn?: boolean }} props */
export default function RegisterIdentityCheck({ phone, signedIn = false }) {
  // One namespace up: the two link labels reuse existing keys (messages-hygiene).
  const t = useTranslations("auth.register");
  const match = useIdentityMatch(phone, signedIn);
  if (!match) return null;

  return (
    <div
      role="status"
      data-testid="register-identity-check"
      className="mt-2 rounded-md border border-border bg-surface-card p-3 text-sm text-text text-start"
    >
      <p className="font-medium">{t("producer.identity_check.title")}</p>
      <p className="mt-1" data-testid="register-identity-check-body">
        {match.owner_email ? (
          t.rich("producer.identity_check.body_owned", {
            email: match.owner_email,
            // An address is LTR inside a Hebrew sentence.
            addr: (chunks) => <bdi dir="ltr">{chunks}</bdi>,
          })
        ) : (
          t("producer.identity_check.body_unowned")
        )}
      </p>
      <p className="mt-1 text-fg-muted">{t("producer.identity_check.staff_hint")}</p>
      <p className="mt-2 flex flex-wrap gap-x-4">
        {match.owner_email && (
          <Link href="/login" data-testid="register-identity-check-login" className="inline-block py-1 underline focus-ring">
            {t("consumer.login_link")}
          </Link>
        )}
        <Link href="/contact" data-testid="register-identity-check-contact" className="inline-block py-1 underline focus-ring">
          {t("producer.name_check.contact_cta")}
        </Link>
      </p>
    </div>
  );
}
