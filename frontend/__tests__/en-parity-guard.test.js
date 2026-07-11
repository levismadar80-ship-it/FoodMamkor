import { describe, it, expect } from "vitest";
import en from "../messages/en.json";
import he from "../messages/he.json";

// MEH-978 — key-presence parity guard, the opposite direction of the MEH-840
// en-locale guard. MEH-840 catches Hebrew leaking INTO en.json; this catches a
// key present in he.json but MISSING from en.json. Such a key renders as a raw
// `MISSING_MESSAGE` (or throws) on the /en route the moment code calls t() for
// it — e.g. MapBottomSheet's `t("count")` white-spaced `map.bottom_sheet.count`
// on /en/map because the en plural was never added.
//
// he.json is the source of truth (every code-referenced key lands there first);
// en.json must keep pace. Runs inside the existing required "Frontend unit tests
// (vitest)" job, so any NEW he-only key fails CI — no new workflow, no path-filter
// "Expected forever" trap (mirrors the MEH-840 rationale).
//
// BASELINE — the he-only keys that existed when this guard landed (captured
// 2026-06-28). They are pre-existing he-gated / not-yet-translated surfaces
// (e.g. nav.trust_strip is locale-gated to he; the en wave is tracked under
// MEH-472), NOT asserted to be correct — the baseline freezes the current state
// so the guard is green today and only fails on NEW drift. Translating any of
// them to en means deleting its line here (the second test enforces that).

const BASELINE = new Set([
  // MEH-997: admin.layout.nav.whatsapp_failures translated (sidebar rendered
  // the raw key in /en) — removed from the baseline per the honesty test.
  "admin.whatsapp_failures.columns.error_code",
  "admin.whatsapp_failures.columns.error_message",
  "admin.whatsapp_failures.columns.kind",
  "admin.whatsapp_failures.columns.phone",
  "admin.whatsapp_failures.columns.sent_at",
  "admin.whatsapp_failures.columns.status",
  "admin.whatsapp_failures.columns.updated_at",
  "admin.whatsapp_failures.empty",
  "admin.whatsapp_failures.load_error",
  "admin.whatsapp_failures.status.failed",
  "admin.whatsapp_failures.status.window_expired",
  "admin.whatsapp_failures.subtitle",
  "admin.whatsapp_failures.title",
  "auth.register.consumer.eyebrow",
  "auth.register.producer.account_reassurance",
  "auth.register.producer.fields.address_map_privacy_hint",
  "auth.register.producer.fields.city",
  "auth.register.producer.fields.city_required_marker",
  "auth.register.producer.fields.license_pending_optin_hint",
  "auth.register.producer.fields.license_pending_optin_label",
  "auth.register.producer.fields.license_what_is_it",
  "auth.register.producer.fields.tagline_label",
  "auth.register.producer.fields.tagline_placeholder",
  "auth.register.producer.story_card.body",
  "auth.register.producer.story_card.title",
  "auth.register.producer.validation.license_required",
  // MEH-1106: completeness.checklist_aria/done/todo translated to en (the
  // 4-step checklist renders in both locales — the he-only gate is gone).
  // MEH-992 — group-buy form clarity copy (he-first per ADR-024; en wave under MEH-472).
  "group_buys.dashboard.form.concept_intro",
  "group_buys.dashboard.form.price_helper",
  "group_buys.dashboard.form.deadline_helper",
  "map.near_me_pill.aria",
  "map.near_me_pill.empty",
  "map.near_me_pill.label",
  "nav.trust_strip",
]);

function leafKeys(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") out.push(...leafKeys(v, key));
    else out.push(key);
  }
  return out;
}

describe("en-parity guard (MEH-978)", () => {
  const enKeys = new Set(leafKeys(en));
  const missing = leafKeys(he).filter((k) => !enKeys.has(k));

  it("has no NEW he.json key missing from en.json (outside the known baseline)", () => {
    const newGaps = missing.filter((k) => !BASELINE.has(k));
    expect(newGaps).toEqual([]);
  });

  it("baseline stays honest — every baselined key is still he-only (else remove it)", () => {
    const missingSet = new Set(missing);
    const stale = [...BASELINE].filter((k) => !missingSet.has(k));
    expect(stale).toEqual([]);
  });
});
