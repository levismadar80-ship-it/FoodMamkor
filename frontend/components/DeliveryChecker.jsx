"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { formatPrice } from "@/lib/utils";
import CitySearch from "@/components/CitySearch";
import CoverageRequestCta from "@/components/CoverageRequestCta";
import { useUserCity } from "@/lib/use-user-city";

/**
 * Module:   DeliveryChecker
 * Purpose:  "מגיעים אלייך?" — the visitor types her city and gets an immediate
 *           yes/no instead of scanning a long grouped delivery list. Standard
 *           industry delivery-checker pattern (Wolt / CSA / postcode checkers).
 * Touches:  nothing — 100% client-side over the delivery data already rendered
 *           on the producer page. No API call, no storage, no analytics.
 * Does NOT: own the delivery list itself — the grouped day-rows, CompactCities
 *           and pickup rows all stay in `DeliveryBlock.jsx` and are untouched.
 *           This checker is ADDITIVE (MEH-1435 lock: never hide cities behind
 *           a search box). Regional fallback is MEH-1487's, radius/polygon is
 *           MEH-1257's — exact-city matching only here.
 * Related:  frontend/components/DeliveryBlock.jsx:216 (mount point);
 *           frontend/components/CitySearch.jsx:35 (canonical city input,
 *           MEH-1455 — reused as-is, no modification);
 *           backend/app/services/delivery_validation.py (exclusion invariant).
 * History:  MEH-1536 (creation).
 */

// MEH-1536: exact-city matching only — trimmed + case-insensitive. NO fuzzy
// matching, no geolocation, no region fallback (over-engineering guard).
const norm = (s) => (s || "").trim().toLowerCase();

/**
 * Pure match logic, exported for unit coverage. Returns null while the field is
 * empty (nothing to answer yet), otherwise one of:
 *   { status: "yes_nationwide", city }        — nationwide, city not excluded
 *   { status: "yes", city, day, minOrder }    — an explicit delivery_areas row
 *   { status: "no", city }                    — excluded, or no matching row
 *
 * `city` is the CANONICAL spelling when a row/exclusion matched, so the answer
 * echoes the producer's own spelling rather than the visitor's casing.
 */
export function matchDeliveryCity({ city, nationwide, excluded = [], areas = [] }) {
  const q = norm(city);
  if (!q) return null;
  const typed = (city || "").trim();

  // MEH-1255: nationwide is an EXCLUSION model — everywhere except the list.
  if (nationwide) {
    const hit = excluded.find((c) => norm(c) === q);
    return hit ? { status: "no", city: hit } : { status: "yes_nationwide", city: typed };
  }

  const area = areas.find((a) => norm(a?.city) === q);
  if (!area) return { status: "no", city: typed };
  return {
    status: "yes",
    city: area.city,
    day: area.delivery_day || null,
    minOrder: area.min_order ?? null,
  };
}

// status → i18n key, so the verdict line stays a flat lookup rather than a
// nested ternary. Every status a match can return must appear here.
const VERDICT_KEY = {
  yes_nationwide: "checker.yes_nationwide",
  yes: "checker.yes",
  no: "checker.no",
};

