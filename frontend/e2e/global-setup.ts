/**
 * MEH-1241: Playwright globalSetup — provision authenticated storageState for
 * the seeded staging QA accounts (producer + consumer) so specs behind login
 * run without per-spec login code.
 *
 * The app stores its JWT in localStorage["token"] (lib/auth-context.js), so each
 * role's storageState injects the access_token there for the target origin (plus
 * any refresh cookie captured from the login response).
 *
 * Emails are code constants; passwords come from env — the SAME names as the
 * Railway staging backend + GitHub secrets: DEMO_OWNER_PASSWORD /
 * DEMO_CONSUMER_PASSWORD. Output: e2e/.auth/{producer,consumer}.json, which is
 * GITIGNORED (each file embeds a live JWT — never commit it). Passwords/tokens
 * are never logged.
 *
 * Target gating: the seeded accounts exist on staging/preview only, so auth is
 * provisioned solely when baseURL is NOT localhost. On a local target we log and
 * skip (the default flows suite is unauthenticated) — a spec that opts into a
 * role's storageState then fails loudly on the missing file. When the target IS
 * remote but a password env var is missing, we THROW — never a silent skip.
 *
 * Usage in a spec:
 *   import { test } from "@playwright/test";
 *   test.use({ storageState: "e2e/.auth/producer.json" });
 *
 * The existing admin fixture (SMOKE_ADMIN_* → POST /auth/login in flows/19,20)
 * is unrelated to this file and untouched.
 */
import { request, type FullConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

type Role = { name: string; email: string; passwordEnv: string };

const ROLES: Role[] = [
  { name: "producer", email: "demo-owner@example.com", passwordEnv: "DEMO_OWNER_PASSWORD" },
  { name: "consumer", email: "demo-consumer@example.com", passwordEnv: "DEMO_CONSUMER_PASSWORD" },
];

export const AUTH_DIR = path.join(__dirname, ".auth");

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    config.projects[0]?.use?.baseURL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    process.env.TEST_URL ||
    "http://localhost:3000";

  if (/\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseURL)) {
    console.warn(
      `[global-setup] baseURL=${baseURL} is local — skipping QA auth fixtures ` +
        `(demo-owner/demo-consumer are seeded on staging only). Run auth specs ` +
        `against TEST_URL=staging.`,
    );
    return;
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
    const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
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
    state.origins = [{ origin, localStorage: [{ name: "token", value: accessToken }] }];
    fs.writeFileSync(path.join(AUTH_DIR, `${role.name}.json`), JSON.stringify(state, null, 2));
    console.log(`[global-setup] wrote ${role.name} storageState (${role.email}).`);
  }
}
