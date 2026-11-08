"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

import BagRow from "@/components/rescue/BagRow";
import { fetchOffers, rescueBagsEnabled } from "@/lib/rescue";

/**
 * Module:   RescueHomeModule
 * Purpose:  The home page's «מה נשאר היום ב{עיר}» block — at most three rows
 *           and a link into the full list, ONLY when the visitor's town has
 *           bags today.
 * Does NOT: show an empty state, a loading line or a town field. No town, no
 *           bags, a failed fetch or a dark pilot all render nothing: a deals
 *           block for a town with no deals is noise on a magazine's home page
 *           (Uber Eats / Wolt only show offers that are in range). The town
 *           field and the 0-bags copy live on /rescue.
 * Related:  app/[locale]/home/HomeClient.jsx (the slot, after the businesses
 *           grid), components/rescue/BagRow.jsx, app/[locale]/rescue/page.jsx
 * History:  MEH-2648 (creation) · rescue-home redesign: own fetch, hidden
 *           when empty, moved below the businesses grid
 */
const HOME_ROWS = 3;

export default function RescueHomeModule({ city = "" }) {
  const t = useTranslations("rescue");
  const enabled = rescueBagsEnabled();
  // The answer is stored WITH the town it answers, and only shown while that
  // is still the town — so a town change hides the old rows at once and an
  // older answer arriving late can never paint under the new town's name.
  const [answer, setAnswer] = useState(null); // { city, rows }

  useEffect(() => {
    if (!enabled || !city) return;
    let current = true;
    fetchOffers({ city })
      .then((rows) => {
        if (current) setAnswer({ city, rows });
      })
      .catch(() => {
        if (current) setAnswer({ city, rows: [] });
      });
    return () => {
      current = false;
    };
  }, [enabled, city]);

  const offers = answer && answer.city === city ? answer.rows : null;
  if (!enabled || !city || !offers || offers.length === 0) return null;

  const total = offers.length;
  const shown = offers.slice(0, HOME_ROWS);

  return (
    <section className="max-w-7xl mx-auto px-4 pb-16" data-testid="rescue-home-module">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-headline-md text-lg md:text-2xl font-black text-text">
          {t("home.title_city", { city })}
        </h2>
        <Link
          href="/rescue"
          data-testid="rescue-home-all"
          className="font-body-sm text-sm text-primary font-semibold underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current shrink-0"
        >
          {total > 1 ? t("home.all_count", { count: total }) : t("home.all")}
        </Link>
      </div>
      <p className="font-body-sm text-sm text-fg-muted mt-1" data-testid="rescue-home-lead">
        {t("home.lead")}
      </p>
      <ul
        className="mt-4 border-t border-border lg:grid lg:grid-cols-3 lg:gap-x-6"
        data-testid="rescue-list-rows"
      >
        {shown.map((offer) => (
          <li key={offer.id}>
            <BagRow offer={offer} />
          </li>
        ))}
      </ul>
    </section>
  );
}
