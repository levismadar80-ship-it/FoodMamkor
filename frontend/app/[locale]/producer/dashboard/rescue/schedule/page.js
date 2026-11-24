// @ts-check
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import RescueScheduleForm from "@/components/dashboard/RescueScheduleForm";
import BackLink from "@/components/ui/BackLink";
import { rescueBagsEnabled } from "@/lib/rescue";

/**
 * Route:    /producer/dashboard/rescue/schedule
 * Purpose:  Set a surprise-bag routine once per pickup point, so the bags of
 *           each chosen day publish themselves.
 * Does NOT: exist while the pilot is off — notFound(), like the rescue tab.
 * History:  MEH-3703 (creation; placement C, Sapir 24/11)
 */
export default async function RescueSchedulePage() {
  if (!rescueBagsEnabled()) notFound();
  const t = await getTranslations("rescue.schedule");

  return (
    <div className="max-w-3xl mx-auto px-4 py-10" data-testid="rescue-schedule-page">
      <BackLink href="/producer/dashboard/rescue" label={t("back")} />
      <h1 className="font-headline-md text-xl font-black text-text mt-1 mb-1">{t("title")}</h1>
      <p className="font-body-sm text-sm text-fg-muted mb-4">{t("lead")}</p>
      <RescueScheduleForm />
    </div>
  );
}
