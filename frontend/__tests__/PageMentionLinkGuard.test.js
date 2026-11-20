// Site-wide: a UI string that sends the visitor to one of our pages by name
// («בעמוד «מחירון»») must carry a link tag (<pricinglink>…</pricinglink>),
// or the visitor is left to find the page alone (20/11, the chat answer that
// named «מחירון» with no link). The page names come from the chat's page list
// Limit: it catches «עמוד/דף «שם»» phrasings, not a bare «שם» without the word.
// (messages chat.pages + lib/site-pages.js), so a new page is covered too.
import { describe, it, expect } from "vitest";
import he from "../messages/he.json";

// Short names the copy uses for the same pages.
const ALIASES = ["מחירון", "המחירון", "אירועים", "חוויות", "קבוצות רכישה", "המועדפים שלי", "אודות", "יצירת קשר", "הצטרפות", "המפה"];

// A string here names a page and has its link elsewhere on the screen; each
// line says where.
const ALLOWED = {
  // StatusPage's primary button is «לתובנות» → /producer/dashboard/insights.
  "weekly_summary_unsubscribe.success_body": "CTA button links the page",
  // «אודות» here is a section of the business's own page, not our /about.
  "guides.business_story.body.b44": "not a site page",
};

function* strings(node, key = "") {
  if (typeof node === "string") yield [key, node];
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) yield* strings(v, key ? `${key}.${k}` : k);
}

export function unlinkedPageMentions(messages) {
  const names = new Set([...Object.values(messages.chat.pages), ...ALIASES]);
  const re = /(?:עמוד|דף|לעמוד|בעמוד|בדף|לדף)\s+[«"]([^»"]+)[»"]/g;
  const hits = [];
  for (const [key, value] of strings(messages)) {
    for (const m of value.matchAll(re)) {
      // Linked = the mention sits inside a <…link>…</…link> tag pair.
      const before = value.slice(0, m.index);
      const insideLink = /<[a-z_]*link>[^<]*$/i.test(before);
      if (names.has(m[1].trim()) && !insideLink) hits.push(key);
    }
  }
  return hits;
}

describe("page mentions carry a link", () => {
  it("no UI string names one of our pages without a link tag", () => {
    expect(unlinkedPageMentions(he).filter((k) => !ALLOWED[k])).toEqual([]);
  });

  it("control: the check catches the 20/11 sentence", () => {
    const probe = { chat: { pages: { pricing: "המחירון לבתי עסק" } }, x: { y: "המחירון המלא מופיע בעמוד «מחירון» באתר." } };
    expect(unlinkedPageMentions(probe)).toEqual(["x.y"]);
  });

  it("every allowed entry still exists, so the list only shrinks", () => {
    const keys = new Set([...strings(he)].map(([k]) => k));
    for (const k of Object.keys(ALLOWED)) expect(keys.has(k)).toBe(true);
  });
});
