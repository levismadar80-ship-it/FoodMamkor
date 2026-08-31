/**
 * MEH-2185 — one journey, one number.
 *
 * The producer-registration journey used to quote two different durations on
 * the same viewport: «10 דקות» in the subtitle and preflight, «כ־3 דקות» in the
 * ACCOUNT step. The ⚖️ ruling of 31/08 picked «כ־3 דקות» and extended it to the
 * two siblings that describe the same act elsewhere in the app — the /join SEO
 * description and the /join "four steps" copy.
 *
 * Same class as RegisterSuccessCopyLock (MEH-2136): a contradiction nothing in
 * CI could see, because each string was individually correct.
 *
 * This asserts the KEYS, not a count of matches. A count over the whole file
 * would go green the moment an unrelated guide mentions ten minutes — and three
 * of them do (`guides.business_story.body.b10`,
 * `guides.product_photography.body.b29`, `guides.customer_messages.body.b29`),
 * which is exactly why the ruling said to leave anything describing something
 * other than the registration form alone.
 */
import { describe, expect, it } from "vitest";

import he from "../messages/he.json";
import en from "../messages/en.json";

/** Every key whose string states how long registering takes. */
const DURATION_KEYS = [
  "auth.register.producer.subtitle",
  "auth.register.producer.preflight.duration",
  "auth.register.producer.steps.account.duration_hint",
  "seo.join.og_description",
  "join.how.step1_text",
];

const read = (messages, path) =>
  path.split(".").reduce((node, key) => (node == null ? node : node[key]), messages);

describe("registration duration copy is one number (MEH-2185)", () => {
  it("resolves every listed key in both locales", () => {
    for (const path of DURATION_KEYS) {
      expect(typeof read(he, path), `he.json is missing ${path}`).toBe("string");
      expect(typeof read(en, path), `en.json is missing ${path}`).toBe("string");
    }
  });

  it.each(DURATION_KEYS)("he «%s» quotes כ־3 דקות and no other figure", (path) => {
    const value = read(he, path);
    expect(value).toContain("כ־3 דקות");
    expect(value, `${path} still quotes the old figure`).not.toMatch(/10 דקות/);
  });

  it.each(DURATION_KEYS)("en «%s» quotes 3 minutes and no other figure", (path) => {
    const value = read(en, path);
    expect(value).toMatch(/\b3 minutes\b/i);
    expect(value, `${path} still quotes the old figure`).not.toMatch(/10 minutes/i);
  });

  it("agrees with itself: every listed he string carries the identical figure", () => {
    // Derived, not stated — adding a key to DURATION_KEYS moves this set, and a
    // key that drifts to a different wording of the number splits it in two.
    const figures = new Set(
      DURATION_KEYS.map((path) => read(he, path).match(/כ־\d+ דקות/)?.[0]),
    );
    expect(figures.size, `keys disagree: ${[...figures].join(" / ")}`).toBe(1);
  });

  it("leaves the three unrelated ten-minute strings alone", () => {
    // The ruling's negative half. If a future sweep "tidies" these, this reds —
    // they describe writing a description, a photo exercise and answering a
    // message, not the registration form.
    const untouched = [
      ["guides.business_story.body.b10", "10 דקות"],
      ["guides.product_photography.body.b29", "5 דקות"],
      ["guides.customer_messages.body.b29", "10 דקות"],
    ];
    for (const [path, figure] of untouched) {
      // The figure itself, not "some number" — a sweep that rewrote these to
      // «כ־3 דקות» would still contain a number and pass a looser assertion.
      expect(read(he, path), `${path} should still read «${figure}»`).toContain(figure);
      expect(read(he, path), `${path} was swept by mistake`).not.toContain("כ־3 דקות");
    }
  });
});
