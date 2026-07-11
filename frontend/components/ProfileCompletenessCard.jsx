"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, ArrowRight } from "@phosphor-icons/react";
import { producerCompleteness, COMPLETENESS_FIELDS } from "@/lib/producer-completeness";

/**
 * ProfileCompletenessCard — MEH-288.
 *
 * Module:   ProfileCompletenessCard
 * Purpose:  Surface a clear onboarding path to the business owner at the top
 *           of /producer/dashboard as a 4-step checklist (photo →
 *           categories+location → 3 products → primary contact) so a brand-new
 *           producer sees concrete next steps instead of three 0/0/0 analytics
 *           cards. Read-only consumer of the shared completeness heuristic.
 * Does NOT: own the completeness logic — that lives in
 *           lib/producer-completeness.js (heuristic; never edited here) and is
 *           shared with the admin producers list. Does not mutate producer data
 *           or hit any API. The "3 products" step is card-only (MEH-1106 B1) —
 *           it never enters the shared heuristic, so the admin list is
 *           unaffected. Does not touch ChangesRequestedBanner (separate admin
 *           channel).
 * Related:  app/[locale]/producer/dashboard/page.js (mount, above analytics);
 *           lib/producer-completeness.js:24 (the heuristic);
 *           lib/badges.js:125 (PRODUCTS_MIN — same "3 products" threshold);
 *           app/[locale]/producer/dashboard/edit/page.js (deep-link anchors).
 * History:  MEH-288 (creation) — unblocks MEH-290 onboarding-tour step 1.
 *           MEH-897 (state-progressive checklist). MEH-1092 (F3 de-red).
 *           MEH-1106 (4-step checklist; card-only products step, B1).
 *
 * States:
 *   complete (4/4 steps) — collapses to a single confirmation line.
 *   incomplete           — progress ring + 4-step checklist, each row a
 *                          deep-link to its editor section, plus an emphasized
 *                          next-step box and CTA. Never red (MEH-1092) — a
 *                          partial profile is progress, not a failure.
 */

// The 4 checklist steps drive the ring + percent (goal-gradient). Named per
// exec §10. Steps ①②④ derive from the shared heuristic (image, category+city+
// location, contact); step ③ (products) is card-only per MEH-1106 B1.
const STEP_COUNT = 4;

// Card-only "3 products" threshold. Mirrors the auto-badge rule so both
// surfaces agree on what "enough products" means.
// REUSES: frontend/lib/badges.js:125 (PRODUCTS_MIN).
const PRODUCTS_MIN = 3;

// Canonical profile-editor hub. Every business field is editable here; the
// per-step deep-links target section anchors added on the edit page
// (edit/page.js — id="profile-*"). Named per exec §10.
const EDIT_HUB = "/producer/dashboard/edit";

// Ring stroke per state. Raw hex in the SVG stroke attribute follows the
// existing inline-SVG precedent in the dashboard (ViewsLineChart, page.js:613).
// MEH-1092 (F3): incomplete never uses red — a partial profile is progress, not
// a failure. Incomplete uses the gold token (#896714); complete uses the
// primary token (#2e6853). No threat colour.
const RING_STROKE = {
  incomplete: "#896714",
  complete: "#2e6853",
};

function ProgressRing({ percent, tone, label }) {
  const size = 56;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (percent / 100) * circ;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="shrink-0"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#e5dfd3"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={RING_STROKE[tone] || RING_STROKE.complete}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        // Start the arc at 12 o'clock and sweep clockwise (visual default reads
        // best regardless of text direction — the ring is direction-neutral).
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize="14"
        fontWeight="700"
        fill="#1c1a17"
      >
        {percent}%
      </text>
    </svg>
  );
}

// Build the 4 checklist steps from the shared heuristic + the card-only
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

  return [
    { key: "image", done: has("image"), href: `${EDIT_HUB}#profile-images` },
    {
      key: "location",
      // "Categories + location" = category filled AND the location pair
      // (city + coords/delivery) filled.
      done: has("category") && has("city") && has(locationSlug),
      href: `${EDIT_HUB}#profile-categories`,
    },
    {
      key: "products",
      done: productsCount >= PRODUCTS_MIN,
      href: `${EDIT_HUB}#profile-products`,
    },
    { key: "contact", done: has("contact"), href: `${EDIT_HUB}#profile-contact` },
  ];
}

