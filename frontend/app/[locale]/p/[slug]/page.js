import { redirect } from "next/navigation";

// /p/[slug] → canonical vanity URL, redirects to /[slug]
// Keeps backwards-compat if we ever change the root slug routing.

// MEH-2099: this route is a redirect stub, never a destination — but it was
// measured on production (16/08) serving 200 with `index, follow`, inherited
// from the site default at app/[locale]/layout.js:106-109. That makes an empty
// vanity URL indexable. Declaring the metadata here overrides the inherited
// default; it does not touch the redirect or the status code.
// REUSES: app/[locale]/experiences/[id]/page.js:71 — the §6 robots idiom.
export const metadata = {
  robots: { index: false, follow: false },
};

export default async function ProducerVanityRedirect(props) {
  const params = await props.params;
  // MEH-1428 chunk 2: keep the query string. The owner's "request a review"
  // link is minted as /p/{slug}?rt=<token>; dropping it here delivered the
  // customer without the token, so the review form never unlocked.
  const searchParams = (await props.searchParams) || {};
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const v of [].concat(value)) query.append(key, v);
  }
  const qs = query.toString();
  redirect(qs ? `/${params.slug}?${qs}` : `/${params.slug}`);
}
