/**
 * Module:   producer/dashboard/followers (redirect stub)
 * Purpose:  MEH-2884 (dashboard placement audit item 6): the «שמרו במועדפים»
 *           count and its share action live on the insights tab's followers
 *           card. This route stays so old links (emails, bookmarks) land
 *           there instead of a 404.
 * Does NOT: render anything — the page it replaced showed the same count and
 *           a copy button, a second home for one number.
 * History:  MEH-1356 (the page); MEH-2884 (redirect).
 */
import { redirect } from "@/i18n/navigation";

export default async function FollowersRedirect({ params }) {
  const { locale } = await params;
  redirect({ href: "/producer/dashboard/insights", locale });
}
