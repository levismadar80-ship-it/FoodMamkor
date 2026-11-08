import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import he from "../messages/he.json";
import en from "../messages/en.json";

/**
 * MEH-2777 — every id the privacy page enumerates has copy in both locales.
 *
 * WHY THIS CLASS OF BUG IS INVISIBLE. The page builds its keys by template
 * literal — `t(`sections.data.items.${k}.label`)` (privacy/page.js:113) — so
 * adding an id to a list and forgetting the string is not a build error, not a
 * lint error, and not a runtime throw: next-intl RETURNS THE KEY PATH, which
 * renders as the literal text "privacy.sections.data.items.registrations.label"
 * on a legal page. That is MEH-2795's defect exactly, one route over, and no
 * existing check covers these lists — the sibling guard next door
 * (PrivacyThirdPartyDisclosure.test.js) asserts the third-party list is
 * COMPLETE, never that any of it resolves.
 *
 * DISCRIMINATION — each case fails against a plausible wrong change:
 *   - add an id to DATA_ITEMS with no copy        → "every id resolves"
 *   - add copy in he.json only                    → runs per locale
 *   - leave copy behind for a deleted id          → "no orphan copy"
 *   - put the label in but not the value          → both are asserted
 * Run as a live mutation in the PR body, per MEH-1619.
 *
 * The arrays are parsed out of the page source rather than imported: the page
 * is an async server component that pulls next-intl's request context, so
 * importing it from vitest drags in the whole App Router runtime for two
 * string arrays.
 */

const ROOT = path.resolve(__dirname, "..");
const PAGE_SRC = readFileSync(path.join(ROOT, "app/[locale]/privacy/page.js"), "utf8");

/** The ids in a `const <NAME> = ["a", "b"];` array in the page source. */
function idsOf(name) {
  const m = PAGE_SRC.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`));
  if (!m) throw new Error(`${name} not found in privacy/page.js`);
  return [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
}

// All three lists render the same {label, value} pair — privacy/page.js:113,
// :132 and :169. The shape is stated per list rather than assumed globally so
// that a list which later diverges fails loudly here instead of being checked
// against the wrong fields. (The first version of this file guessed `why` and
// `rights` were flat strings; the test reported four failures naming every id,
// which is the behaviour this file exists to produce.)
const FIELDS = ["label", "value"];
const LISTS = [
  { name: "DATA_ITEMS", at: "sections.data.items", fields: FIELDS },
  { name: "WHY_ITEMS", at: "sections.why.items", fields: FIELDS },
  { name: "RIGHTS_ITEMS", at: "sections.rights.items", fields: FIELDS },
];

const at = (msgs, dotted) => dotted.split(".").reduce((o, k) => o?.[k], msgs.privacy);

describe.each([
  ["he", he],
  ["en", en],
])("%s", (_locale, msgs) => {
  it.each(LISTS)("every id in $name resolves to a real string", ({ name, at: where, fields }) => {
    const ids = idsOf(name);
    // Derived, not stated (MEH-1909): a written count drifts from the array.
    expect(ids.length, `${name} parsed empty — the regex stopped matching`).toBeGreaterThan(3);

    const missing = [];
    for (const id of ids) {
      const node = at(msgs, where)?.[id];
      for (const f of fields) {
        const v = node?.[f];
        if (typeof v !== "string" || !v.trim()) missing.push(`${where}.${id}.${f}`);
      }
    }
    expect(missing, "renders as a raw key path on the privacy page").toEqual([]);
  });

  it.each(LISTS)("$name has no orphan copy for an id the page dropped", ({ name, at: where }) => {
    const ids = idsOf(name);
    const orphans = Object.keys(at(msgs, where) ?? {}).filter((k) => !ids.includes(k));
    expect(orphans, "copy for an id the page no longer renders").toEqual([]);
  });
});

describe("MEH-2777 — the registration sign-up line is on the page", () => {
  it("DATA_ITEMS carries it, so it is rendered and not merely translated", () => {
    // Without this, the two locales could hold the copy while the page never
    // reads it — the card's check is that the LINE SHOWS, in both languages.
    expect(idsOf("DATA_ITEMS")).toContain("registrations");
  });

  it.each([
    ["he", he, "30 יום"],
    ["en", en, "30 days"],
  ])("%s names the 30-day deletion and the business as the recipient", (_l, msgs, window) => {
    const item = msgs.privacy.sections.data.items.registrations;
    expect(item.value).toContain(window);
    // The three fields the form actually collects (RegistrationCta.jsx).
    const fields = _l === "he" ? ["שם", "טלפון", "אימייל"] : ["Name", "phone", "email"];
    for (const f of fields) expect(item.value).toContain(f);
  });
});
