// @ts-check
/**
 * Module:   my-group-buys (redirect stub)
 * Purpose:  MEH-3698: group buys are in the one «ההזמנות שלי» list now. The
 *           route stays so old links (emails, bookmarks) land there instead of
 *           a 404.
 * Does NOT: render anything.
 * History:  MEH-3609 (the page); MEH-3698 (redirect).
 */
import { redirect } from "@/i18n/navigation";

export default async function MyGroupBuysRedirect({ params }) {
  const { locale } = await params;
  redirect({ href: "/my-orders", locale });
}
