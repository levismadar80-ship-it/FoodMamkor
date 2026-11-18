// @ts-check
/**
 * Module:   og-rtl
 * Purpose:  Hebrew text for next/og (Satori), which has no bidi: it lays every
 *           string out LTR, so «מאפייה» comes out «הייפאמ». We hand it each
 *           word already in visual order and let a row-reverse flex line place
 *           the words in RTL order — wrapping still works, because Satori
 *           wraps whole flex items.
 * Does NOT: implement the Unicode bidi algorithm. Inside a word, a run of
 *           Latin letters or digits keeps its own order («1948», «Bio»); that
 *           covers business names and cities. Mixed-direction sentences are
 *           not this file's job.
 * Related:  app/og/business/[file]/route.js (the only caller).
 * History:  MEH-3329 (creation; spike 16/11 — plain Hebrew renders reversed).
 */

const RTL_CHAR = /[֐-׿]/;
const LTR_RUN = /([A-Za-z0-9][A-Za-z0-9.,'"&-]*)/;
const LTR_ONLY = /^[A-Za-z0-9][A-Za-z0-9.,'"&-]*$/;
// Paired punctuation is mirrored in an RTL run (Unicode Bidi_Mirrored): once
// the run is reversed, «(בדיקה)» would otherwise draw as «)בדיקה(».
const MIRROR = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<", "«": "»", "»": "«" };
const mirror = (ch) => MIRROR[ch] || ch;

/**
 * One word in the order Satori must draw it (LTR).
 * @param {string} word
 * @returns {string}
 */
export function visualWord(word) {
  if (!RTL_CHAR.test(word)) return word;
  return word
    .split(LTR_RUN)
    .map((part) => (LTR_ONLY.test(part) ? part : [...part].reverse().map(mirror).join("")))
    .reverse()
    .join("");
}

/**
 * The words of a line, in reading order, each already visual.
 * @param {string} text
 * @returns {string[]}
 */
export function visualWords(text) {
  return String(text || "")
    .split(/\s+/)
    .filter(Boolean)
    .map(visualWord);
}

// Half the word gap on each side: in a row-reverse line, a one-sided margin
// lands on the wrong side of the first word of every wrapped line.
const WORD_GAP = { margin: "0 0.12em" };

/**
 * A Satori element: words in RTL order on a wrapping flex line.
 * @param {string} text
 * @param {Record<string, unknown>} [style]
 */
export function rtlLine(text, style = {}) {
  return {
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "row-reverse", flexWrap: "wrap", ...style },
      children: visualWords(text).map((w, i) => ({
        type: "span",
        key: String(i),
        props: { style: WORD_GAP, children: w },
      })),
    },
  };
}
