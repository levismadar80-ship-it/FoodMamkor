/**
 * MEH-3140: .claude/rules/testing.md tells every session which demo accounts
 * exist on staging. The accounts are defined once, in e2e/global-setup.ts
 * (ROLES). This fails when the rule and that list stop agreeing, so the rule
 * cannot keep naming an account the E2E run no longer logs in with.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const setup = fs.readFileSync(path.join(ROOT, "e2e", "global-setup.ts"), "utf8");
const rule = fs.readFileSync(path.join(ROOT, "..", ".claude", "rules", "testing.md"), "utf8");

/** Fixed-email roles in global-setup's ROLES: [{ email, passwordEnv }]. */
function seededRoles(src) {
  return [...src.matchAll(/email:\s*"([^"]+)",\s*passwordEnv:\s*"([A-Z_]+)"/g)].map((m) => ({
    email: m[1],
    passwordEnv: m[2],
  }));
}

/** Rows of the rule's demo-account table: [{ email, passwordEnv }]. */
function ruleRows(md) {
  return [...md.matchAll(/^\|[^|]*\|\s*`([^`\s]+@example\.com)`\s*\|\s*`(DEMO_[A-Z_]+)`\s*\|$/gm)].map((m) => ({
    email: m[1],
    passwordEnv: m[2],
  }));
}

const byEmail = (a, b) => a.email.localeCompare(b.email);

describe("demo accounts: rule ↔ e2e global-setup", () => {
  it("reads the roles out of global-setup (control)", () => {
    const roles = seededRoles(setup);
    expect(roles.map((r) => r.email)).toContain("demo-owner@example.com");
    expect(roles.length).toBeGreaterThanOrEqual(3);
  });

  it("the rule's table lists exactly the seeded accounts and their env vars", () => {
    expect(ruleRows(rule).sort(byEmail)).toEqual(seededRoles(setup).sort(byEmail));
  });
});
