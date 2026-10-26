"use client";

import { SpeedInsights } from "@vercel/speed-insights/next";
import { scrubClaimTokens } from "@/lib/claim-token";

// MEH-2324: Speed Insights reports the page URL. On /claim/<token> that URL
// is a bearer credential, so it is redacted before the beacon leaves. A client
// wrapper because the layout is a server component and cannot pass functions.
const redact = (event) => scrubClaimTokens(event);

export default function SpeedInsightsRedacted() {
  return <SpeedInsights beforeSend={redact} />;
}