export default function DeliveryChecker({
  offersDelivery = false,
  nationwide = false,
  excluded = [],
  areas = [],
  // MEH-1675: only for the coverage CTA below the negative verdict (phone +
  // id). The checker's own answer stays 100% client-side over the props above.
  producer = null,
}) {
  const t = useTranslations("group_buys.delivery");
  // Two states on purpose. `city` is what the field shows; `checked` is the
  // city the verdict below describes, and it is only set when the visitor
  // COMMITS one (picks a suggestion, or hits Enter) — never per keystroke:
  //   1. CitySearch's suggestion dropdown is absolutely positioned over the
  //      area right below the field, so a live verdict renders underneath it
  //      and is unreadable until the list closes (caught in MEH-1536 self-QA).
  //   2. Mid-word input is a prefix of the real city ("חיפ"), and exact
  //      matching would flash "לצערנו לא מגיעים" at someone who IS covered.
  // Editing the field clears the stale verdict rather than leaving an answer
  // that no longer matches what the field says.
  const [city, setCity] = useState("");
  const [checked, setChecked] = useState("");

  // MEH-1675: seed from the saved user_city so a visitor who already told us
  // where she is gets her answer — and, when it is "no", the coverage CTA —
  // without typing. Deliberately an EFFECT and not `useState(initial)`:
  // user_city lives in localStorage, which is unreadable during SSR, so an
  // initial value would be `null` on the server and desync on hydration.
  // One-shot by construction (`seeded` ref): once the visitor touches the
  // field, her input owns it and a later city-changed event must not yank
  // the verdict out from under her.
  const { city: userCity } = useUserCity();
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !userCity) return;
    seeded.current = true;
    setCity(userCity);
    setChecked(userCity);
  }, [userCity]);

  // Gate 1 (spec): only for producers that actually deliver.
  // Gate 2 (spec): nationwide with no exclusions — the answer is trivially
  //   "yes" for every city, so a checker would be pure noise.
  // Gate 3 (MEH-1536 judgment call, documented in the PR): not nationwide AND
  //   no delivery_areas rows — every possible answer would be "לא מגיעים",
  //   which contradicts the "משלוחים בתיאום מראש" line DeliveryBlock renders
  //   right below it. An always-negative checker is worse than none.
  const hasExclusions = nationwide && excluded.length > 0;
  const usable = offersDelivery && (hasExclusions || (!nationwide && areas.length > 0));
  if (!usable) return null;

  const result = matchDeliveryCity({ city: checked, nationwide, excluded, areas });
  const positive = result?.status === "yes" || result?.status === "yes_nationwide";
  // Secondary line: "{day} · מינימום {min}" — each half rendered only when the
  // row carries it. The ₪ amount is dir="ltr"-isolated (MEH-1168 P1 bidi).
  // Truthiness, not != null, so a 0 minimum reads as "no minimum" here exactly
  // as it does in the list row below (DeliveryBlock.jsx:41) — otherwise the
  // checker would claim "מינימום 0₪" for a row that renders nothing.
  const price = result?.minOrder ? formatPrice(result.minOrder) : null;
  const day = result?.status === "yes" ? result.day : null;

  return (
    <div className="mb-4 rounded-md border border-border bg-surface-card p-3" data-testid="delivery-checker">
      <div data-testid="delivery-checker-input">
        <CitySearch
          id="delivery-checker-city"
          value={city}
          onChange={(next) => {
            setCity(next);
            setChecked("");
          }}
          onSubmit={setChecked}
          label={t("checker.label")}
          labelVisible
          placeholder={t("checker.placeholder")}
        />
      </div>

      {/* aria-live so a screen-reader hears the verdict without moving focus.
          Always mounted (an element that appears cannot be announced reliably). */}
      <div
        aria-live="polite"
        className="mt-2 min-h-[1.25rem]"
        data-testid="delivery-checker-result"
        data-result={result?.status ?? "none"}
      >
        {result && (
          <>
            <p
              className={`flex items-center gap-1.5 text-sm font-medium ${
                positive ? "text-primary" : "text-text"
              }`}
            >
              {positive ? (
                <CheckCircle size={18} weight="fill" className="text-primary" aria-hidden="true" />
              ) : (
                <XCircle size={18} className="text-fg-muted" aria-hidden="true" />
              )}
              {t(VERDICT_KEY[result.status], { city: result.city })}
            </p>
            {(day || price) && (
              <p className="mt-0.5 text-[13px] text-fg-muted ms-6">
                {day}
                {day && price ? <span aria-hidden="true"> · </span> : null}
                {price && (
                  <>
                    {t("min_order")} <span dir="ltr">{price}</span>
                  </>
                )}
              </p>
            )}
            {/* MEH-1675: the ONLY mount of the coverage CTA, and only on a
                hard "no". A positive verdict never shows it, and because the
                checker itself renders at most once per page (single mount in
                DeliveryBlock.jsx:256) there is exactly one CTA block on the
                page in every state. */}
            {result.status === "no" && (
              <div className="ms-6">
                <CoverageRequestCta producer={producer} city={result.city} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
