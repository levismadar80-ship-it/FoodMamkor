/**
 * MEH-0000 — the number a user sees in a multi-step form is its VISIBLE
 * position, never the STEP enum value.
 *
 * The defect, measured on this code: /register/organizer showed «01 02 04» in
 * its stepper and jumped «2.» → «4.» in its headings. Both read the enum, and
 * an organizer never visits CATEGORY (MEH-2460), so step 3 simply vanished and
 * step 4 kept calling itself 4. An upgrade (already signed in) starts past
 * ACCOUNT, so its headings began at «2.».
 *
 * The heading cases run against the REAL approved strings from he.json and
 * en.json (MEH-1909: at least one case anchored to a real repo file). That
 * matters here more than usual, because the wizard's own test mock makes
 * t(key) return the key path — which carries no digit, so the digit swap is
 * untestable through the component and has to be tested on the real values.
 */
import { describe, it, expect } from "vitest";
import { renumberTitle, stepNumberOf } from "@/lib/wizard-step-numbers";
import he from "../messages/he.json";
import en from "../messages/en.json";

// Mirrors RegisterProducerClient's enum. Deliberately a copy: if the enum is
// re-indexed again (MEH-847 did it once), these cases must still describe
// "value 4 at position 3", not silently follow it.
const STEP = { ACCOUNT: 1, DETAILS: 2, CATEGORY: 3, STORY: 4 };
const ALL = [STEP.ACCOUNT, STEP.DETAILS, STEP.CATEGORY, STEP.STORY];

const TITLES = (msgs) => msgs.auth.register.producer.steps;

describe("the approved headings really do carry their own number", () => {
  // The control. Every heading case below asserts that a digit was SWAPPED; if
  // the strings had no digit to begin with, renumberTitle would be a no-op and
  // those cases would pass against any implementation.
  it.each([["he", he], ["en", en]])("%s: all four titles start with a digit", (_name, msgs) => {
    const t = TITLES(msgs);
    for (const key of ["account", "business", "category", "story"]) {
      expect(t[key].title, `${key}.title`).toMatch(/^\d+\.\s/);
    }
  });
});

describe("stepNumberOf", () => {
  it("a business sees all four, numbered 1-4", () => {
    expect(ALL.map((s) => stepNumberOf(ALL, s))).toEqual([1, 2, 3, 4]);
  });

  it("an organizer skips CATEGORY, so STORY is 3 and not 4", () => {
    const visible = ALL.filter((s) => s !== STEP.CATEGORY);
    expect(stepNumberOf(visible, STEP.ACCOUNT)).toBe(1);
    expect(stepNumberOf(visible, STEP.DETAILS)).toBe(2);
    expect(stepNumberOf(visible, STEP.STORY)).toBe(3);
    // The defect, stated as the thing that must not come back.
    expect(stepNumberOf(visible, STEP.STORY)).not.toBe(STEP.STORY);
  });

  it("an upgrade skips ACCOUNT, so it starts at 1 and not 2", () => {
    const visible = ALL.filter((s) => s !== STEP.ACCOUNT);
    expect(stepNumberOf(visible, STEP.DETAILS)).toBe(1);
    expect(stepNumberOf(visible, STEP.CATEGORY)).toBe(2);
    expect(stepNumberOf(visible, STEP.STORY)).toBe(3);
  });

  it("an organizer upgrade skips both", () => {
    const visible = ALL.filter((s) => s !== STEP.ACCOUNT && s !== STEP.CATEGORY);
    expect(visible.map((s) => stepNumberOf(visible, s))).toEqual([1, 2]);
  });

  it("a step that is not visible is 0, not a misleading position", () => {
    const visible = ALL.filter((s) => s !== STEP.CATEGORY);
    expect(stepNumberOf(visible, STEP.CATEGORY)).toBe(0);
  });
});

describe("renumberTitle swaps the digit and keeps the words", () => {
  it.each([["he", he], ["en", en]])("%s: the business path is byte-identical", (_name, msgs) => {
    const t = TITLES(msgs);
    const visible = ALL;
    const pairs = [
      [t.account.title, STEP.ACCOUNT],
      [t.business.title, STEP.DETAILS],
      [t.category.title, STEP.CATEGORY],
      [t.story.title, STEP.STORY],
    ];
    for (const [title, step] of pairs) {
      expect(renumberTitle(title, stepNumberOf(visible, step))).toBe(title);
    }
  });

  it.each([["he", he], ["en", en]])("%s: an organizer's story heading becomes 3, with the same words", (_name, msgs) => {
    const t = TITLES(msgs);
    const visible = ALL.filter((s) => s !== STEP.CATEGORY);
    const out = renumberTitle(t.story.title, stepNumberOf(visible, STEP.STORY));
    expect(out).toBe(t.story.title.replace(/^4\.\s*/, "3. "));
    expect(out.startsWith("3. ")).toBe(true);
    expect(out).not.toBe(t.story.title);
    // The words are untouched: only the leading digit moved, so no new copy.
    expect(out.replace(/^\d+\.\s*/, "")).toBe(t.story.title.replace(/^\d+\.\s*/, ""));
  });

  it("a title with no leading number comes back unchanged", () => {
    // This is the shape the wizard's own test mock produces (a key path), and
    // the shape a future unnumbered string would have.
    expect(renumberTitle("auth.register.producer.steps.story.title", 3)).toBe(
      "auth.register.producer.steps.story.title",
    );
    expect(renumberTitle("הסיפור שלכם", 2)).toBe("הסיפור שלכם");
  });

  it("does not touch a number that is not at the start", () => {
    expect(renumberTitle("שלב 4 מתוך 5", 2)).toBe("שלב 4 מתוך 5");
  });
});
