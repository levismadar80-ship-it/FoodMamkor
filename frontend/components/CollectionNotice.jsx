"use client";

/**
 * Module:   CollectionNotice
 * Purpose:  One short line at the point of input telling a person what happens
 *           to what they are about to type, plus a link to the privacy page.
 *           The notice-at-collection pattern (ICO / CCPA): the disclosure sits
 *           where the data is entered, not only in a policy nobody opens.
 * Touches:  nothing — presentational. No network, no storage, no analytics.
 * Does NOT: gate submission. This is a NOTICE, not a consent checkbox — the
 *           registration pages own that pattern
 *           (RegisterClient.jsx:374-393) and it is deliberately not reused
 *           here: a checkbox on a chat input or a password-reset field would
 *           add friction to a flow that has no choice to offer.
 * Does NOT: carry any copy of its own. Every string arrives through `t()` from
 *           the caller's namespace, so a copy ruling changes messages/*.json
 *           and never this file (rule 22).
 * Related:  frontend/app/[locale]/register/RegisterClient.jsx:385-391 (the
 *           existing /privacy link treatment this matches), MEH-1981.
 * History:  MEH-1981 (creation — the five surfaces measured with no notice).
 */

import { Link } from "@/i18n/navigation";

// MEH-1981 a11y: `underline` at rest, NOT `hover:underline`. axe's
// link-in-text-block rule passes if EITHER the link contrasts 3:1 against the
// surrounding text OR it is distinguished without relying on colour. This link
// sits inside a <p> of body copy, and #2e6853 on #1c1a17 measures 2.66:1 —
// under the threshold — so the resting underline is the condition that has to
// hold. Measured red on /forgot-password, desktop and mobile, in
// e2e/flows/12-axe-a11y.spec.ts before this line changed.
const LINK_CLASS = "text-primary underline";

/**
 * @param {object}   props
 * @param {string}   props.message     Already-translated notice line.
 * @param {string}   props.linkLabel   Already-translated label for /privacy.
 * @param {string}   props.testId      data-testid for the wrapper.
 * @param {string}   [props.className] Extra classes. Logical properties only.
 *
 * Translation happens in the CALLER, not here: each surface owns its own
 * next-intl namespace, so a component calling useTranslations() would have to
 * hardcode one namespace and would stop working on the next surface.
 */
export default function CollectionNotice({ message, linkLabel, testId, className = "" }) {
  // Render nothing rather than an empty line if a caller passes no message —
  // a bare "·" next to a link reads as a broken element, and a notice that
  // says nothing is worse than no notice at all.
  if (!message) return null;

  return (
    <p
      data-testid={testId}
      // Logical properties only (start/end/ms/me). The physical variants break
      // under dir="rtl", so this uses text-start and margin-block utilities.
      className={`text-xs text-muted-foreground leading-relaxed text-start mt-2 ${className}`}
    >
      {message}{" "}
      <Link
        href="/privacy"
        target="_blank"
        className={LINK_CLASS}
        data-testid={testId ? `${testId}-link` : undefined}
      >
        {linkLabel}
      </Link>
    </p>
  );
}
