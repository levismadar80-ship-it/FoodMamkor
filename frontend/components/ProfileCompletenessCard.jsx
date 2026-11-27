// @ts-check
"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Check, ArrowRight, CaretLeft } from "@phosphor-icons/react";
import { producerCompleteness, COMPLETENESS_FIELDS } from "@/lib/producer-completeness";
import PhoneVerifyCard from "@/components/PhoneVerifyCard";
import { useResendVerification } from "@/lib/use-resend-verification";
import InlineMessage from "@/components/ui/InlineMessage";
import {
  MISSING_CATEGORY,
  MISSING_EMAIL_VERIFIED,
  MISSING_IMAGE,
  MISSING_LOCATION,
  MISSING_PHONE_VERIFIED,
  MISSING_PRODUCT,
  isDeliveryOnly as gateDeliveryOnly,
  submissionMissingItems,
} from "@/lib/submission-gate";
import { licenseMissingForProfile } from "@/lib/license-required-categories";

/**
 * ProfileCompletenessCard — MEH-288.
 *
 * Module:   ProfileCompletenessCard
 * Purpose:  Surface a clear onboarding path to the business owner at the top
 *           of /producer/dashboard as a 7-step checklist (photo →
 *           categories+location → first product → primary contact → WhatsApp
 *           verification → opening hours → owner photo, MEH-3032) so a brand-new producer sees concrete next steps instead of
 *           three 0/0/0 analytics cards. Read-only consumer of the shared
 *           completeness heuristic.
 * Does NOT: own the completeness logic — that lives in
 *           lib/producer-completeness.js (heuristic; never edited here) and is
 *           shared with the admin producers list. Does not mutate producer data
 *           or hit any API. The products step is card-only (MEH-1106 B1) —
 *           it never enters the shared heuristic, so the admin list is
 *           unaffected. Does not touch ChangesRequestedBanner (separate admin
 *           channel).
 * Related:  app/[locale]/producer/dashboard/page.js (mount, above analytics);
 *           lib/producer-completeness.js:24 (the heuristic);
 *           lib/badges.js:125 (PRODUCTS_MIN=3 — the auto-badge threshold, now
 *           DECOUPLED from this checklist's CHECKLIST_PRODUCTS_MIN=1, MEH-1238);
 *           app/[locale]/producer/dashboard/edit/page.js (deep-link anchors).
 * History:  MEH-288 (creation) — unblocks MEH-290 onboarding-tour step 1.
 *           MEH-897 (state-progressive checklist). MEH-1092 (F3 de-red).
 *           MEH-1106 (4-step checklist; card-only products step, B1).
 *           MEH-1238 (checklist products step 3→1; badge threshold unchanged).
 *           MEH-1895 (hours as the 5th step; the ring's divisor became
 *           steps.length, closing the gap MEH-1884 left — the card mounted for
 *           missing hours while showing 4/4 green).
 *           MEH-3659 (one checklist: ring, chips, next-step box and bottom CTA
 *           removed; draft mode lists only what blocks «שליחה לבדיקה»).
 *
 * States:
 *   draft                — the submit gate only (details · image · product ·
 *                          WhatsApp), «N מתוך M», the first undone row open
 *                          (the WhatsApp row hosts the OTP card); the submit
 *                          button (footer) shows once every row is done.
 *   improve, complete    — collapses to a single confirmation line.
 *   improve, incomplete  — «לשפר את העמוד», «N מתוך M» over the 7 steps, the
 *                          first undone row open with one «להשלמה» link.
 *                          Never red (MEH-1092).
 */

// The checklist steps drive the «N מתוך M» counter (goal-gradient). Named per
// exec §10. Steps ①②④⑤ derive from the shared heuristic (image, category+city+
// location, contact, hours); step ③ (products) is card-only per MEH-1106 B1.
//
// MEH-1895: the count is NOT a constant any more. It was `STEP_COUNT = 4`,
// which meant adding a step silently produced percentages over 100 — and,
// worse, left the card mounting for a missing field it could not name.
// `steps.length` is the single source; there is nothing left to keep in sync.

// MEH-1238: the checklist products step is DECOUPLED from the badge threshold.
// badges.js:125 PRODUCTS_MIN = 3 stays as the auto-badge rule (intentionally
// left untouched), but a business with a single product must be able to reach
// 100% on the onboarding checklist — a step that can never complete kills the
// goal-gradient effect (Sapir decision 16/07). Checklist = minimum to activate,
// not the ideal. So the checklist requires 1; the badge still requires 3.
const CHECKLIST_PRODUCTS_MIN = 1;

