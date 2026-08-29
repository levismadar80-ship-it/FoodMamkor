import { describe, it, expect } from "vitest";
import en from "../messages/en.json";
import he from "../messages/he.json";
import enOnlyAllowlist from "./en-only-allowlist.json";

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
  // MEH-1127: auth.register.producer.fields.city translated to en (placeholder
  // "e.g. Zikhron Ya'akov") — removed from the baseline per the honesty test.
  // MEH-2015 chunk B: city_required_marker deleted outright (the copy it held
  // was the anti-pattern the ticket revoked) — removed from the baseline per
  // the honesty test, same as MEH-1127 above.
  // MEH-1106: completeness.checklist_aria/done/todo translated to en (the
  // 4-step checklist renders in both locales — the he-only gate is gone).
  // MEH-1194: the near-me label key was deleted (pill → icon-only button).
  // MEH-1702: the entire remaining 30-key EN gap (admin.whatsapp_failures.*,
  // auth.register.consumer.eyebrow, auth.register.producer.{account_reassurance,
  // fields.address_map_privacy_hint/license_pending_optin_hint/
  // license_pending_optin_label/license_what_is_it/tagline_label/
  // tagline_placeholder, story_card.*, validation.license_required},
  // group_buys.dashboard.form.{concept_intro,price_helper,deadline_helper},
  // map.near_me_pill.{aria,empty}, nav.trust_strip) translated to en.json —
  // removed from the baseline per the honesty test.
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

// MEH-2095: the en-only allowlist. Keys deliberately English-only, each with a
// reason. `$comment` is documentation inside the JSON, not a key — strip it.
const EN_ONLY = new Set(Object.keys(enOnlyAllowlist).filter((k) => k !== "$comment"));

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

// MEH-2095 — the OTHER direction. The guard above was he→en only, so a key
// present in en.json and absent from he.json was invisible to it. That is how
// 14 keys survived the MEH-883 homepage removal: their Hebrew twins were
// deleted correctly, the English ones were not, and no gate could see it.
//
// This half is not symmetric with the half above, deliberately. he.json is the
// source of truth (every code-referenced key lands there first), so a he-only
// key is a translation BACKLOG — hence the frozen BASELINE. An en-only key is
// the opposite: either dead weight or an intentional English-only surface.
// There is no backlog to grandfather, so there is no baseline here — only an
// allowlist that must state WHY each key has no twin.
describe("en-parity guard, en→he direction (MEH-2095)", () => {
  const heKeys = new Set(leafKeys(he));
  const enOnly = leafKeys(en).filter((k) => !heKeys.has(k));

  it("has no en.json key missing from he.json outside the explicit allowlist", () => {
    expect(enOnly.filter((k) => !EN_ONLY.has(k))).toEqual([]);
  });

  it("allowlist stays honest — every allowlisted key is still en-only (else remove it)", () => {
    const enOnlySet = new Set(enOnly);
    expect([...EN_ONLY].filter((k) => !enOnlySet.has(k))).toEqual([]);
  });

  it("every allowlist entry carries a non-trivial reason", () => {
    const unexplained = [...EN_ONLY].filter(
      (k) => typeof enOnlyAllowlist[k] !== "string" || enOnlyAllowlist[k].trim().length < 20,
    );
    expect(unexplained).toEqual([]);
  });
});
