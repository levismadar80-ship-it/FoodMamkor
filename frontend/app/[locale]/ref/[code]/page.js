// MEH-2104: server wrapper so this route can declare robots metadata.
//
// The route renders `null` and redirects, but was serving 200 with the shared
// layout's `index, follow` (app/[locale]/layout.js:106-109) — so every referral
// code minted an indexable URL onto an empty page, an unbounded space of them.
// robots.txt already carries `Disallow: /ref/` (MEH-2099, PR #2978), but that
// stops crawling, not indexing from external links; the tag below is the other
// half.
//
// The redirect logic lives in RefRedirectClient.jsx because a "use client" file
// cannot export metadata — see the header comment there for the build error.
//
// robots idiom copied verbatim from app/[locale]/experiences/[id]/page.js:71.

import RefRedirectClient from "./RefRedirectClient";

export const metadata = { robots: { index: false, follow: false } };

export default function ReferralLandingPage() {
  return <RefRedirectClient />;
}
