// @ts-check
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Basket } from "@phosphor-icons/react";

import CitySearch from "@/components/CitySearch";
import BagRow from "@/components/rescue/BagRow";
import HubAlertHint from "@/components/HubAlertHint";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonBlock } from "@/components/Skeleton";
import { bagDay, fetchOffers } from "@/lib/rescue";
import useIsraelToday from "@/lib/use-israel-today";

/**
 * Module:   RescueList
 * Purpose:  «הערב בשכונה» — today's bags for a town, with the five states a
 *           conditional list owes (loading / none / one / many / failed).
 * Does NOT: gate on the feature flag. Its callers do, so this component can
 *           be rendered in a test without touching process.env.
 * Related:  components/rescue/BagRow.jsx, lib/rescue.js (fetchOffers parses
 *           with the generated Zod schema before this sees a row)
 * History:  MEH-2648 (creation); MEH-3117 (alert hint in the empty state);
 *           MEH-3626 (empty state + loading skeleton shaped like /group-buys);
 *           MEH-3702 (tomorrow's bags under «מחר», after today's)
 */
export default function RescueList({ initialCity = "", limit = null, heading = null }) {
  const day = useIsraelToday(); // MEH-3805: «מחר» turns into «היום» at midnight
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
  // MEH-3702: today's bags, then tomorrow's. The day headings appear only once
  // a tomorrow bag is listed, so a list of today's bags looks as it did.
  const today = (shown || []).filter((o) => bagDay(o.date, day) === "today");
  const tomorrow = (shown || []).filter((o) => bagDay(o.date, day) === "tomorrow");
  const groups = tomorrow.length
    ? [
        { key: "today", rows: today },
        { key: "tomorrow", rows: tomorrow },
      ].filter((g) => g.rows.length > 0)
    : [{ key: null, rows: today }];
  const rowTag = heading ? "h3" : "h2";

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

      {/* MEH-3626: a skeleton, as on the other hub tabs — the loading line
          appeared above the field and vanished, which read as a jump. The
          words stay for screen readers (role="status" permits aria-label). */}
      {offers === null && (
        <div role="status" aria-busy="true" aria-label={t("list.loading")} data-testid="rescue-list-loading" className="border-t border-border">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3 py-4 border-b border-border">
              <SkeletonBlock className="w-16 h-16 rounded-lg shrink-0" />
              <div className="flex-1 grid gap-2 content-start">
                <SkeletonBlock className="w-2/3 h-4 rounded" />
                <SkeletonBlock className="w-1/2 h-3 rounded" />
                <SkeletonBlock className="w-24 h-5 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {failed && (
        <p className="font-body-sm text-sm text-error" data-testid="rescue-list-error">
          {t("list.failed")}
        </p>
      )}

      {offers !== null && !failed && offers.length === 0 && (
        // MEH-3626: the same empty state as /group-buys (GroupBuysClient.jsx,
        // MEH-2994): icon disc, bold title, one line under it, then the way
        // out. Copy approved by Sapir in the thread, 21/11.
        <div data-testid="rescue-list-empty">
          <EmptyState
            icon={Basket}
            circle
            size="md"
            title={city ? t("list.empty_title_city", { city }) : t("list.empty_title")}
            description={t("list.empty_subtitle")}
            headingLevel={heading ? 3 : 2}
          />
          {/* MEH-3117: the way out of «no bags» — the follower alert. */}
          <HubAlertHint kind="rescue" className="-mt-6 pb-12" />
        </div>
      )}

      {shown && shown.length > 0 && (
        <>
          {groups.map((group) => (
            <div key={group.key || "all"} data-testid={group.key ? `rescue-list-group-${group.key}` : undefined}>
              {group.key && (
                <p className="font-headline-md text-base font-black text-text mb-2" data-testid="rescue-list-day">
                  {/* The same «היום» / «מחר» the events list shows. */}
                  {tHub(group.key === "tomorrow" ? "when_tomorrow" : "when_today")}
                </p>
              )}
              <ul className="border-t border-border" data-testid="rescue-list-rows">
                {group.rows.map((offer) => (
                  <li key={offer.id}>
                    <BagRow offer={offer} headingTag={rowTag} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
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
