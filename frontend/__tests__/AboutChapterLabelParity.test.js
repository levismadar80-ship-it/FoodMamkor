import { describe, it, expect } from "vitest";

import he from "@/messages/he.json";
import en from "@/messages/en.json";

/**
 * MEH-1130 — the chapter marks reuse each section's EXISTING eyebrow string.
 *
 * The PR's central claim is that adding numbered chapters moves no copy: four
 * of the five labels are the section's existing heading verbatim, so the only
 * new ink is the "0N · " prefix. That claim was true when written and nothing
 * held it there — `about.chapter.N.label` and the eyebrow key it mirrors are
 * two independent entries, and a later edit to either silently makes the
 * claim false while every other test stays green.
 *
 * The CI reviewer caught the same thing from the other side on #3131: the
 * Benefits <h2> used to announce `about.consumer.benefits.heading` and now
 * announces `about.chapter.3.label`. Those are DIFFERENT KEYS. The accessible
 * name is unchanged only because the two values are equal — which is a fact
 * about the message bundles, not a property of the markup.
 *
 * So the comment in AboutClient.jsx is no longer the thing carrying that
 * claim; this file is. A stated invariant nobody checks is exactly the
 * "artifact that asserts coverage" smell — derive it instead.
 *
 * Chapter 01 is deliberately absent: the story section had no eyebrow, so
 * "הסיפור" is genuinely new copy and has nothing to be equal to.
 */
/** [chapter key, the pre-existing key it must equal, human label] */
const MIRRORS = [
  ["chapter.2.label", "comparison.eyebrow", "02 Comparison"],
  ["chapter.3.label", "consumer.benefits.heading", "03 Benefits"],
  ["chapter.4.label", "consumer.values.eyebrow", "04 Values"],
  ["chapter.5.label", "consumer.tips.eyebrow", "05 Tips"],
];

const read = (bundle, path) =>
  path.split(".").reduce((node, key) => node?.[key], bundle.about);

describe("MEH-1130 — a chapter label equals the eyebrow it replaced", () => {
  for (const [chapterKey, mirroredKey, label] of MIRRORS) {
    for (const [locale, bundle] of [
      ["he", he],
      ["en", en],
    ]) {
      it(`${label} renders the same string in ${locale} as before`, () => {
        const chapterValue = read(bundle, chapterKey);
        const mirroredValue = read(bundle, mirroredKey);
        // Both must EXIST — an undefined on each side would compare equal and
        // pass while proving nothing, which is the null-that-reassures shape.
        expect(typeof chapterValue).toBe("string");
        expect(chapterValue.length).toBeGreaterThan(0);
        expect(typeof mirroredValue).toBe("string");
        expect(chapterValue).toBe(mirroredValue);
      });
    }
  }

  it("chapter 01 is new copy and mirrors nothing", () => {
    // Stated so the absence above reads as deliberate rather than forgotten.
    expect(read(he, "chapter.1.label")).toBe("הסיפור");
    expect(read(en, "chapter.1.label")).toBe("The story");
  });

  it("covers every chapter that reuses an eyebrow", () => {
    // Derived, not stated: chapters are 1..N, exactly one of them (01) is new,
    // so the mirror list must cover the rest. A sixth chapter added without a
    // mirror entry fails here instead of silently escaping the parity check.
    const chapterCount = Object.keys(he.about.chapter).length;
    expect(MIRRORS.length).toBe(chapterCount - 1);
  });
});
