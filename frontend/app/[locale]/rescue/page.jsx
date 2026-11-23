// @ts-check
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import HubShell from "@/components/HubShell";
import { HUB_CONTENT_CLASS } from "@/lib/hub-layout";
import HubFaq from "@/components/HubFaq";
import RescueList from "@/components/rescue/RescueList";
import { rescueBagsEnabled } from "@/lib/rescue";
import { buildAlternates } from "@/lib/i18n-seo";
import { getHubCount } from "@/lib/listing-supply";

/**
 * Route:    /rescue
 * Purpose:  «הערב בשכונה» — the full list of today's rescue bags.
 * Does NOT: exist while the pilot is off. notFound() rather than an empty
 *           page, matching the backend, which 404s every /rescue route behind
 *           the same switch — one answer from both layers.
 * History:  MEH-2648 (creation) · MEH-3013 (shared HubShell head)
 */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "rescue" });
  // MEH-3177: without its own alternates the page inherited the layout's
  // home canonical + hreflang, which tells Google /rescue is a copy of /.
  return {
    title: t("page.title"),
    description: t("page.description"),
    alternates: buildAlternates("/rescue", locale),
  };
}

// MEH-3737: the questions shown, in order (messages rescue.faq.items).
const RESCUE_FAQ = ["contents", "allergens", "pay", "cancel", "no_show", "mine"];

// MEH-3049: the locale is passed explicitly and set for the request. Without it
// next-intl falls back to headers(), which turned /rescue into a per-request
// route on staging: the hub tab could not be prefetched, so every switch from
// /events showed the whole-page loader and rebuilt the hero. CI never saw it —
// the flag is off there, notFound() runs first and the 404 prerenders.
// Guarded by __tests__/HubRoutesStaticGuard.test.js.
export default async function RescuePage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!rescueBagsEnabled()) notFound();

  // MEH-3013: the hub's shared head (photo hero + tab row) — the same frame
  // as /events, /experiences and /group-buys. Copy is the page's own H1 and
  // lead (Sapir 11/11) plus the hub strip's existing eyebrow (home.whats_on.eyebrow — «קרוב לבית» /
  // "Close to home"; events.list.eyebrow_events says "EVENTS" in en); no new strings.
  // MEH-3076: the group-buys tab's supply, so the tab row is decided on the
  // server (a lone «סלי הפתעה» tab is not drawn). Cached like the sitemap's,
  // and read in parallel with the copy so a slow count adds no serial wait.
  const [t, tHome, groupBuysCount] = await Promise.all([
    getTranslations({ locale, namespace: "rescue" }),
    getTranslations({ locale, namespace: "home.whats_on" }),
    getHubCount("groupBuys"),
  ]);

  return (
    // A div, not <main>: the layout already owns the main landmark.
    <div data-testid="rescue-page">
      <HubShell
        active="rescue"
        eyebrow={tHome("eyebrow")}
        title={t("page.title")}
        subtitle={t("page.lead")}
        serverSupply={{ groupBuys: groupBuysCount }}
      />
      <div className={`${HUB_CONTENT_CLASS} pt-4 pb-16`}>
        <RescueList />
      </div>
      {/* MEH-3737: common questions under the list, with FAQPage JSON-LD. */}
      <HubFaq namespace="rescue.faq" keys={RESCUE_FAQ} anchor="faq" path="/rescue" />
    </div>
  );
}