export default function ProfileCompletenessCard({ producer }) {
  const t = useTranslations("dashboard.producer.completeness");
  if (!producer) return null;

  const { missing } = producerCompleteness(producer);
  const missingLabels = new Set(missing);
  const steps = buildSteps(producer, missingLabels);
  const doneCount = steps.filter((s) => s.done).length;
  const percent = Math.round((doneCount / STEP_COUNT) * 100);
  const isComplete = doneCount === STEP_COUNT;
  const firstTodo = steps.find((s) => !s.done);

  // Complete → collapse to a single confirmation line (the card never fully
  // disappears, per the locked design decision).
  if (isComplete) {
    return (
      <div
        className="bg-background border border-border rounded-[16px] px-6 py-4 mb-8 flex items-center gap-3"
        role="status"
      >
        <Check size={20} weight="bold" className="text-primary shrink-0" aria-hidden="true" />
        <p className="font-headline-md text-base font-bold text-primary">
          {t("green_headline")}
        </p>
      </div>
    );
  }

  // Percent lands on 0/25/50/75 for the 4-step model. >70 (i.e. 75%, 3 of 4)
  // reads as "almost there"; below that is the neutral progress headline. Calm
  // idiom (MEH-1092): gold ring, never red, for every incomplete state.
  const headline =
    percent > 70
      ? t("yellow_high_headline", { percent })
      : t("yellow_low_headline", { percent });

  return (
    <div className="bg-background border border-border rounded-[16px] p-6 md:p-8 mb-8">
      <div className="flex items-start gap-4">
        <ProgressRing
          percent={percent}
          tone="incomplete"
          label={t("ring_aria", { percent })}
        />
        <div className="flex-1 min-w-0">
          <h2
            className="font-headline-lg text-xl md:text-2xl font-bold text-primary"
            aria-live="polite"
          >
            {headline}
          </h2>
          <p className="text-sm md:text-base text-fg-muted mt-1">{t("checklist_sub")}</p>

          {/* 4-step checklist. Done → text-primary ✓ + label; remaining →
              text-fg-muted label, no marker (per the MEH-897 locked design). Each
              row deep-links to its editor section. */}
          <ul className="mt-4 space-y-1" aria-label={t("checklist_aria")}>
            {steps.map((s) => (
              <li key={s.key}>
                <Link
                  href={s.href}
                  className="flex items-center gap-2 text-sm rounded-[8px] -mx-2 px-2 py-1.5 hover:bg-primary/5 transition-colors focus-ring"
                >
                  <span
                    className="inline-flex w-4 justify-center text-primary"
                    aria-hidden="true"
                  >
                    {s.done ? <Check size={14} weight="bold" /> : null}
                  </span>
                  <span className={s.done ? "text-text" : "text-fg-muted"}>
                    {t(`steps.${s.key}`)}
                  </span>
                  <span className="sr-only">
                    {s.done ? t("checklist_done") : t("checklist_todo")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {/* Top remaining step emphasized as the primary next-step. Box = faint
              primary tint via opacity (REUSES: KashrutBadgeStrip.jsx:53). */}
          {firstTodo && (
            <div className="mt-4 bg-primary/5 border border-primary/20 rounded-[12px] p-4">
              <p className="text-sm text-text">
                <span className="font-semibold">{t("next_step_prefix")}</span>{" "}
                {t(`steps.${firstTodo.key}`)}
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="mt-5">
        <Link
          href={firstTodo ? firstTodo.href : EDIT_HUB}
          aria-label={t("cta_aria")}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-6 rounded-full font-medium bg-action-primary hover:bg-action-primary-hover text-white transition-colors focus-ring"
        >
          {t("cta")}
          {/* MEH-990: raw → dingbat → Phosphor ArrowRight; rtl:rotate-180 = reading-forward in he (MEH-938 pattern) */}
          <ArrowRight size={16} weight="bold" aria-hidden="true" className="rtl:rotate-180" />
        </Link>
      </div>
    </div>
  );
}
