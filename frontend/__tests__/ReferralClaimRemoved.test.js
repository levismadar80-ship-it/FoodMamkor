/**
 * MEH-2374: the friend-referral flow is removed from the frontend.
 *
 * The /ref/[code] landing page stored a code that RegisterClient posted to
 * /referral/claim right after signup — unauthenticated since MEH-328, so it
 * always 401'd, and no screen ever showed a user her link.
 *
 * DISCRIMINATION: on the old tree both the route file and the claim call
 * exist, so each assertion goes red.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

describe("MEH-2374 — referral claim removed", () => {
  it("has no /ref/[code] landing route", () => {
    expect(existsSync(path.join(root, "app", "[locale]", "ref", "[code]", "page.js"))).toBe(false);
  });

  it("RegisterClient no longer posts /referral/claim", () => {
    const src = readFileSync(path.join(root, "app", "[locale]", "register", "RegisterClient.jsx"), "utf8");
    // Control: we are reading the real file.
    expect(src).toContain("data-testid=\"register-form\"");
    expect(src).not.toContain("/referral/claim");
    expect(src).not.toContain("referral_code");
  });
});