// Canonical profile-editor hub. Every business field is editable here; the
// per-step deep-links target section anchors added on the edit page
// (edit/page.js — id="profile-*"). Named per exec §10.
const EDIT_HUB = "/producer/dashboard/edit";

// Build the checklist steps from the shared heuristic + the card-only
// products signal. Each step: { key, done, href }.
function buildSteps(producer, missingLabels) {
  // MEH-213: delivery-only producers have no lat/lng — the location field is
  // `delivery` (areas) instead of `coords`. Mirror the heuristic's own split
  // (lib/producer-completeness.js:26) so the location step matches what the
  // heuristic actually flags for this producer shape.
  const isDeliveryOnly =
    producer.has_physical_location === false && producer.offers_delivery;
  const locationSlug = isDeliveryOnly ? "delivery" : "coords";

  // Card-only products signal (MEH-1106 B1). /producers/me joinloads the
  // products relation (producer_me.py:69) so the array length is the reliable
  // source; the scalar products_count is a listing-serializer field that
  // defaults to 0 here, so it's only a fallback.
  const productsCount = Array.isArray(producer.products)
    ? producer.products.length
    : producer.products_count ?? 0;

  const has = (slug) => !missingLabels.has(COMPLETENESS_FIELDS[slug]);

  // MEH-2100: `required` marks the items the SUBMIT GATE blocks on
  // (backend/app/services/submission_gate.py), as distinct from the ones that
  // only move the completeness ring. Opening hours are the single recommended
  // step — Google precedent, Sapir 16/08 — and a business can be sent for
  // review without them.
  //
  // CONTACT IS REQUIRED, BUT `has("contact")` IS NOT THE GATE'S CONDITION.
  // This comment previously justified the flag with "there is nothing to
  // verify without a phone" — true, and not what the gate checks. The gate
  // blocks on `phone_verified`; `has("contact")` is
  // `p.phone || p.instagram` (producer-completeness.js:74), so an
  // Instagram-only business satisfies it with no phone at all, and a business
  // that typed a phone but never ran the OTP satisfies it too.
  //
  // The consequence is a real one and it is NOT fixed here: a business that
  // typed a phone but never ran the OTP reads «פרטי קשר ✓ חובה» in this
  // checklist while the banner below it still blocks on «אימות וואטסאפ». Two
  // surfaces on one page, disagreeing about whether a required item is done.
  //
  // Conjoining this row's done-signal with `phone_verified` was tried and
  // REVERTED, because it is not the small fix it looks like: `done` feeds
  // `doneCount`, the percentage, the ring, and the `isComplete` collapse, so
  // the change lowers the completeness score of every producer with an
  // unverified phone and reddened 12 existing assertions in
  // ProfileCompletenessCard.test.jsx. That is a product decision about what
  // the ring measures, which MEH-2100 has no mandate over — and rewriting a
  // dozen fixtures to match would have hidden it.
  //
  // The alternative, retitling the step so it stops implying gate-readiness,
  // is user-facing copy and belongs to Sapir (workflow rule 22). Raised on
  // the PR with both options rather than silently picking one.
  // .claude/rules/labels.md is the frame: a label must not over-claim, and
  // this one currently does.
  return [
    { key: "image", done: has("image"), required: true, href: `${EDIT_HUB}#profile-images` },
    {
      key: "location",
      required: true,
      // "Categories + location" = category filled AND the location pair
      // (city + coords/delivery) filled.
      done: has("category") && has("city") && has(locationSlug),
      // MEH-1165 item 4: was #profile-categories — the location row must land
      // on the location editor, not the categories card. MEH-2058: the
      // owner-facing coords editor is LocationsEditor (#locations,
      // edit/page.js KEY_TO_ANCHOR) — the old #location target
      // (LocationCard, the duplicate map-pin editor) was deleted.
      href: `${EDIT_HUB}#locations`,
    },
    {
      key: "products",
      required: true,
      done: productsCount >= CHECKLIST_PRODUCTS_MIN,
      href: `${EDIT_HUB}#profile-products`,
    },
    { key: "contact", done: has("contact"), required: true, href: `${EDIT_HUB}#profile-contact` },
    {
      // MEH-2100, Sapir 16/08 — the SPLIT that resolves the contact/gate
      // mismatch, and it is deliberately neither of the two options that were
      // on the table.
      //
      // The problem: the submit gate blocks on `phone_verified`, while
      // `has("contact")` is `p.phone || p.instagram`
      // (producer-completeness.js:74). So a business with a typed-but-
      // unverified number — or with Instagram and no phone at all — read
      // «פרטי קשר ✓ חובה» here while the banner below still blocked her.
      //
      // Conjoining the two was rejected: `done` feeds doneCount, the
      // percentage, the ring and the isComplete collapse, so it would have
      // silently demoted every producer who had legitimately supplied contact
      // details. Retitling the row was rejected too — it would have made an
      // earned ✓ disappear. Both options paid for the fix by taking something
      // away from a business that had done nothing wrong.
      //
      // Splitting costs nothing instead: presence keeps its ✓, verification
      // gets its own row, and the two stop pretending to be one fact.
      key: "phone_verified",
      required: true,
      done: !!producer?.phone_verified,
      // The OTP card lives in the dashboard banner, not the edit hub. The
      // draft banner is the only carrier of this anchor since the second one
      // went with the `pending_whatsapp` status, removed in MEH-2124.
      href: "#phone-verify",
    },
    // MEH-1895: hours reads the SAME heuristic slug that mounts this card
    // (producer-completeness.js, MEH-1884) — no second condition to drift.
    //
    // MEH-3790: the anchor is `#hours` again. MEH-2142 had moved it to
    // `#locations` when store hours lived in each location's form; they now
    // live in the one «שעות» card (HoursCard.jsx), and `#hours` is registered
    // in ANCHOR_TO_KEY (lib/dashboard-edit-anchors.js) and opens it.
    {
      key: "hours",
      done: has("hours"),
      required: false,
      href: `${EDIT_HUB}#hours`,
    },
    // MEH-3032: the owner's own photo — the face on the public OwnerCard
    // (Airbnb «meet your host», Etsy «meet the owner»). Recommended, and
    // card-only like products (MEH-1106 B1): it never enters the shared
    // heuristic, so the admin list, the QR-card gate and the dashboard's
    // isComplete are unaffected. Same trim as OwnerCard.jsx:42 reads it with.
    {
      key: "owner_photo",
      done: !!producer.owner_photo_url?.trim(),
      required: false,
      href: `${EDIT_HUB}#owner-story`,
    },
  ];
}

