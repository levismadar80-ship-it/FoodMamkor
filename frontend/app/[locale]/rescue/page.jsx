import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import RescueList from "@/components/rescue/RescueList";
import { rescueBagsEnabled } from "@/lib/rescue";

/**
 * Route:    /rescue
 * Purpose:  «הערב בשכונה» — the full list of today's rescue bags.
 * Does NOT: exist while the pilot is off. notFound() rather than an empty
 *           page, matching the backend, which 404s every /rescue route behind
 *           the same switch — one answer from both layers.
 * History:  MEH-2648 (creation)
 */
export async function generateMetadata() {
  const t = await getTranslations("rescue");
  return { title: t("page.title"), description: t("page.description") };
}

export default async function RescuePage() {
  if (!rescueBagsEnabled()) notFound();
  const t = await getTranslations("rescue");

  return (
    <main className="max-w-3xl mx-auto px-4 py-6" data-testid="rescue-page">
      <h1 className="font-headline-md text-2xl font-black text-text">{t("page.title")}</h1>
      <p className="font-body-sm text-sm text-fg-muted mt-1">{t("page.lead")}</p>
      <div className="mt-6">
        <RescueList />
      </div>
    </main>
  );
}
