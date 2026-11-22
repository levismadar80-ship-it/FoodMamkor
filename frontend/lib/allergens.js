// @ts-check
import ALLERGEN_DATA from "./allergen-words.json";
// MEH-2662: the closed allergen list, in the same canonical order as
// backend/app/allergens.py ALLERGEN_CODES. __tests__/ProductsSectionAllergens.test.jsx
// ("matches backend/app/allergens.py exactly") reads the backend file and
// fails if the two lists ever differ.
export const ALLERGEN_CODES = [
  "gluten",
  "milk",
  "eggs",
  "tree_nuts",
  "peanuts",
  "sesame",
  "soy",
  "fish",
  "crustaceans",
  "molluscs",
  "celery",
  "mustard",
  "sulphites",
  "lupin",
  "fava_beans", // MEH-3439: Israel-specific, G6PD
];

/**
 * MEH-3585: did the owner say ANYTHING about this product's allergens —
 * «מכיל», «עלול להכיל» or «אין»? Unknown codes do not count (ProductFacts drops
 * them too, so a product with only unknown codes shows no allergen line).
 * @param {{ allergens?: string[] | null, may_contain?: string[] | null, no_allergens?: boolean | null }} product
 */
export function allergensDeclared(product) {
  const known = (list) => (list || []).some((c) => ALLERGEN_CODES.includes(c));
  return known(product?.allergens) || known(product?.may_contain) || !!product?.no_allergens;
}

/** Toggle one code in a list, keeping canonical order. */
export function toggleAllergen(list, code) {
  const set = new Set(list || []);
  if (set.has(code)) set.delete(code);
  else set.add(code);
  return ALLERGEN_CODES.filter((c) => set.has(c));
}

/**
 * MEH-3439: toggle one code in «מכיל» (`allergens`) or «עלול להכיל»
 * (`may_contain`). A code lives in at most one of the two: turning it on in
 * one turns it off in the other (the backend drops the overlap too).
 * @param {{ allergens?: string[] | null, may_contain?: string[] | null }} state
 * @param {"allergens" | "may_contain"} kind
 * @param {string} code
 * @returns {{ allergens: string[], may_contain: string[] }}
 */
export function toggleDeclared(state, kind, code) {
  const other = kind === "allergens" ? "may_contain" : "allergens";
  const next = toggleAllergen(state[kind], code);
  const on = next.includes(code);
  const otherList = (state[other] || []).filter((c) => !(on && c === code));
  // MEH-3445: a ticked code ends «אין במוצר אלרגנים מהרשימה».
  return /** @type {{ allergens: string[], may_contain: string[], no_allergens?: boolean }} */ ({
    [kind]: next,
    [other]: otherList,
    ...(on ? { no_allergens: false } : {}),
  });
}

/**
 * MEH-3445: «אין במוצר אלרגנים מהרשימה». Turning it on clears both groups —
 * "none" and a ticked code cannot both be true (the backend agrees).
 * @param {{ no_allergens?: boolean }} state
 * @returns {{ no_allergens: boolean, allergens?: string[], may_contain?: string[] }}
 */
export function toggleNoAllergens(state) {
  return state.no_allergens ? { no_allergens: false } : { no_allergens: true, allergens: [], may_contain: [] };
}

/**
 * MEH-3443: words that name each allergen inside a free-text ingredients
 * list. Deliberately small and conservative: a word is listed only when it
 * almost always means the allergen in a food label. The «מכיל» line above the
 * ingredients stays the complete answer — this only emphasises it in place
 * (Israeli adoption of 1169/2011, art. 21; mandatory from 1.1.2028).
 * Each entry is a term, or [term, notFollowedBy] where notFollowedBy lists
 * the next words that make it a different ingredient («חלב קוקוס»).
 */
