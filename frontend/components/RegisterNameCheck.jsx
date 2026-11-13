// @ts-check
"use client";

/**
 * Module:   RegisterNameCheck
 * Purpose:  Under the business-name field of the sign-up form: when a live
 *           business already carries the typed name, say so and point its
 *           owner at the existing page instead of opening a second one.
 * Touches:  GET /producer-name-check (anonymous, read-only, not logged as a
 *           search — backend/app/routers/producer_name_check.py).
 * Does NOT: block the form. A match is a hint; two businesses may share a
 *           name. A failed or malformed answer renders nothing.
 * Related:  app/[locale]/register/producer/RegisterProducerClient.jsx
 *           (DETAILS step, under `register-details-name`).
 * History:  MEH-3086 (creation).
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import api from "@/lib/api";
import { NameCheckResponseSchema } from "@/lib/api-schemas";

const DEBOUNCE_MS = 600;
const MIN_NAME_LEN = 3;

/** @typedef {{ id: string, slug?: string | null, name: string, city?: string | null }} NameMatch */

/**
 * The live businesses that carry `name`. Empty while typing, on a short name,
 * and on any failure. The answer is kept WITH the name it was asked for, so a
 * hint for an older name is never shown beside a newer one.
 * @param {string} name
 * @returns {NameMatch[]}
 */
function useNameMatches(name) {
  const [answer, setAnswer] = useState(
    /** @type {{ key: string, matches: NameMatch[] }} */ ({ key: "", matches: [] })
  );
  const clean = (name || "").trim();

  useEffect(() => {
    if (clean.length < MIN_NAME_LEN) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      // Promise.resolve().then: a throw or a non-promise from api.get lands
      // in the catch below instead of escaping from the timer.
      Promise.resolve()
        .then(() => api.get("/producer-name-check", { params: { name: clean } }))
        .then((res) => {
          const parsed = NameCheckResponseSchema.safeParse(res?.data);
          if (!cancelled && parsed.success) setAnswer({ key: clean, matches: parsed.data.matches });
        })
        .catch(() => {});
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [clean]);

  return answer.key === clean ? answer.matches : [];
}

/** @param {{ name: string }} props */
export default function RegisterNameCheck({ name }) {
  const t = useTranslations("auth.register.producer.name_check");
  const matches = useNameMatches(name);
  if (matches.length === 0) return null;

  return (
    <div
      role="status"
      data-testid="register-name-check"
      className="rounded-md border border-border bg-surface-card p-3 text-sm text-text text-start"
    >
      <p className="font-medium">{t("title")}</p>
      <ul role="list" className="mt-1 flex flex-col gap-1">
        {matches.map((m) => (
          <li key={m.id} data-testid="register-name-check-match">
            <Link
              href={m.slug ? `/${m.slug}` : `/producer/${m.id}`}
              target="_blank"
              rel="noopener"
              className="inline-block py-1 underline focus-ring"
            >
              {m.city ? t("match_with_city", { name: m.name, city: m.city }) : m.name}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-fg-muted">
        {t("body")}{" "}
        <Link href="/contact" data-testid="register-name-check-contact" className="inline-block py-1 underline focus-ring">
          {t("contact_cta")}
        </Link>
      </p>
    </div>
  );
}
