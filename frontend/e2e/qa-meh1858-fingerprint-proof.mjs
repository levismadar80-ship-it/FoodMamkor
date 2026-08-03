/**
 * MEH-1858 — proves the storageState pattern, with the control that makes it
 * evidence rather than a hopeful green.
 *
 * The claim under test: a token provisioned in one context can be reused by
 * another IF AND ONLY IF the __Secure-Fgp cookie travels with it, because
 * _check_fingerprint (backend/app/auth.py:211-230) hashes that cookie and
 * compares it to the token's userFingerprint claim on EVERY authenticated
 * request.
 *
 *   Control A  request.newContext({ storageState })  → expect 200
 *   Control B  bare context + bearer header only      → expect 401
 *
 * B is the load-bearing half. Without it, A passing proves nothing: an endpoint
 * that never checked auth at all would also return 200, and so would a build
 * where the fingerprint claim was silently absent. B is what distinguishes
 * "the cookie is doing the work" from "nothing is checking".
 *
 * Uses an ORDINARY user (demo-consumer). _check_fingerprint is not role-aware,
 * so admin credentials prove nothing extra and are not needed.
 *
 * Run against BOTH environments — a pattern that works over HTTPS does not
 * prove localhost, because __Secure-/__Host- prefix handling on localhost is
 * engine-dependent (rfc6265bis#2605):
 *
 *   TEST_URL=https://staging.mehamakor.online node e2e/qa-meh1858-fingerprint-proof.mjs
 *   TEST_URL=http://localhost:3000            node e2e/qa-meh1858-fingerprint-proof.mjs
 */
import { request } from "@playwright/test";

const BASE = process.env.TEST_URL || "http://localhost:3000";
const EMAIL = "demo-consumer@example.com";
const PASSWORD = process.env.DEMO_CONSUMER_PASSWORD;
const PROBE_ROUTE = "/api/auth/me";

if (!PASSWORD) {
  console.error("DEMO_CONSUMER_PASSWORD unset — cannot run the proof.");
  process.exit(2);
}

const isLocal = /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE);

// Sent regardless of whether the TARGET is local, unlike playwright.config.ts,
// which gates it on the target. The distinction that matters here is not where
// Playwright points but where the BACKEND is: a local `next start` whose
// BACKEND_URL proxies to staging forwards these headers upstream, and without
// the bypass Vercel Deployment Protection answers the proxied /auth/login with
// a 401 SSO payload — which reads exactly like bad credentials.
//
// The MEH-1727 reason for gating it in playwright.config.ts does not apply:
// that was a cross-origin @font-face preflight in a BROWSER page load, and this
// is an APIRequestContext making one same-origin call.
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const bypass = bypassSecret ? { "x-vercel-protection-bypass": bypassSecret } : {};

console.log(`\n════ ${BASE} ${isLocal ? "(localhost, http)" : "(remote, https)"} ════`);

// ── Provision exactly as global-setup does ───────────────────────────────────
const setupCtx = await request.newContext({
  baseURL: BASE,
  ignoreHTTPSErrors: true,
  extraHTTPHeaders: bypass,
});
const loginRes = await setupCtx.post("/api/auth/login", {
  data: { email: EMAIL, password: PASSWORD },
});
if (!loginRes.ok()) {
  console.error(`login failed: HTTP ${loginRes.status()} — ${(await loginRes.text()).slice(0, 200)}`);
  process.exit(1);
}
const token = (await loginRes.json()).access_token;
const storageState = await setupCtx.storageState();
await setupCtx.dispose();

const fgp = storageState.cookies?.find((c) => c.name === "__Secure-Fgp");
console.log(`  __Secure-Fgp captured in storageState: ${fgp ? "YES" : "NO"}`);

// ── Control A — context built FROM the fixture (cookies + localStorage) ──────
const ctxA = await request.newContext({
  baseURL: BASE,
  ignoreHTTPSErrors: true,
  storageState,
  extraHTTPHeaders: { ...bypass, Authorization: `Bearer ${token}` },
});
const resA = await ctxA.get(PROBE_ROUTE);
await ctxA.dispose();

// ── Control B — bare context, bearer only, no cookie jar ─────────────────────
const ctxB = await request.newContext({
  baseURL: BASE,
  ignoreHTTPSErrors: true,
  extraHTTPHeaders: { ...bypass, Authorization: `Bearer ${token}` },
});
const resB = await ctxB.get(PROBE_ROUTE);
await ctxB.dispose();

console.log(`  A  newContext({ storageState })  GET ${PROBE_ROUTE} → ${resA.status()}  (expect 200)`);
console.log(`  B  bare context, bearer only     GET ${PROBE_ROUTE} → ${resB.status()}  (expect 401)`);

const aOk = resA.status() === 200;
const bOk = resB.status() === 401;

if (aOk && bOk) {
  console.log("  ✅ PROVEN — the cookie is doing the work, and its absence is detected.\n");
  process.exit(0);
}
if (aOk && !bOk) {
  console.log(
    `  ⚠️  A passes but B returned ${resB.status()}, not 401. The green in A is NOT evidence for\n` +
      "     the storageState pattern — something other than the fingerprint explains it.\n",
  );
  process.exit(1);
}
console.log("  ❌ A did not return 200 — the storageState pattern does not hold here.\n");
process.exit(1);