// The words live in a JSON data file: they are matching data, not copy, and
// the Hebrew-literal ratchet (HebrewLiteralRatchet.test.js) rightly keeps
// Hebrew strings out of code.
/** @type {Record<string, Array<string | [string, string[]]>>} */
export const ALLERGEN_WORDS = /** @type {any} */ (ALLERGEN_DATA.words);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const HEBREW = /[֐-׿]/;
// MEH-3443 review: «almond milk», «cocoa butter» — the word before makes it a
// different ingredient. Hebrew puts the qualifier after (handled per term).
/** @type {Record<string, string[]>} */
const NOT_PRECEDED_BY = {
  milk: ["almond", "oat", "soy", "soya", "rice", "coconut", "cashew", "plant", "nut"],
  cream: ["coconut", "oat", "soy", "plant", "vegan"],
  butter: ["peanut", "cocoa", "shea", "almond", "nut", "cashew", "apple"],
  cheese: ["vegan", "cashew", "plant"],
  yogurt: ["coconut", "soy", "oat", "almond", "plant"],
};
// One-letter prefixes ש/כ also attach («שלחלב», «כחלב»), but on these short
// terms they make another word («כפול»), so only ו/ב/ה/מ/ל apply to them.
const NO_SH_KAF = new Set(ALLERGEN_DATA.noShKaf);
// Between a term and the word that disqualifies it: space, hyphen, maqaf, «(».
const GAP = "[\\s\\-\\u05BE(]+";

/**
 * MEH-3443: split `text` into segments, marking the words that name an
 * allergen the owner ticked in «מכיל». Only `codes` count — an allergen word
 * whose code was not ticked stays plain (the owner's declaration is the
 * source, not our guess). `details` adds the owner's own words for a code
 * (MEH-3442 «כוסמין», «שקדים, פקאן»). Joining the segments returns `text`
 * unchanged.
 * @param {string} text
 * @param {string[]} codes
 * @param {Record<string, string | null | undefined>} [details]
 * @returns {Array<{ text: string, hit: boolean }>}
 */
export function highlightAllergens(text, codes, details = {}) {
  /** @type {Map<string, string[]>} */
  const terms = new Map();
  for (const code of codes || []) {
    if (!ALLERGEN_CODES.includes(code)) continue;
    for (const entry of ALLERGEN_WORDS[code] || []) {
      const [term, notFollowedBy] = Array.isArray(entry) ? entry : [entry, []];
      terms.set(term, notFollowedBy);
    }
    const detail = details[code];
    if (typeof detail === "string") {
      // «כוסמין (מלא)» → «כוסמין», «מלא»; words under 3 letters are dropped.
      for (const word of detail.split(/[,;/\n()]/u)) {
        const w = word.trim();
        if (w.length >= 3 && !terms.has(w)) terms.set(w, []);
      }
    }
  }
  if (!text || terms.size === 0) return [{ text: text || "", hit: false }];

  // Longest first, so «קמח חיטה» wins over «קמח». Hebrew terms may carry up
  // to two one-letter prefixes (ו/ב/ה/מ/ל/ש/כ: «וחמאה», «ובחלב», «שלחלב»).
  const alternatives = [...terms.keys()]
    .sort((a, b) => b.length - a.length)
    .map((term) => {
      const notFollowedBy = terms.get(term) || [];
      const prefixes = NO_SH_KAF.has(term) ? ALLERGEN_DATA.shortPrefixes : ALLERGEN_DATA.prefixes;
      const prefix = HEBREW.test(term) ? `(?:[${prefixes}]{1,2})?` : "";
      const guard = notFollowedBy.length ? `(?!${GAP}(?:${notFollowedBy.map(escapeRe).join("|")}))` : "";
      const before = NOT_PRECEDED_BY[term.toLowerCase()];
      const lookbehind = before ? `(?<!(?:${before.join("|")})${GAP})` : "";
      return `${lookbehind}${prefix}${escapeRe(term).replace(/\s+/g, "\\s+")}${guard}`;
    });
  const re = new RegExp(`(?<![\\p{L}\\p{M}])(?:${alternatives.join("|")})(?![\\p{L}\\p{M}])`, "giu");

  /** @type {Array<{ text: string, hit: boolean }>} */
  const out = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ text: text.slice(last, start), hit: false });
    out.push({ text: m[0], hit: true });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out.length ? out : [{ text, hit: false }];
}
