import { getPathname } from "@/i18n/navigation";

/**
 * /share — permanent redirect to /recommend#share (MEH-2827 PR 5).
 *
 * Purpose:  keeps every old /share link working after «ספרו עלינו» moved onto
 *           /recommend — one «help us grow» page instead of two.
 * Why a route handler, not page.js: the [locale] layout streams, so a
 *           redirect() thrown from a page arrives as a 200 with the redirect
 *           inside the RSC payload — browsers follow it, crawlers and link
 *           previews do not. A route handler answers a real 308.
 * Does NOT: render anything. The section itself is ShareClient.jsx, rendered
 *           by RecommendClient.jsx.
 * History:  MEH-1160 (creation, the /share page) · MEH-2827 PR 5 (redirect)
 */
export async function GET(request, { params }) {
  const { locale } = await params;
  // getPathname keeps the locale prefix rule in one place («as-needed»: no
  // prefix for he, /en for en).
  const target = new URL(`${getPathname({ href: "/recommend", locale })}#share`, request.url);
  return Response.redirect(target, 308);
}
