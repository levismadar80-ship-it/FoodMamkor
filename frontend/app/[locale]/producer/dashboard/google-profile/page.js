// @ts-check
import { getTranslations } from "next-intl/server";

import GoogleProfileTool from "@/components/dashboard/google-profile/GoogleProfileTool";
import BackLink from "@/components/ui/BackLink";

/**
 * Route:    /producer/dashboard/google-profile
 * Purpose:  «הפרופיל שלכם בגוגל» — a guide to Google Business Profile, linking
 *           the business to its own Google profile, and a check that Google
 *           shows the same details (MEH-3641). Opened from the edit tab's hub
 *           (MEH-3723; the tools tab until then).
 * Does NOT: hold state — GoogleProfileTool.jsx reads and writes.
 * History:  MEH-3641 (creation); MEH-3723 (moved to the edit tab)
 */
export default async function GoogleProfilePage() {
  const t = await getTranslations("google_profile");
  // MEH-3723: the tool is opened from the edit tab's hub, so «back» returns there.
  const tAcc = await getTranslations("dashboard.producer.edit_accordion");
  return (
    <div className="max-w-3xl mx-auto px-4 py-10" data-testid="google-profile-page">
      <BackLink href="/producer/dashboard/edit" label={tAcc("hub_back")} />
      <h1 className="font-headline-md text-xl font-black text-text mt-1 mb-1">{t("title")}</h1>
      <p className="font-body-sm text-sm text-fg-muted mb-6">{t("lead")}</p>
      <GoogleProfileTool />
    </div>
  );
}
