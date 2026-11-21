// @ts-check
import { getTranslations } from "next-intl/server";

import GoogleProfileTool from "@/components/producer/google-profile/GoogleProfileTool";
import BackLink from "@/components/ui/BackLink";

/**
 * Route:    /producer/dashboard/google-profile
 * Purpose:  «הפרופיל שלכם בגוגל» — a guide to Google Business Profile, linking
 *           the business to its own Google profile, and a check that Google
 *           shows the same details (MEH-3641). Opened from the tools tab.
 * Does NOT: hold state — GoogleProfileTool.jsx reads and writes.
 * History:  MEH-3641 (creation)
 */
export default async function GoogleProfilePage() {
  const t = await getTranslations("google_profile");
  return (
    <div className="max-w-3xl mx-auto px-4 py-10" data-testid="google-profile-page">
      <BackLink href="/producer/dashboard/tools" label={t("back")} />
      <h1 className="font-headline-md text-xl font-black text-text mt-1 mb-1">{t("title")}</h1>
      <p className="font-body-sm text-sm text-fg-muted mb-6">{t("lead")}</p>
      <GoogleProfileTool />
    </div>
  );
}
