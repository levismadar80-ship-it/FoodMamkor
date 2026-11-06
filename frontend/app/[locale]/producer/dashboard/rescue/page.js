import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import RescueTab from "@/components/dashboard/RescueTab";
import BackLink from "@/components/ui/BackLink";
import { rescueBagsEnabled } from "@/lib/rescue";

/**
 * Route:    /producer/dashboard/rescue
 * Purpose:  The business's rescue-bag counter tool (chunk 5).
 * Does NOT: exist while the pilot is off — notFound(), matching the backend,
 *           which 404s every rescue route behind the same switch.
 * History:  MEH-2649 (creation); MEH-2728 («חזרה לכלים», like every other
 *           screen opened from the tools tab — it was the only one without).
 */
export default async function RescueDashboardPage() {
  if (!rescueBagsEnabled()) notFound();
  const t = await getTranslations("rescue.dashboard");

  return (
    <div className="max-w-3xl mx-auto px-4 py-10" data-testid="rescue-dashboard-page">
      <BackLink href="/producer/dashboard/tools" label={t("back")} />
      <h2 className="font-headline-md text-xl font-black text-text mt-1 mb-1">{t("title")}</h2>
      <p className="font-body-sm text-sm text-fg-muted mb-5">{t("lead")}</p>
      <RescueTab />
    </div>
  );
}