// MEH-3659: the draft checklist. Rows come from the SUBMIT GATE
// (lib/submission-gate.js, the client mirror of submission_gate.py), so a
// business in draft sees exactly what blocks «שליחה לבדיקה» and nothing else —
// the recommended items wait for «לשפר את העמוד» after she submits
// (Shopify setup guide / Airbnb: only what blocks publishing, before publishing).
// Category + location share one «פרטי העסק» row; it opens only if one is missing.
// MEH-3697: a business with a place to visit gets its town's centre as an
// approximate point at signup (producer_queries.create_primary_branch_location,
// MEH-2480), so its location is there. A delivery-only business is not: the
// delivery cities left the form (MEH-2640), so right after signup its location
// is missing — and «פרטי העסק», which she has just filled, would tell her
// nothing. When only the location is missing the row reads the banner's
// «מיקום או אזורי משלוח» instead (same key, no new copy).
function buildDraftRows(producer) {
  const missing = new Set(submissionMissingItems(producer));
  const categoryMissing = missing.has(MISSING_CATEGORY);
  const locationMissing = missing.has(MISSING_LOCATION);
  const locationHref = gateDeliveryOnly(producer)
    ? `${EDIT_HUB}#delivery`
    : `${EDIT_HUB}#locations`;
  return [
    {
      key: "details",
      done: !categoryMissing && !locationMissing,
      gateLabel: !categoryMissing && locationMissing ? MISSING_LOCATION : undefined,
      href: categoryMissing ? `${EDIT_HUB}#profile-categories` : locationHref,
    },
    { key: "image", done: !missing.has(MISSING_IMAGE), href: `${EDIT_HUB}#profile-images` },
    { key: "product", done: !missing.has(MISSING_PRODUCT), href: `${EDIT_HUB}#profile-products` },
    // The OTP card opens inside this row — no navigation.
    { key: "phone_verified", done: !missing.has(MISSING_PHONE_VERIFIED), inline: true },
    // MEH-3660: only while the owner's email is unconfirmed (a Google signup
    // never sees it). Last, so the resend comes after the page work.
    ...(missing.has(MISSING_EMAIL_VERIFIED) ? [{ key: "email_verified", done: false, inline: true }] : []),
  ];
}

