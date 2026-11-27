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

// The page list that public/llms.txt carried, unchanged.
const PAGES = `
## עמודים

- [אודות](https://mehamakor.co.il/about): מי מפעילה את מהמקור, למה היא נבנתה, ואיך אנחנו מאמתות בית עסק.
- [תהליך האישור](https://mehamakor.co.il/about/process): הקריטריונים שכל בית עסק עובר לפני שהוא מתפרסם באתר.
- [מפה](https://mehamakor.co.il/map): בתי העסק המאושרים על גבי מפה, לפי מיקום ותחום.
- [בתי עסק](https://mehamakor.co.il/producers): הקטלוג המלא של בתי העסק המאושרים, עם סינון לפי קטגוריה ותזונה.
- [הצטרפות בית עסק](https://mehamakor.co.il/join): איך בית עסק מקומי מצטרף למהמקור, מה הוא מקבל, ומה התהליך.
- [שאלות נפוצות לבתי עסק](https://mehamakor.co.il/about/for-businesses): עלות, ערך, זמן, אמון ושליטה בלקוחות — התשובות שבית עסק שואל לפני שהוא מצטרף.
- [מה אומרים התגים](https://mehamakor.co.il/about/badges): מה כל תג באתר אומר, ומי עומד מאחוריו.
- [אירועים](https://mehamakor.co.il/events): שווקים, ימי חווה וסדנאות של בתי העסק, לפי תאריך ועיר.
- [חוויות וסדנאות](https://mehamakor.co.il/experiences): חוויות אוכל שבתי עסק ומארחים מקומיים מציעים.
- [קבוצות רכישה](https://mehamakor.co.il/group-buys): הזמנה משותפת מבית עסק, שנפתחת כשמגיעים ליעד.
- [למה לקנות מקומי](https://mehamakor.co.il/about/why-local): למה כדאי לקנות ישירות מבתי עסק מקומיים.`;

/** One line of free text: collapse whitespace, so a description never breaks the list. */
const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim();

/**
 * @param {Array<{ id?: string, slug?: string|null, name?: string, city?: string|null, short_description?: string|null }>|null} producers
 *   approved businesses, or null when the API was unreachable (the section is then left out).
 * @returns {string}
 */
export function buildLlmsTxt(producers) {
  const parts = [`# מהמקור`, "", SITE_DESCRIPTION, PAGES];
  const rows = (producers || [])
    .filter((p) => p && p.name && (p.slug || p.id))
    .map((p) => {
      const path = p.slug ? `/${encodeURIComponent(p.slug)}` : `/producer/${p.id}`;
      const what = [oneLine(p.short_description), oneLine(p.city)].filter(Boolean).join(" · ");
      return `- [${oneLine(p.name).replace(/[[\]]/g, "")}](${SITE_URL}${path})${what ? `: ${what}` : ""}`;
    });
  if (rows.length) parts.push("", "## בתי עסק", "", ...rows);
  return `${parts.join("\n")}\n`;
}
