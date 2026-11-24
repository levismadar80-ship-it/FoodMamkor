// @ts-check
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { rescueBagsEnabled } from "@/lib/rescue";
import RescueOfferPage from "./RescueOfferPage";

/**
 * Route:    /rescue/[offerId]
 * Purpose:  One surprise bag's own page (MEH-3586): everything a buyer needs
 *           before reserving — price against worth, pickup window, address and
 *           map, what is usually inside, allergens, how pickup works, the
 *           cancellation rule — and the reserve button.
 * Does NOT: exist while the pilot is off (notFound(), like /rescue), and is
 *           not indexed: a bag lives for one day, so a search result would
 *           point at a bag that is gone by the time anyone clicks it.
 *           Fetches the bag in the browser, because what the page shows after
 *           reserving depends on who is signed in.
 * Related:  backend/app/routers/rescue.py get_offer, lib/use-rescue-reservation.js
 * History:  MEH-3586 (creation)
 */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "rescue" });
  return {
    title: t("section.title"),
    description: t("page.description"),
    robots: { index: false, follow: true },
  };
}

export default async function RescueOfferRoute({ params }) {
  const { locale, offerId } = await params;
  setRequestLocale(locale);
  if (!rescueBagsEnabled()) notFound();
  return <RescueOfferPage offerId={offerId} />;
}