/** The open email row: one resend button, then «✓ נשלח!» (MEH-3660). */
function EmailResend({ t }) {
  // «✓ נשלח!» is the site's resend wording; one key for it (MEH-3657).
  const tVerify = useTranslations("auth.verify");
  const { resendSent, resendSending, resendError, handleResend } = useResendVerification();
  if (resendSent) {
    return (
      <p className="text-sm text-primary font-medium" data-testid="completeness-email-sent" role="status">
        {tVerify("sent")}
      </p>
    );
  }
  // A failed send (429, network) keeps the button: the message says why, and
  // the owner can try again without reloading the dashboard.
  return (
    <div className="flex flex-col items-start gap-2">
      {resendError && (
        <InlineMessage data-testid="completeness-email-error">{resendError}</InlineMessage>
      )}
      <button
        type="button"
        onClick={handleResend}
        disabled={resendSending}
        data-testid="completeness-email-resend"
        className={`${PRIMARY_BTN} disabled:opacity-50`}
      >
        {t("email_resend")}
      </button>
    </div>
  );
}

const ROW_LINK =
  "flex items-center gap-2 text-sm rounded-sm -mx-2 px-2 py-1.5 hover:bg-primary/5 transition-colors focus-ring";
const PRIMARY_BTN =
  "inline-flex items-center justify-center gap-2 min-h-touch px-5 rounded-full font-medium bg-action-primary hover:bg-action-primary-hover text-white transition-colors focus-ring";

function RowMark({ done }) {
  return (
    <span className="inline-flex w-4 justify-center text-primary shrink-0" aria-hidden="true">
      {done ? <Check size={14} weight="bold" /> : null}
    </span>
  );
}

/** Draft rows whose label lives under dashboard.producer.draft.missing. */
const SHARED_GATE_LABELS = new Set(["phone_verified", "email_verified"]);

/**
 * One list for both modes. Done rows: ✓ + label (still a link, so she can
 * edit). The FIRST row not done is the open one — tinted, with one button
 * (or, for the WhatsApp row, the OTP card itself). Every other row not done is
 * a plain label link. One open row at a time is the Shopify setup-guide shape; the
 * WhatsApp code row is the exception and stays open while undone (MEH-3886).
 */
