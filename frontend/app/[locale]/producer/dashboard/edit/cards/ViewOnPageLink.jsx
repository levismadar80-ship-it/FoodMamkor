"use client";
// @ts-check

/**
 * Module:   producer/dashboard/edit/cards/ViewOnPageLink
 * Purpose:  The «view on page» back-link shown inside an expanded edit card.
 * Does NOT: render inside an accordion header (a link inside a button is invalid HTML).
 * Related:  ../cards.jsx (re-exports this, so existing imports keep working);
 *           ../page.js (renders the cards).
 * History:  MEH-3152 — moved VERBATIM out of edit/cards.jsx (2,618 lines) into
 *           its own file; the per-change history is in the comments below.
 */

import { Link as LocaleLink } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Eye } from "@phosphor-icons/react";

// ============================================================
// MEH-1306: "view on page" back-link — closes the edit↔public loop from the
// edit side. Rendered inside the EXPANDED card body only (never the accordion
// header — that's a <button>, a nested interactive element is invalid HTML).
// Deep-links to the mapped public section id (#section-*, ProducerDetail /
// ProducerSections). producerId comes from the already-fetched /producers/me
// payload — no new API calls; self-hides when the id is absent.
// ============================================================

// MEH-2155: `testId` is optional and defaults to today's value, so every
// existing call site — and every locator already written against it — is
// unchanged. It exists because two cards now deep-link to the SAME anchor:
// the contact card and the questions card both point at #section-contact
// (the question chips render inside the contact block on the public page).
// EditAccordionCard keeps collapsed cards mounted (MEH-1100), so both links
// are in the DOM at once and a shared testid would resolve to two elements —
// which `getByTestId` treats as an error, not as a match.
// MEH-3024: /producer/<id> answers a real 404 while the business is not
// approved, so an unapproved owner is sent to the dashboard preview instead —
// the same rule as DashboardLayoutClient's «צפייה בדף» (MEH-2916). `status` is
// the /producers/me payload's status; absent (older callers, tests) keeps the
// public link, since every dashboard caller passes it.
export function ViewOnPageLink({ producerId, anchor, testId, status }) {
  const t = useTranslations("dashboard.producer");
  if (!producerId) return null;
  const href =
    status && status !== "approved"
      ? "/producer/dashboard/preview"
      : `/producer/${producerId}#${anchor}`;
  return (
    <p className="mb-3">
      <LocaleLink
        href={href}
        data-testid={testId || `view-on-page-${anchor}`}
        // Calm idiom (ADR-019): muted text link, never a primary CTA;
        // min-h 44px keeps the tap target (MEH-813).
        className="inline-flex items-center gap-1.5 min-h-touch text-sm text-fg-muted hover:text-accent focus-visible:underline transition-colors"
      >
        <Eye size={16} aria-hidden="true" />
        {t("view_on_page")}
      </LocaleLink>
    </p>
  );
}
