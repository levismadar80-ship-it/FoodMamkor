"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import CitySearch from "@/components/CitySearch";
import BagRow from "@/components/rescue/BagRow";
import HubAlertHint from "@/components/HubAlertHint";
import { fetchOffers } from "@/lib/rescue";

/**
 * Module:   RescueList
 * Purpose:  «הערב בשכונה» — today's bags for a town, with the five states a
 *           conditional list owes (loading / none / one / many / failed).
 * Does NOT: gate on the feature flag. Its callers do, so this component can
 *           be rendered in a test without touching process.env.
 * Related:  components/rescue/BagRow.jsx, lib/rescue.js (fetchOffers parses
 *           with the generated Zod schema before this sees a row)
 * History:  MEH-2648 (creation); MEH-3117 (alert hint in the empty state)
 */
export default function RescueList({ initialCity = "", limit = null, heading = null }) {
  const t = useTranslations("rescue");
  // MEH-3013: the city field reads exactly as it does on the other hub tabs.
  const tHub = useTranslations("events.list");
  const [city, setCity] = useState(initialCity || "");
  const [offers, setOffers] = useState(null); // null = not loaded yet
  const [failed, setFailed] = useState(false);
  // Every load gets a number; only the latest one may write state. Without it
  // a slow town-less request that answers after the town's own request paints
  // another town's bags under this town's name (seen on staging 5/11: heading
  // «תל אביב-יפו», a Zichron bag below it).
  const latest = useRef(0);

  const load = useCallback(async (nextCity) => {
    const ticket = ++latest.current;
    setFailed(false);
    setOffers(null);
    try {
      const rows = await fetchOffers({ city: nextCity || undefined });
      if (ticket !== latest.current) return;
      setOffers(rows);
    } catch {
      if (ticket !== latest.current) return;
      // A failed fetch is NOT an empty list: "nothing tonight" and "we could
      // not ask" are different facts and get different copy.
      setFailed(true);
      setOffers([]);
    }
  }, []);

  useEffect(() => {
    // The town can arrive after first render (it is read from localStorage in
    // an effect), so the field follows it — or it shows the placeholder while
    // the list is filtered by a town the field does not name.
    setCity(initialCity || "");
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
        label={tHub("filter_city_label")}
        placeholder={tHub("filter_city_placeholder")}
        id="rescue-city"
        className="md:max-w-xs"
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
        <div className="space-y-4">
          <p className="font-body-sm text-sm text-fg-muted" data-testid="rescue-list-empty">
            {city ? t("list.empty_city", { city }) : t("list.empty")}
          </p>
          {/* MEH-3117: the way out of «no bags» — the follower alert. */}
          <HubAlertHint kind="rescue" align="start" />
        </div>
      )}

      {shown && shown.length > 0 && (
        <>
          <ul className="border-t border-border" data-testid="rescue-list-rows">
            {shown.map((offer) => (
              <li key={offer.id}>
                <BagRow offer={offer} headingTag={heading ? "h3" : "h2"} />
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