function Checklist({ rows, label, labelOf, t, openContent = undefined }) {
  const openKey = rows.find((r) => !r.done)?.key;
  return (
    <ul className="mt-4 space-y-1" aria-label={label} data-testid="completeness-list">
      {rows.map((r) => {
        const text = labelOf(r);
        const status = <span className="sr-only">{r.done ? t("checklist_done") : t("checklist_todo")}</span>;
        // MEH-3886: the WhatsApp code row is always open while undone. It
        // depends on no other step, and as a grey line behind «מוצר» it left an
        // owner with no button to press (Farmerim, 26/11). Google Business
        // Profile and Airbnb keep their verify action reachable at any point.
        const alwaysOpen = Boolean(openContent) && r.key === "phone_verified" && !r.done;
        if (r.key === openKey || alwaysOpen) {
          return (
            <li
              key={r.key}
              // MEH-3659: only the draft row hosts the OTP card; in improve mode
              // #phone-verify belongs to the dashboard's reverify wrapper.
              id={openContent && r.key === "phone_verified" ? "phone-verify" : undefined}
              data-testid={`completeness-open-${r.key}`}
              className="bg-primary/5 border border-primary/20 rounded-md p-4 my-2"
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-text">
                <RowMark done={false} />
                {text}
                {status}
              </p>
              <div className="mt-3">
                {openContent?.(r) ?? (
                  <Link href={r.href} className={PRIMARY_BTN} data-testid={`completeness-open-cta-${r.key}`}>
                    {t("open_cta")}
                    <ArrowRight size={16} weight="bold" aria-hidden="true" className="rtl:rotate-180" />
                  </Link>
                )}
              </div>
            </li>
          );
        }
        return (
          <li key={r.key} data-testid={`completeness-row-${r.key}`} data-done={r.done}>
            {r.inline ? (
              <span className={ROW_LINK}>
                <RowMark done={r.done} />
                <span className={r.done ? "text-text" : "text-fg-muted"}>{text}</span>
                {status}
              </span>
            ) : (
              <Link href={r.href} className={ROW_LINK}>
                <RowMark done={r.done} />
                <span className={r.done ? "text-text" : "text-primary font-medium"}>{text}</span>
                {status}
                {/* MEH-3745: hover is the only cue a row is a link, and a phone has no hover. */}
                <CaretLeft
                  size={14}
                  aria-hidden="true"
                  data-testid="row-caret"
                  className={`ms-auto shrink-0 ltr:rotate-180 ${r.done ? "text-fg-muted" : "text-primary"}`}
                />
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Title + «N מתוך M» — the one heading both modes share. */
function CardHead({ title, done, total, t }) {
  return (
    <>
      <h2 className="font-headline-lg text-xl md:text-2xl font-bold text-primary" aria-live="polite">
        {title}
      </h2>
      <p className="text-sm text-fg-muted mt-1" data-testid="completeness-counter">
        {t("counter", { done, total })}
      </p>
    </>
  );
}

// MEH-2883: `footer` — for a business in `draft`, the dashboard passes the
// submit action (DraftSubmitBanner variant="actions"). MEH-3659: it renders
// only once every row is done, under «הכול מוכן».
export default function ProfileCompletenessCard({ producer, footer = null, onPhoneVerified }) {
  const t = useTranslations("dashboard.producer.completeness");
  // Rows that are also gate codes read the banner's label, so one string has
  // one key (messages-hygiene guard, MEH-3657).
  const tMissing = useTranslations("dashboard.producer.draft.missing");
  if (!producer) return null;

  if (producer.status === "draft") {
    const rows = buildDraftRows(producer);
    const doneCount = rows.filter((r) => r.done).length;
    const remaining = rows.length - doneCount;
    const ready = remaining === 0;
    return (
      <div
        data-testid="profile-completeness-card"
        data-mode="draft"
        className="bg-background border border-border rounded-lg p-6 md:p-8 mb-8"
      >
        <CardHead
          title={ready ? t("draft_ready") : t("draft_headline", { count: remaining })}
          done={doneCount}
          total={rows.length}
          t={t}
        />
        <Checklist
          rows={rows}
          label={t("checklist_aria")}
          labelOf={(row) =>
            row.gateLabel ? tMissing(row.gateLabel)
              : SHARED_GATE_LABELS.has(row.key) ? tMissing(row.key)
                : t(`draft_steps.${row.key}`)}
          t={t}
          openContent={(r) =>
            r.key === "phone_verified" ? (
              <div data-testid="draft-phone-verify">
                <PhoneVerifyCard variant="inline" phone={producer.phone} onVerified={() => onPhoneVerified?.()} />
              </div>
            ) : r.key === "email_verified" ? (
              <EmailResend t={t} />
            ) : null
          }
        />
        {/* Not a gate item: a licence-required category without a number can
            be submitted, but cannot be approved (MEH-3026). One line, a link
            to the licence card. */}
        {licenseMissingForProfile(producer) && (
          <Link
            href={`${EDIT_HUB}#license`}
            className="mt-3 inline-flex min-h-touch items-center text-sm text-primary underline underline-offset-2 focus-ring rounded"
            data-testid="completeness-license-note"
          >
            {t("license_note")}
          </Link>
        )}
        {ready && footer && <div className="mt-5" data-testid="completeness-footer">{footer}</div>}
      </div>
    );
  }

  const { missing } = producerCompleteness(producer);
  const steps = buildSteps(producer, new Set(missing));
  const doneCount = steps.filter((s) => s.done).length;

  // Complete → collapse to a single confirmation line (the card never fully
  // disappears, per the locked design decision).
  if (doneCount === steps.length) {
    return (
      <div
        data-testid="profile-completeness-card"
        className="bg-background border border-border rounded-lg px-6 py-4 mb-8"
        role="status"
      >
        <div className="flex items-center gap-3">
          <Check size={20} weight="bold" className="text-primary shrink-0" aria-hidden="true" />
          <p className="font-headline-md text-base font-bold text-primary">
            {t("green_headline")}
          </p>
        </div>
        {footer && <div className="mt-4">{footer}</div>}
      </div>
    );
  }

  // MEH-3659: after submission — «לשפר את העמוד», N מתוך M, one open row.
  // The WhatsApp row stays a link to the reverify card on the dashboard.
  return (
    <div
      data-testid="profile-completeness-card"
      data-mode="improve"
      className="bg-background border border-border rounded-lg p-6 md:p-8 mb-8"
    >
      <CardHead title={t("improve_headline")} done={doneCount} total={steps.length} t={t} />
      <Checklist rows={steps} label={t("checklist_aria")} labelOf={(row) => t(`steps.${row.key}`)} t={t} />
      {footer && <div className="mt-6 border-t border-border pt-5">{footer}</div>}
    </div>
  );
}
