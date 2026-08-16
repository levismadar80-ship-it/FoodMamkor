import { describe, it, expect } from "vitest";
import en from "../messages/en.json";
import he from "../messages/he.json";

// MEH-1557 — duplicate-label guard for `dashboard.producer.analytics`.
//
// The insights dashboard renders KPI tiles and windowed metric cards side by
// side. Two labels with the SAME string across those namespaces means the owner
// sees the same words on two tiles carrying different numbers and cannot tell
// which metric is which — the exact confusion MEH-1532 fixed once by hand.
//
// This guard flattens the namespace, groups keys by their rendered value, and
// fails on any duplicate group that isn't explicitly sanctioned below.
//
// ALLOWED — deliberate, reviewed pairs:
//   * kpi.contact_clicks == windowed.contact_clicks — SAME metric on two
//     surfaces (Overview KPI strip + insights card), both fed by the identical
//     `contact_clicks` counter (producer_me.py `windowed(ContactClick, …)`).
//     Sharing the label is the point; MEH-1557 made both say "(בלי וואטסאפ)".
//     JSON cannot carry a comment, so the sanction lives here.
//   * The three pre-existing groups captured from origin/staging on 2026-07-26.
//     They are frozen, NOT asserted correct — the guard is green today and only
//     fails on NEW drift. Deduping one means deleting its line here.

const SANCTIONED = [
  // MEH-1557 — same metric, two surfaces (see above).
  ["kpi.contact_clicks", "windowed.contact_clicks"],
  // Pre-existing baseline (2026-07-26).
  ["hero.views_week_sub", "hero.whatsapp_clicks_sub", "kpi.window_7d"],
  ["hero.whatsapp_clicks_label", "windowed.whatsapp_clicks"],
  ["hero.whatsapp_clicks_label", "kpi.whatsapp_leads", "windowed.whatsapp_clicks"],
].map((group) => group.join(" | "));

function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, flatten(v, key));
    else if (typeof v === "string") out[key] = v;
  }
  return out;
}

function duplicateGroups(messages) {
  const flat = flatten(messages.dashboard.producer.analytics);
  const byValue = new Map();
  for (const [key, value] of Object.entries(flat)) {
    if (!byValue.has(value)) byValue.set(value, []);
    byValue.get(value).push(key);
  }
  return [...byValue.values()]
    .filter((keys) => keys.length > 1)
    .map((keys) => [...keys].sort().join(" | "))
    .sort();
}

describe("MEH-1557 — analytics label duplicates", () => {
  it.each([
    ["he", he],
    ["en", en],
  ])("%s: every duplicate label group is sanctioned", (_locale, messages) => {
    const unsanctioned = duplicateGroups(messages).filter((g) => !SANCTIONED.includes(g));
    expect(unsanctioned).toEqual([]);
  });

  it("the contact_clicks pair really is a duplicate (the sanction is load-bearing)", () => {
    for (const messages of [he, en]) {
      const flat = flatten(messages.dashboard.producer.analytics);
      expect(flat["kpi.contact_clicks"]).toBe(flat["windowed.contact_clicks"]);
    }
  });

  it("self-check: an unsanctioned duplicate is rejected", () => {
    const injected = {
      dashboard: {
        producer: {
          analytics: { kpi: { views: "צפיות" }, windowed: { profile_views: "צפיות" } },
        },
      },
    };
    const unsanctioned = duplicateGroups(injected).filter((g) => !SANCTIONED.includes(g));
    expect(unsanctioned).toEqual(["kpi.views | windowed.profile_views"]);
  });

  it("the two click tiles both carry a scope tooltip", () => {
    for (const messages of [he, en]) {
      const { windowed } = messages.dashboard.producer.analytics;
      expect(windowed.whatsapp_clicks_tooltip).toBeTruthy();
      expect(windowed.contact_clicks_tooltip).toBeTruthy();
    }
  });
});

// MEH-1557 C1 — the retired impression claim must never come back. A tooltip
// that states the inverse of what the code measures is worse than no tooltip.
describe("MEH-1557 — retired over-claims stay retired", () => {
  it.each([
    ["he", he],
    ["en", en],
  ])("%s: no impression-counting claim", (_locale, messages) => {
    const { windowed } = messages.dashboard.producer.analytics;
    const blob = JSON.stringify(messages);
    // C1: search_appearances counts click-throughs only (referrer='search' rows
    // are written on page entry — services/analytics.py track_producer_view).
    expect(blob).not.toContain("גם אם הלקוחה לא לחצה");
    expect(windowed.search_appearances_tooltip).not.toMatch(/even if/i);
  });
});

// MEH-160 — C2 INVERTED, and the inversion is the point.
//
// C2 used to assert that no tooltip claims per-visitor-per-day dedup, because
// `profile_views` was `func.count(ProducerPageView.id)` — raw. MEH-160 made the
// dedup real across all six readers of `producer_page_views`, so the assertion
// now forbids the truth and permits the lie. It was one-directional: it could
// only catch copy running ahead of the code, never copy left behind by it, so
// it stayed green through a change that inverted its own premise.
//
// A guard whose direction is tied to an implementation detail has to be
// re-pointed when that detail changes, not deleted. Both directions live here
// now: the tooltip must SAY dedup, and must not say the old raw-count claim.
describe("MEH-160 — the view tooltips state the dedup the code performs", () => {
  it("he: profile_views tooltip states one count per visitor per day", () => {
    const { windowed } = he.dashboard.producer.analytics;
    expect(windowed.profile_views_tooltip).toContain("מבקרות שונות");
    expect(windowed.profile_views_tooltip).toContain("נספרת פעם אחת");
    // The retired raw-count claim, verbatim from before this change.
    expect(windowed.profile_views_tooltip).not.toContain("כולל ביקורים חוזרים");
  });

  it("en: profile_views tooltip states one count per visitor per day", () => {
    const { windowed } = en.dashboard.producer.analytics;
    expect(windowed.profile_views_tooltip).toMatch(/distinct visitors/i);
    expect(windowed.profile_views_tooltip).toMatch(/counts once/i);
    expect(windowed.profile_views_tooltip).not.toMatch(/including repeat visits/i);
  });

  it.each([
    ["he", he],
    ["en", en],
  ])("%s: search_appearances tooltip is deduped too", (_locale, messages) => {
    const { windowed } = messages.dashboard.producer.analytics;
    // Same table, same dedup — a tooltip saying "how many times" here would be
    // as wrong as the profile_views one was.
    expect(windowed.search_appearances_tooltip).toMatch(
      /מבקרות שונות|distinct visitors/i,
    );
  });

  it.each([
    ["he", he],
    ["en", en],
  ])("%s: the conversion line does not claim a bounded percentage", (_locale, messages) => {
    const { kpi } = messages.dashboard.producer.analytics;
    // producer_whatsapp_clicks carries no viewer hash (models.py), so the
    // numerator stays raw against a deduped denominator and the ratio can
    // legitimately exceed 100. "% of viewers clicked" cannot express that;
    // "per 100 distinct visitors" can, at any value.
    expect(kpi.conversion_line).not.toMatch(/^\{rate\}%/);
    expect(kpi.conversion_line).toMatch(/100 מבקרות שונות|per 100 distinct visitors/i);
  });
});
