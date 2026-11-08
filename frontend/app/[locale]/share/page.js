import { permanentRedirect } from "next/navigation";
import { getPathname } from "@/i18n/navigation";

/**
 * /share — permanent redirect to /recommend#share (MEH-2827 PR 5).
 *
 * Purpose:  keeps every old /share link working after «ספרו עלינו» moved onto
 *           /recommend — one «help us grow» page instead of two. 308, so
 *           search engines and saved links follow it.
 * Does NOT: render anything. The section itself is ShareClient.jsx, rendered
 *           by RecommendClient.jsx.
 * History:  MEH-1160 (creation, the /share page) · MEH-2827 PR 5 (redirect)
 */
export default async function SharePage({ params }) {
  const { locale } = await params;
  // getPathname keeps the locale prefix rule in one place («as-needed»: no
  // prefix for he, /en for en).
  permanentRedirect(`${getPathname({ href: "/recommend", locale })}#share`);
}
