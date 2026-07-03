"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, ChatCircleDots, Clock, ListChecks } from "@phosphor-icons/react";

/**
 * Module:   RegisterPreflight
 * Purpose:  "לפני שמתחילים" entry screen for the producer registration
 *           wizard — prep checklist, duration, what-happens-after — shown
 *           BEFORE frame 01 so no one enters the wizard blind (MEH-994).
 * Does NOT: own any wizard state, form fields, or submit logic — that all
 *           stays in RegisterProducerClient.jsx. Pure entry chrome; the
 *           only exit is onStart().
 * Related:  RegisterProducerClient.jsx:74-81 (step init the CTA hands off
 *           to), /about/process (linked acceptance-process page)
 * History:  MEH-994 (creation)
 */

// MEH-994: showAccountLine is false on the upgrade path (logged-in users
// skip the ACCOUNT frame, so the account-creation checklist item would
// promise a step that never renders).
export default function RegisterPreflight({ showAccountLine, onStart }) {
  const t = useTranslations("auth.register.producer.preflight");

  return (
    <div className="space-y-5" data-testid="register-preflight">
      <h2 className="font-headline-md text-lg font-black text-text">{t("title")}</h2>

      {/* Prep checklist — MEH-880 E1 reassurance-card token pattern
          (bg-background border-primary/20, no state-color). */}
      <div className="bg-background border border-primary/20 rounded-md px-4 py-3 text-sm">
        <p className="font-medium text-text flex items-center gap-2 mb-2">
          <ListChecks size={18} className="text-primary shrink-0" aria-hidden="true" />
          {t("prepare_title")}
        </p>
        <ul className="space-y-1.5 text-text list-disc ps-5">
          {showAccountLine && <li data-testid="register-preflight-account-item">{t("item_account")}</li>}
          <li>{t("item_story")}</li>
          <li>{t("item_photos")}</li>
          {/* License wording aligned with the MEH-971 license-pending opt-in path. */}
          <li>{t("item_license")}</li>
        </ul>
      </div>

      {/* Duration — number matches the live page subtitle ("5 דקות"). */}
      <p className="text-fg-muted text-sm flex items-center gap-2">
        <Clock size={16} className="shrink-0" aria-hidden="true" />
        {t("duration")}
      </p>

      {/* What happens after submit */}
      <div className="text-sm">
        <p className="font-medium text-text flex items-center gap-2 mb-1">
          <ChatCircleDots size={18} className="text-primary shrink-0" aria-hidden="true" />
          {t("after_title")}
        </p>
        <p className="text-text">{t("after_body")}</p>
        <Link
          href="/about/process"
          className="inline-flex items-center gap-1 text-primary font-semibold hover:underline mt-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {t("after_link")}
          <ArrowLeft size={16} aria-hidden="true" />
        </Link>
      </div>

      {/* Single CTA — hands off to the untouched step machinery. Mirrors the
          wizard's outline next/submit button convention. */}
      <button
        type="button"
        data-testid="register-preflight-start"
        onClick={onStart}
        className="w-full border-2 border-primary-dark text-primary-dark bg-transparent py-3 rounded-md hover:bg-primary-dark hover:text-white transition font-medium"
      >
        {t("cta")}
      </button>
    </div>
  );
}
