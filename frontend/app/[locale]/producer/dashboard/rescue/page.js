import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import RescueTab from "@/components/dashboard/RescueTab";
import { Link } from "@/i18n/navigation";
import { rescueBagsEnabled } from "@/lib/rescue";

/**
 * Route:    /producer/dashboard/rescue
 * Purpose:  The business's rescue-bag counter tool (chunk 5).
 * Does NOT: exist while the pilot is off — notFound(), matching the backend,
 *           which 404s every rescue route behind the same switch.
 * History:  MEH-2649 (creation)
 */
export default async function RescueDashboardPage() {
  if (!rescueBagsEnabled()) notFound();
  const t = await getTranslations("rescue.dashboard");

  return (
    <div className="max-w-3xl mx-auto px-4 py-10" data-testid="rescue-dashboard-page">
      <h2 className="font-headline-md text-xl font-black text-text mb-1">{t("title")}</h2>
      <p className="font-body-sm text-sm text-fg-muted mb-2">{t("lead")}</p>
      {/* MEH-2733: the printable till card (MEH-2649) was reachable from nowhere. */}
      <Link
        href="/producer/dashboard/rescue/counter-card"
        data-testid="rescue-counter-card-link"
        className="inline-flex items-center min-h-touch mb-3 text-sm font-medium text-primary underline underline-offset-2 focus-ring rounded-sm"
      >
        {t("counter_card_link")}
      </Link>
      <RescueTab />
    </div>
  );
}
