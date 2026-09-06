import { describe, it, expect } from "vitest";
import {
  decodeJwtExpMs,
  isStale,
  REFRESH_MARGIN_MS,
} from "../e2e/token-freshness";

// MEH-2269 — the fixture-freshness decision, unit-tested.
//
// global-setup mints each role's storageState once; the access token in it
// lives 15 minutes (backend/app/config.py:35). Run 33982303103 took 25 minutes,
// so the mobile project reached flows/37-outreach-prefill with a dead token and
// all eight of its tests failed on `POST /admin/outreach -> 401`. The same
// eight passed on desktop in the same run, minutes earlier.
//
// `auth-fixture.ts` now asks this module whether to renew before handing out a
// context. That decision is the whole fix, and it is pure — so it is testable
// here, without a browser, a backend or a 25-minute suite.
//
// WHY A UNIT TEST WHEN THE REAL PROOF IS A CI RUN: the CI run proves the fix
// works today, once. This pins the RULE — including the margin, which is the
// part a future edit is most likely to "simplify" to a bare expiry check. A
// token with four seconds left passes `exp > now` and still 401s by the time
// the request lands.

const b64url = (obj) =>
  Buffer.from(JSON.stringify(obj), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** A structurally real JWT (header.payload.signature); the signature is never read. */
const jwt = (payload) =>
  `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.sig`;

const NOW = 1_757_000_000_000; // fixed clock — no test here may depend on the wall clock

describe("e2e token freshness (MEH-2269)", () => {
  // Runs first. If the decoder cannot read an exp, every staleness answer below
  // is "stale" for the wrong reason and the suite would still be green.
  it("decodes exp out of a real-shaped JWT, and refuses anything else", () => {
    expect(decodeJwtExpMs(jwt({ sub: "u1", exp: NOW / 1000 + 900 }))).toBe(
      NOW + 900_000,
    );

    for (const bad of [
      "",
      "not.a.jwt",
      "onlyonepart",
      jwt({ sub: "u1" }),
      null,
      undefined,
    ]) {
      expect(
        decodeJwtExpMs(bad),
        `${String(bad)} should not decode`,
      ).toBeNull();
    }
  });

  // The case above does NOT exercise the base64url alphabet: `{"sub":"u1",…}`
  // base64-encodes to a payload containing neither `-` nor `_` (checked, not
  // assumed), so it would pass against a decoder that never translated them.
  // A real token's claims are not that tidy — this payload is built to contain
  // both, which is the shape the decoder actually has to survive.
  it("decodes a payload that really uses the base64url alphabet", () => {
    const payload = {
      sub: "u1?~>>>\u00ff",
      exp: NOW / 1000 + 900,
      name: "מאפיית הדגן",
    };
    const token = jwt(payload);
    const encoded = token.split(".")[1];

    expect(/[-_]/.test(encoded), `fixture must exercise -/_ : ${encoded}`).toBe(
      true,
    );
    expect(decodeJwtExpMs(token)).toBe(NOW + 900_000);
  });

  it("a token minted seconds ago is not stale", () => {
    // What global-setup writes: 15 minutes of life (config.py:35).
    expect(isStale(jwt({ exp: NOW / 1000 + 15 * 60 }), NOW)).toBe(false);
  });

  it("an expired token is stale — the 05/09 mobile case", () => {
    // 25 minutes into the run, against a 15-minute TTL.
    expect(isStale(jwt({ exp: NOW / 1000 + 15 * 60 }), NOW + 25 * 60_000)).toBe(
      true,
    );
  });

  // The discriminating case, and the reason the margin exists rather than a
  // bare `exp > now`. A one-second-of-life token is VALID by every definition
  // of expired and is still useless: the refresh, the context build and the
  // request itself all happen after the check.
  it("a token that is still valid but about to die is stale", () => {
    const nearlyDead = jwt({ exp: NOW / 1000 + 1 });
    expect(decodeJwtExpMs(nearlyDead)).toBeGreaterThan(NOW); // not expired…
    expect(isStale(nearlyDead, NOW)).toBe(true); // …and refreshed anyway

    // Both sides of the boundary, so the margin cannot be silently zeroed:
    // exactly at the margin counts as stale, a millisecond past it does not.
    const atMargin = jwt({ exp: (NOW + REFRESH_MARGIN_MS) / 1000 });
    const pastMargin = jwt({ exp: (NOW + REFRESH_MARGIN_MS + 1000) / 1000 });
    expect(isStale(atMargin, NOW)).toBe(true);
    expect(isStale(pastMargin, NOW)).toBe(false);
  });

  it("an unreadable token is stale, not an exception", () => {
    // Fail toward refreshing: one /auth/refresh call (30/minute, auth.py:152)
    // is cheaper than a 401 twenty minutes into a run, and a throw here would
    // take down the spec at fixture time rather than renewing.
    for (const bad of [null, undefined, "", "garbage"]) {
      expect(isStale(bad, NOW)).toBe(true);
    }
  });
});
