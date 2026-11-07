import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { BUSINESS_FEATURES } from "@/lib/business-features";

/**
 * MEH-2794 — the shot list and the tool registry cannot drift apart silently.
 *
 * WHAT THIS IS FOR. `join-screenshots.mjs` claims, per the ticket, that every
 * tool in `lib/business-features.js` either maps to at least one image or is
 * declared as having no visual. That claim is exactly the kind the rules call
 * out as least likely to be checked: it lives in a comment and a hand-written
 * array, and nothing connects it to the registry. So it is checked here.
 *
 * It is also the ONLY part of that PR verifiable in this sandbox — the capture
 * script itself cannot run (staging is egress-blocked, MEH-2090; no local
 * stack, `alembic upgrade` is denied), so its selectors are unverified. A test
 * over the shot list's DATA is not a test of its selectors, and this file does
 * not pretend otherwise.
 *
 * DISCRIMINATION — each case fails against a plausible wrong change:
 *   - typo a feature_id                      → "every id is a real tool"
 *   - add a registry entry with no picture    → "no tool is silently unshot"
 *   - delete a shot a tool depended on        → same case
 *   - list a tool as no-visual AND shoot it   → "NO_VISUAL is disjoint"
 * The first is run as a live mutation in the PR body: the first draft of the
 * shot list had 19 invented ids and this test named all of them.
 */

const ROOT = path.resolve(__dirname, "..");
const SRC = readFileSync(path.join(ROOT, "e2e/marketing/join-screenshots.mjs"), "utf8");

/** Every id named in a `feature_ids: [...]` array in the capture script. */
function mappedIds() {
  const arrays = [...SRC.matchAll(/feature_ids:\s*\[([^\]]*)\]/g)];
  // Control: the parse must find the arrays at all. A regex that silently
  // stopped matching would make "every id is real" vacuously true.
  expect(arrays.length, "feature_ids arrays not found — the regex broke").toBeGreaterThan(10);
  return new Set(arrays.flatMap((m) => [...m[1].matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1])));
}

/**
 * Tools with no screenshot, declared rather than discovered — the ticket's
 * "or be listed in the PR as 'no visual'".
 *
 * Each is here because the thing it names is not a visible surface on the
 * business page or the dashboard: a backend behaviour (wa_approval,
 * onboarding_emails, structured_data), an admin-side flow (draft_claim), an
 * authoring aid that shows no output of its own (ai_writer), a route outside
 * the demo business (guides, similar_businesses), a signed-out flow
 * (social_signup), or an insights panel that needs data the demo cannot
 * manufacture honestly (demand_cities, drop_point_hosts, completeness).
 */
const NO_VISUAL = new Set([
  "draft_claim",
  "ai_writer",
  "guides",
  "social_signup",
  "wa_approval",
  "onboarding_emails",
  "similar_businesses",
  "structured_data",
  "product_wa",
  "faq_answers",
  "wa_group",
  "waitlist",
  "demand_cities",
  "drop_point_hosts",
  "completeness",
]);

describe("the shot list against the tool registry", () => {
  it("every feature_id in the capture script is a real tool", () => {
    const real = new Set(BUSINESS_FEATURES.map((f) => f.id));
    const bogus = [...mappedIds()].filter((id) => !real.has(id));
    expect(bogus, "a feature_id that no registry entry defines").toEqual([]);
  });

  it("no tool is silently unshot — each is pictured or declared no-visual", () => {
    const mapped = mappedIds();
    const orphans = BUSINESS_FEATURES.map((f) => f.id)
      .filter((id) => !mapped.has(id) && !NO_VISUAL.has(id))
      .sort();
    expect(
      orphans,
      "add a shot for these, or add them to NO_VISUAL with a reason",
    ).toEqual([]);
  });

  it("NO_VISUAL is disjoint from what is actually shot", () => {
    // A tool in both lists means one of them is a lie, and the orphan check
    // above would still pass — so it needs its own assertion.
    const both = [...mappedIds()].filter((id) => NO_VISUAL.has(id)).sort();
    expect(both, "declared as having no visual, yet shot").toEqual([]);
  });

  it("NO_VISUAL names only tools that exist", () => {
    const real = new Set(BUSINESS_FEATURES.map((f) => f.id));
    const stale = [...NO_VISUAL].filter((id) => !real.has(id)).sort();
    expect(stale, "NO_VISUAL names a tool the registry dropped").toEqual([]);
  });

  it("the two lists together account for the whole registry", () => {
    // Derived, never stated (MEH-1909): the totals come from the data.
    const mapped = mappedIds();
    const covered = BUSINESS_FEATURES.filter(
      (f) => mapped.has(f.id) || NO_VISUAL.has(f.id),
    ).length;
    expect(covered).toBe(BUSINESS_FEATURES.length);
    expect(BUSINESS_FEATURES.length).toBeGreaterThan(40); // control: the registry loaded
  });
});

describe("the capture script's own safety properties", () => {
  // These are the reason an unrun script is safe to hand over at all, so they
  // are pinned rather than trusted to survive the next edit.
  it("refuses production as a target", () => {
    expect(SRC).toMatch(/mehamakor\\\.co\\\.il/);
    expect(SRC).toMatch(/REFUSING to run against production/);
  });

  it("refuses a remote target with no bypass secret", () => {
    expect(SRC).toMatch(/is remote and VERCEL_AUTOMATION_BYPASS_SECRET is unset/);
  });

  it("writes no file for a missing selector, and exits non-zero", () => {
    // The #2786 failure this guards: screenshots of an error boundary that
    // passed review because they existed.
    expect(SRC).toMatch(/status = "missing"/);
    expect(SRC).toMatch(/process\.exitCode = 1/);
    // And no viewport-level fallback screenshot anywhere in the catch path.
    expect(SRC).not.toMatch(/catch[\s\S]{0,400}page\.screenshot/);
  });

  it("derives the manifest's counts instead of stating them", () => {
    expect(SRC).toMatch(/entries\.filter\(\(e\) => e\.status === "ok"\)\.length/);
  });
});
