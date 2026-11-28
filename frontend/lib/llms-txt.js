// @ts-check
/**
 * Module:   llms-txt
 * Purpose:  The text of /llms.txt (llmstxt.org): the site summary, the main
 *           pages, and one line per approved business, so an AI assistant
 *           finds each business page by name, city and what it sells.
 * Touches:  nothing — pure. The route (app/llms.txt/route.js) fetches.
 * Does NOT: fetch, cache or decide which businesses are approved — the
 *           listing endpoint only returns approved, non-test businesses.
 * Related:  app/llms.txt/route.js, lib/all-producers.js, lib/constants.js
 *           (SITE_DESCRIPTION, the summary line, ADR-043).
 * History:  MEH-3953 (was a static public/llms.txt with no businesses).
 */
import { SITE_DESCRIPTION } from "@/lib/constants";
import { SITE_URL } from "@/lib/env";
import { producerPath } from "@/lib/producer-path";
// The Hebrew text that public/llms.txt carried, unchanged. It lives in a data
// file, not here: /llms.txt is Hebrew-only by design (no en version), and
// copy in code is held at zero by HebrewLiteralRatchet.test.js.
import COPY from "@/lib/llms-txt.json";


/** One line of free text: collapse whitespace, so a description never breaks the list. */
const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim();

/**
 * @param {Array<{ id?: string, slug?: string|null, name?: string, city?: string|null, short_description?: string|null }>|null} producers
 *   approved businesses, or null when the API was unreachable (the section is then left out).
 * @returns {string}
 */
export function buildLlmsTxt(producers) {
  const parts = [COPY.title, "", SITE_DESCRIPTION, `\n${COPY.pages}`];
  const rows = (producers || [])
    .filter((p) => p && p.name && (p.slug || p.id))
    .map((p) => {
      const path = encodeURI(producerPath(p) || "");
      const what = [oneLine(p.short_description), oneLine(p.city)].filter(Boolean).join(" · ");
      return `- [${oneLine(p.name).replace(/[[\]]/g, "")}](${SITE_URL}${path})${what ? `: ${what}` : ""}`;
    });
  if (rows.length) parts.push("", COPY.businessesHeading, "", ...rows);
  return `${parts.join("\n")}\n`;
}
