"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

import RescueList from "@/components/rescue/RescueList";
import { rescueBagsEnabled } from "@/lib/rescue";

/**
 * Module:   RescueHomeModule
 * Purpose:  The home page's «מה נשאר היום ב{עיר}» block — at most three rows
 *           and a link into the full list.
 * Does NOT: fetch or format anything itself; it is the flag gate, the heading
 *           and the cap, and RescueList does the rest.
 * Related:  app/[locale]/home/HomeClient.jsx (the slot),
 *           components/rescue/RescueList.jsx
 * History:  MEH-2648 (creation)
 */
const HOME_ROWS = 3;

export default function RescueHomeModule({ city = "" }) {
  const t = useTranslations("rescue");
  // Returns null — not an empty section — so a dark pilot leaves no margin,
  // no heading and nothing for a screen reader to announce.
  if (!rescueBagsEnabled()) return null;

  return (
    <section className="max-w-6xl mx-auto px-4 mt-10" data-testid="rescue-home-module">
      <RescueList
        initialCity={city}
        limit={HOME_ROWS}
        heading={
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-headline-md text-lg font-black text-text">
              {city ? t("home.title_city", { city }) : t("home.title")}
            </h2>
            <Link
              href="/rescue"
              data-testid="rescue-home-all"
              className="font-body-sm text-sm text-primary font-semibold hover:underline shrink-0"
            >
              {t("home.all")}
            </Link>
          </div>
        }
      />
    </section>
  );
}
