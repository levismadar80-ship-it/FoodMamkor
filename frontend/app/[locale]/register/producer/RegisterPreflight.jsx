"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, ChatCircleDots, Clock, ListChecks } from "@phosphor-icons/react";
import Button from "@/components/ui/Button";

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

  // MEH-2970: space-y-4, not -5. Measured at 375×667: the approved copy cuts
  // 40px, which clears 390×664 and leaves «מתחילים» 7px below the fold here —
  // text tightened further wraps to the same line count, so copy alone cannot
  // close it. The 4 gaps give the remaining 16px. The button does not move
  // (Sapir, 12/11).
  return (
    <div className="space-y-4" data-testid="register-preflight">
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

      {/* MEH-994b: duration must match the page subtitle and the
          /about/for-businesses FAQ.
          MEH-2970: this comment used to say «10 דקות» and cite a Sapir
          decision for it. Measured 12/11 — all four user-facing surfaces say
          «כ־5 דקות» (he.json: the page subtitle :232, this key :246,
          duration_hint :269, og_description :671). The strings agreed with
          each other; the comment was the outlier. Sapir's ruling: keep the
          strings, fix the comment. */}
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
          data-testid="register-preflight-process-link"
          className="inline-flex items-center gap-1 text-primary font-semibold hover:underline mt-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t("after_link")}
          <ArrowLeft size={16} aria-hidden="true" />
        </Link>
      </div>

      {/* Single CTA — hands off to the untouched step machinery. MEH-2565: a
          filled primary button — it is the only action on the screen, and the
          outline style read as secondary. */}
      <Button
        type="button"
        data-testid="register-preflight-start"
        onClick={() => onStart()}
        variant="primary" size="lg" className="w-full"
      >
        {t("cta")}
      </Button>

      {/* MEH-2983: /join is the main door; this is the way back to it for
          someone who landed here directly. A quiet, descriptive text link
          (names what is there, not «עוד מידע») and AFTER the button, so it
          never moves «מתחילים» above the fold (#4341). */}
      <p className="text-center text-sm">
        <Link
          href="/join"
          data-testid="register-preflight-join-link"
          className="inline-flex items-center gap-1 text-primary underline underline-offset-4 hover:text-primary-dark rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t("join_link")}
          <ArrowLeft size={14} aria-hidden="true" />
        </Link>
      </p>

      {/* MEH-2917: the organizer door (Sapir 11/11: back on the preflight,
          where MEH-2640 said it moved). A link, never the removed checkbox —
          the ROUTE decides the kind (MEH-2773). Group-buy organizers are told
          here, before step 1, that the site has no sign-up for them: only a
          verified business opens a group buy (group_buys.py
          require_verified_producer). */}
      <div className="space-y-1 text-center text-sm" data-testid="register-preflight-organizer">
        <Link
          href="/register/organizer"
          data-testid="register-preflight-organizer-link"
          className="inline-flex items-center gap-1 text-primary underline underline-offset-4 hover:text-primary-dark rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t("organizer_link")}
          <ArrowLeft size={14} aria-hidden="true" />
        </Link>
        <p className="text-fg-muted" data-testid="register-preflight-group-buy-note">
          {t("group_buy_note")}
        </p>
      </div>
    </div>
  );
}
