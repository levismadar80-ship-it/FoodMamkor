/**
 * MEH-449 Layer 3 — post-deploy AI-artifact leak probe.
 *
 * Every forbidden path must come back 404 from the deployed origin — a 200
 * means an AI development artifact is being publicly served (the Apple
 * Support v5.13 incident class). Runs with the existing e2e suite (flows/
 * testMatch); no new workflow. Canonical pattern list:
 * .claude/hooks/check-artifact-location.sh.
 */
import { test, expect } from "@playwright/test";

// Same base-URL resolution as flows 21/22 (PLAYWRIGHT_BASE_URL in CI,
// TEST_URL for staging/preview runs, localhost fallback).
const BASE =
  process.env.PLAYWRIGHT_BASE_URL || process.env.TEST_URL || "http://localhost:3000";

const FORBIDDEN_PATHS = [
  "/CLAUDE.md",
  "/HANDOFF.md",
  "/ROADMAP.md",
  "/.claude/settings.json",
  "/docs/SECURITY.md",
  "/AGENTS.md",
];

test.describe("AI artifact leak probe (MEH-449)", () => {
  for (const path of FORBIDDEN_PATHS) {
    test(`GET ${path} → 404`, async ({ request }) => {
      // Redirects are followed: a redirect that lands on a 404 is fine
      // (nothing served); anything that resolves to 200 is a leak.
      const res = await request.get(`${BASE}${path}`);
      expect(res.status(), `${path} must never be publicly served`).toBe(404);
    });
  }
});
