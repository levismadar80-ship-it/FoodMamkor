"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { producerCompleteness } from "@/lib/producer-completeness";

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
const FIELD_KEY = {
  "עיר": "city",
  "קואורדינטות": "coords",
  "אזורי משלוח": "delivery",
  "פרטי קשר (טלפון/אינסטגרם)": "contact",
  "קטגוריה": "category",
  "תמונה": "image",
};

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
        <span className="text-primary text-lg font-bold" aria-hidden="true">✓</span>
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

  const nextKey = FIELD_KEY[missing[0]] || "image";

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
          <p className="text-sm text-text mt-3">
            <span className="font-semibold">{t("next_step_prefix")}</span>{" "}
            {t(`fields.${nextKey}`)}
          </p>
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
