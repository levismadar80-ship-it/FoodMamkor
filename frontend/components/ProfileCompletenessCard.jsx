"use client";

import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { Check } from "@phosphor-icons/react";
import { producerCompleteness, COMPLETENESS_FIELDS } from "@/lib/producer-completeness";

/**
 * ProfileCompletenessCard — MEH-288.
 *
 * Module:   ProfileCompletenessCard
 * Purpose:  Surface the existing producerCompleteness() heuristic to the
 *           business owner at the top of /producer/dashboard so a brand-new
 *           producer sees one clear "next step" instead of three 0/0/0
 *           analytics cards. Read-only consumer of the heuristic.
 * Does NOT: own the completeness logic — that lives in
 *           lib/producer-completeness.js (heuristic; never edited here). Does
 *           not mutate producer data or hit any API.
 * Related:  app/[locale]/producer/dashboard/page.js (mount, above analytics);
 *           lib/producer-completeness.js:10 (the heuristic).
 * History:  MEH-288 (creation) — unblocks MEH-290 onboarding-tour step 1.
 *
 * 4 visual states (priority + percent drive which renders):
 *   red                 — critical field missing (no map / no contact)
 *   yellow (≤70%)       — secondary fields missing
 *   yellow (>70%)       — "almost there"
 *   green (0 missing)   — collapses to a single confirmation line
 */

// Total fields the heuristic can flag. city + (coords XOR delivery-areas) +
// contact + category + image = 5 max for any producer shape (the coords /
// delivery-areas pair is mutually exclusive on isDeliveryOnly). Kept here as a
// named constant per exec §10.
const TOTAL_FIELDS = 5;

// Map a raw Hebrew missing-field string (returned verbatim by the heuristic)
// to a stable i18n key for the "next step" label, so the dashboard stays fully
// localised. Two fields get a friendlier label than the heuristic's internal
// one (קואורדינטות → "מיקום על המפה", תמונה → "תמונה ראשית"), per the spec.
// MEH-831: label→slug derived by inverting COMPLETENESS_FIELDS (the heuristic's
// own labels) — no mirrored Hebrew literals to drift out of sync.
const FIELD_KEY = Object.fromEntries(
  Object.entries(COMPLETENESS_FIELDS).map(([slug, label]) => [label, slug]),
);

// Ring stroke per priority. Raw hex in the SVG stroke attribute follows the
// existing inline-SVG precedent in the dashboard (ViewsLineChart, page.js:613).
const RING_STROKE = {
  red: "#B91C1C",
  yellow: "#C98600",
  green: "#2e6853",
};

