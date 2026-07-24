/**
 * MEH-1241 / MEH-1528: Playwright globalSetup — provision authenticated
 * storageState for the seeded QA accounts (producer + consumer + admin) so
 * specs behind login run without per-spec login code.
 *
 * The app stores its JWT in localStorage["token"] (lib/auth-context.js), so each
 * role's storageState injects the access_token there for the target origin (plus
 * any refresh cookie captured from the login response).
 *
 * Emails are code constants; passwords come from env — the SAME names as the
 * Railway staging backend + GitHub secrets: DEMO_OWNER_PASSWORD /
 * DEMO_CONSUMER_PASSWORD / DEMO_ADMIN_PASSWORD (MEH-1528). Output:
 * e2e/.auth/{producer,consumer,admin}.json — one file per role, never shared —
 * which is GITIGNORED (each file embeds a live JWT — never commit it).
 * Passwords/tokens are never logged.
 *
 * Target gating:
 *   - Local target + NO DEMO_*_PASSWORD set → skip (the default flows suite is
 *     unauthenticated); a spec that opts into a role's storageState then fails
 *     loudly on the missing file.
 *   - Local target WITH the passwords set (MEH-1528: a seeded local full stack)
 *     → provision all three roles — enables the role-reachability proof specs
 *     to run end-to-end locally.
 *   - Remote (staging/preview) target → always provision; a missing password
 *     env var or a missing Vercel bypass secret THROWS (never a silent skip).
 *
 * Usage in a spec:
 *   import { test } from "@playwright/test";
 *   test.use({ storageState: "e2e/.auth/admin.json" });
 *
 * The older admin fixture (SMOKE_ADMIN_* → POST /auth/login in flows/19,20) is a
 * disposable-producer lifecycle admin and is unrelated to this file's admin.json
 * (the seeded demo-admin QA account) — both are left intact.
 */
import { request, type FullConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

type Role = { name: string; email: string; passwordEnv: string };

// MEH-1528: three roles, one storageState file each (never shared) — the proof
// specs (e2e/flows/25-role-reachability) assert admin reaches /admin and the
// owner/consumer do not, which only holds if each role has its OWN login.
// `name` is the app's role vocabulary → file name: producer.json (the
// demo-owner, whose role IS "producer"), consumer.json, admin.json. Passwords
// are read from env at setup time only; emails are code constants matching
// backend/scripts/seed_demo_business.py.
const ROLES: Role[] = [
  { name: "producer", email: "demo-owner@example.com", passwordEnv: "DEMO_OWNER_PASSWORD" },
  { name: "consumer", email: "demo-consumer@example.com", passwordEnv: "DEMO_CONSUMER_PASSWORD" },
  { name: "admin", email: "demo-admin@example.com", passwordEnv: "DEMO_ADMIN_PASSWORD" },
];

export const AUTH_DIR = path.join(__dirname, ".auth");

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    config.projects[0]?.use?.baseURL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    process.env.TEST_URL ||
    "http://localhost:3000";

  const isLocal = /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseURL);
  const anyPasswordSet = ROLES.some((r) => !!process.env[r.passwordEnv]);

  // A purely-local run with NO QA passwords set is the default UNAUTHENTICATED
  // suite — skip provisioning (a spec that opts into a role's storageState then
  // fails loudly on the missing file). MEH-1528: when the passwords ARE set
  // against a local target (a seeded local full stack — the end-to-end
  // verification path), we DO provision so the role-reachability proof specs
  // run locally. Remote targets always provision (seeded on staging).
  if (isLocal && !anyPasswordSet) {
    console.warn(
      `[global-setup] baseURL=${baseURL} is local and no DEMO_*_PASSWORD is set ` +
        `— skipping QA auth fixtures (the default flows suite is unauthenticated). ` +
        `Seed a local DB + export the DEMO_*_PASSWORD vars, or run against ` +
        `TEST_URL=staging, to provision producer/consumer/admin storageState.`,
    );
    return;
  }

  // MEH-1241: a remote staging/preview target sits behind Vercel Deployment
  // Protection — the login request needs the automation-bypass header or it
  // 302s to the Vercel SSO wall (vercel.com/sso-api) and never reaches the
  // backend. A LOCAL target needs no header (bypassSecret stays ""); a REMOTE
  // target with the secret missing is a hard error (fail loud, never silent).
  const bypassSecret = isLocal
    ? ""
    : process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.VERCEL_BYPASS_SECRET || "";
  if (!isLocal && !bypassSecret) {
    throw new Error(
      `[global-setup] ${baseURL} is a remote target behind Vercel Deployment ` +
        `Protection, but VERCEL_AUTOMATION_BYPASS_SECRET is not set — the login ` +
        `request would 302 to the Vercel SSO wall. Export it (Vercel → Settings ` +
        `→ Deployment Protection → Protection Bypass for Automation).`,
    );
  }

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const origin = new URL(baseURL).origin;

  for (const role of ROLES) {
    const password = process.env[role.passwordEnv];
    if (!password) {
      throw new Error(
        `[global-setup] ${role.passwordEnv} is not set — cannot provision the ` +
          `${role.name} storageState against ${baseURL}. Set it (GitHub secret / ` +
          `local env), or run only unauthenticated specs.`,
      );
    }
    // Named `ctx` (not `api`) so the API-contract audit — which greps for
    // `api.<method>(` call sites — doesn't misread this raw, /api-prefixed
    // Playwright request as an app api-client call (MEH-1241).
    const ctx = await request.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
      // Bypass Vercel Deployment Protection on the login POST (value from env
      // — never logged, never committed). Omitted entirely on a local target.
      extraHTTPHeaders: bypassSecret ? { "x-vercel-protection-bypass": bypassSecret } : {},
    });
    const res = await ctx.post("/api/auth/login", { data: { email: role.email, password } });
    if (!res.ok()) {
      throw new Error(
        `[global-setup] login failed for ${role.name} (${role.email}) at ${baseURL}: ` +
          `HTTP ${res.status()}. Did the staging --sync-users run succeed?`,
      );
    }
    const { access_token: accessToken } = await res.json();
    if (!accessToken) {
      throw new Error(`[global-setup] login for ${role.name} returned no access_token.`);
    }
    // Capture refresh cookie(s) from the login response, then inject the JWT into
    // localStorage where the SPA reads it (lib/auth-context.js).
    const state = await ctx.storageState();
    await ctx.dispose();
    state.origins = [
      {
        origin,
        localStorage: [
          { name: "token", value: accessToken },
          // MEH-1241: seed cookie consent so CookieBanner never renders in
          // authenticated specs. It reads localStorage["cookieConsent"] ∈
          // {"all","essential"} (CookieBanner.jsx:26) and shows on any fresh
          // context otherwise. Its role="dialog" ("הסכמה לעוגיות") otherwise
          // collides with every other dialog locator (strict-mode violation) —
          // the systemic root of the MEH-1228 spec failure. Product-side fix
          // (role="region") is separate: MEH-1262.
          { name: "cookieConsent", value: "essential" },
        ],
      },
    ];
    fs.writeFileSync(path.join(AUTH_DIR, `${role.name}.json`), JSON.stringify(state, null, 2));
    console.log(`[global-setup] wrote ${role.name} storageState (${role.email}).`);
  }
}
