"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import CitySearch from "@/components/CitySearch";
import BagRow from "@/components/rescue/BagRow";
import { fetchOffers } from "@/lib/rescue";

/**
 * Module:   RescueList
 * Purpose:  «הערב בשכונה» — today's bags for a town, with the five states a
 *           conditional list owes (loading / none / one / many / failed).
 * Does NOT: gate on the feature flag. Its callers do, so this component can
 *           be rendered in a test without touching process.env.
 * Related:  components/rescue/BagRow.jsx, lib/rescue.js (fetchOffers parses
 *           with the generated Zod schema before this sees a row)
 * History:  MEH-2648 (creation)
 */
export default function RescueList({ initialCity = "", limit = null, heading = null }) {
  const t = useTranslations("rescue");
  const [city, setCity] = useState(initialCity);
  const [offers, setOffers] = useState(null); // null = not loaded yet
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (nextCity) => {
    setFailed(false);
    setOffers(null);
    try {
      const rows = await fetchOffers({ city: nextCity || undefined });
      setOffers(rows);
    } catch {
      // A failed fetch is NOT an empty list: "nothing tonight" and "we could
      // not ask" are different facts and get different copy.
      setFailed(true);
      setOffers([]);
    }
  }, []);

  useEffect(() => {
    load(initialCity);
  }, [load, initialCity]);

  const shown = limit && offers ? offers.slice(0, limit) : offers;

  return (
    <section data-testid="rescue-list" className="space-y-4">
      {heading}

      <CitySearch
        value={city}
        onChange={setCity}
        onSubmit={() => load(city)}
        label={t("list.city_label")}
        placeholder={t("list.city_placeholder")}
        id="rescue-city"
      />

      {offers === null && (
        <p className="font-body-sm text-sm text-fg-muted" data-testid="rescue-list-loading">
          {t("list.loading")}
        </p>
      )}

      {failed && (
        <p className="font-body-sm text-sm text-error" data-testid="rescue-list-error">
          {t("list.failed")}
        </p>
      )}

      {offers !== null && !failed && offers.length === 0 && (
        <p className="font-body-sm text-sm text-fg-muted" data-testid="rescue-list-empty">
          {city ? t("list.empty_city", { city }) : t("list.empty")}
        </p>
      )}

      {shown && shown.length > 0 && (
        <>
          <ul className="space-y-3" data-testid="rescue-list-rows">
            {shown.map((offer) => (
              <li key={offer.id}>
                <BagRow offer={offer} />
              </li>
            ))}
          </ul>
          {/* The count line distinguishes "one bag" from "nine" without a
              second list render — the 0/1/many axis of the 5-state matrix. */}
          <p className="font-body-sm text-sm text-fg-muted" data-testid="rescue-list-count">
            {t("list.count", { count: shown.length })}
          </p>
        </>
      )}
    </section>
  );
}