function ProgressRing({ percent, priority, label }) {
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
        stroke={RING_STROKE[priority] || RING_STROKE.green}
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

export default function ProfileCompletenessCard({ producer }) {
  const t = useTranslations("dashboard.producer.completeness");
  const locale = useLocale();
  if (!producer) return null;

  const { missing, priority } = producerCompleteness(producer);
  const filled = TOTAL_FIELDS - missing.length;
  const percent = Math.round((filled / TOTAL_FIELDS) * 100);
  const isComplete = missing.length === 0;

  // Green + nothing missing → collapse to a single confirmation line (the card
  // never fully disappears, per the locked design decision).
  if (priority === "green" && isComplete) {
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

  // Headline + sub per state. percent never lands exactly on 70 for the 5-field
  // model (steps of 20%), so >70 cleanly separates "almost there" from the
  // lower yellow band.
  let headline;
  let sub;
  if (priority === "red") {
    headline = t("red_headline");
    sub = t("red_sub");
  } else if (percent > 70) {
    headline = t("yellow_high_headline", { percent });
    sub = t("yellow_high_sub", { count: missing.length });
  } else {
    headline = t("yellow_low_headline", { percent });
    sub = t("yellow_low_sub");
  }

  // Map the heuristic's raw HE label → a friendlier i18n key. The heuristic is
  // scope-locked (never edited here), but defend against a future rename: an
  // unmapped value falls back to the heuristic's OWN raw label rather than
  // silently mislabelling the next step (e.g. always showing "תמונה ראשית").
  const nextKey = FIELD_KEY[missing[0]];
  const nextStepLabel = nextKey ? t(`fields.${nextKey}`) : missing[0];

  // MEH-897: yellow >70 ("almost there") swaps the single next-step line for a
  // 5-row checklist (completed + remaining). Build the applicable-field list
  // here, mirroring the coords XOR delivery split the heuristic itself makes
  // per producer shape (lib/producer-completeness.js:25 isDeliveryOnly) — never
  // both apply, so the list is always exactly 5. Each row reuses the existing
  // fields.* key; membership in `missing` (raw HE labels) marks remaining.
  // he-only until MEH-472 sweeps the English strings: the checklist's a11y
  // keys (checklist_*) live in he.json only, so an /en visit would surface raw
  // key paths in aria-label/sr-only. Gate to Hebrew → /en falls back to the
  // localized inline next-step line (keys present in both). REUSES the MEH-884
  // trust-strip he-only locale gate.
  const isYellowHigh = priority !== "red" && percent > 70 && locale === "he";
  const isDeliveryOnly =
    producer.has_physical_location === false && producer.offers_delivery;
  const checklistSlugs = [
    "city",
    isDeliveryOnly ? "delivery" : "coords",
    "contact",
    "category",
    "image",
  ];
  const missingLabels = new Set(missing);

  return (
    <div className="bg-background border border-border rounded-[16px] p-6 md:p-8 mb-8">
      <div className="flex items-start gap-4">
        <ProgressRing
          percent={percent}
          priority={priority}
          label={t("ring_aria", { percent })}
        />
        <div className="flex-1 min-w-0">
          <h2
            className="font-headline-lg text-xl md:text-2xl font-bold text-primary"
            aria-live="polite"
          >
            {headline}
          </h2>
          <p className="text-sm md:text-base text-fg-muted mt-1">{sub}</p>
          {isYellowHigh ? (
            <>
              {/* 5-row checklist: completed → text-primary ✓ + label;
                  remaining → text-fg-muted label, no marker (per locked design). */}
              <ul className="mt-4 space-y-2" aria-label={t("checklist_aria")}>
                {checklistSlugs.map((slug) => {
                  const done = !missingLabels.has(COMPLETENESS_FIELDS[slug]);
                  return (
                    <li key={slug} className="flex items-center gap-2 text-sm">
                      <span
                        className="inline-flex w-4 justify-center text-primary"
                        aria-hidden="true"
                      >
                        {done ? <Check size={14} weight="bold" /> : null}
                      </span>
                      <span className={done ? "text-text" : "text-fg-muted"}>
                        {t(`fields.${slug}`)}
                      </span>
                      <span className="sr-only">
                        {done ? t("checklist_done") : t("checklist_todo")}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {/* Top remaining field emphasized as the primary next-step. Box =
                  faint primary tint via opacity (REUSES: KashrutBadgeStrip.jsx:53). */}
              <div className="mt-4 bg-primary/5 border border-primary/20 rounded-[12px] p-4">
                <p className="text-sm text-text">
                  <span className="font-semibold">{t("next_step_prefix")}</span>{" "}
                  {nextStepLabel}
                </p>
              </div>
            </>
          ) : (
            <p className="text-sm text-text mt-3">
              <span className="font-semibold">{t("next_step_prefix")}</span>{" "}
              {nextStepLabel}
            </p>
          )}
        </div>
      </div>
      <div className="mt-5">
        <Link
          href="/settings"
          aria-label={t("cta_aria")}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-6 rounded-full font-medium bg-action-primary hover:bg-action-primary-hover text-white transition-colors focus-ring"
        >
          {t("cta")}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}
