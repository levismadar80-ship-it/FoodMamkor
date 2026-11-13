import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import HubShell from "@/components/HubShell";
import { HUB_CONTENT_CLASS } from "@/lib/hub-layout";
import RescueList from "@/components/rescue/RescueList";
import { rescueBagsEnabled } from "@/lib/rescue";

/**
 * Route:    /rescue
 * Purpose:  «הערב בשכונה» — the full list of today's rescue bags.
 * Does NOT: exist while the pilot is off. notFound() rather than an empty
 *           page, matching the backend, which 404s every /rescue route behind
 *           the same switch — one answer from both layers.
 * History:  MEH-2648 (creation) · MEH-3013 (shared HubShell head)
 */
export async function generateMetadata() {
  const t = await getTranslations("rescue");
  return { title: t("page.title"), description: t("page.description") };
}

export default async function RescuePage() {
  if (!rescueBagsEnabled()) notFound();
  const t = await getTranslations("rescue");

  // MEH-3013: the hub's shared head (photo hero + tab row) — the same frame
  // as /events, /experiences and /group-buys. Copy is the page's own H1 and
  // lead (Sapir 11/11) plus the hub strip's existing eyebrow (home.whats_on.eyebrow — «קרוב לבית» /
  // "Close to home"; events.list.eyebrow_events says "EVENTS" in en); no new strings.
  const tHome = await getTranslations("home.whats_on");

  return (
    // A div, not <main>: the layout already owns the main landmark.
    <div data-testid="rescue-page">
      <HubShell
        active="rescue"
        eyebrow={tHome("eyebrow")}
        title={t("page.title")}
        subtitle={t("page.lead")}
      />
      <div className={`${HUB_CONTENT_CLASS} pt-4 pb-16`}>
        <RescueList />
      </div>
    </div>
  );
}
