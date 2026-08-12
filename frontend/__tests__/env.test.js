import { afterEach, describe, it, expect, vi } from "vitest";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const buildSchema = (runtimeEnv) =>
  createEnv({
    server: { SITE_URL: z.string().url().optional() },
    client: {
      NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
      NEXT_PUBLIC_SUPPORT_PHONE: z.string().regex(/^\d{10,15}$/).optional(),
    },
    experimental__runtimeEnv: {
      NEXT_PUBLIC_SITE_URL: runtimeEnv.NEXT_PUBLIC_SITE_URL,
      NEXT_PUBLIC_SUPPORT_PHONE: runtimeEnv.NEXT_PUBLIC_SUPPORT_PHONE,
    },
  });

describe("env validation", () => {
  it("accepts valid env vars", () => {
    const env = buildSchema({
      NEXT_PUBLIC_SITE_URL: "https://mehamakor.co.il",
      NEXT_PUBLIC_SUPPORT_PHONE: "972500000000",
    });
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://mehamakor.co.il");
  });

  it("accepts missing optional vars", () => {
    const env = buildSchema({});
    expect(env.NEXT_PUBLIC_SITE_URL).toBeUndefined();
  });

  it("throws on invalid URL", () => {
    expect(() =>
      buildSchema({ NEXT_PUBLIC_SITE_URL: "not-a-url" }),
    ).toThrow();
  });

  it("throws on invalid phone format", () => {
    expect(() =>
      buildSchema({ NEXT_PUBLIC_SUPPORT_PHONE: "abc" }),
    ).toThrow();
  });
});

// MEH-464: regression test for the CLIENT-SAFE INVARIANT documented at the
// top of frontend/lib/env.client.js. vitest defaults to environment: "jsdom"
// (see vitest.config.js) so this import evaluates in a client-shaped context.
// If a future edit reintroduces a non-NEXT_PUBLIC_* module-level access in
// env.client.js, T3 env's runtime guard throws here at import time,
// reproducing PR #499 / hotfix #2 before the bug ever reaches staging.
describe("env.client.js — CLIENT-SAFE INVARIANT (MEH-464)", () => {
  // Env stubs are process-wide and vitest shares one process per file, so an
  // un-restored stub here leaks into the MEH-1754 block below and silently
  // supplies the value those tests exist to control.
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("evaluates without throwing when imported in a client-shaped context", async () => {
    await expect(import("../lib/env.client.js")).resolves.toBeDefined();
  });

  it("exports SITE_URL as a non-empty string (fallback or NEXT_PUBLIC_SITE_URL)", async () => {
    const { SITE_URL } = await import("../lib/env.client.js");
    expect(typeof SITE_URL).toBe("string");
    expect(SITE_URL.length).toBeGreaterThan(0);
  });

  it("exports API_URL verbatim from NEXT_PUBLIC_API_URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
    vi.resetModules();
    const { API_URL } = await import("../lib/env.client.js");
    expect(API_URL).toBe("https://api.example.test");
  });
});

// MEH-1754 item 5: NEXT_PUBLIC_API_URL is REQUIRED and carries no fallback.
// These assert the real module (never a copy of its schema — the copy is free
// to drift from the one that ships), and they discriminate: against the
// pre-MEH-1754 `.optional()` + `|| "http://localhost:8000"` form, the first two
// fail — the import resolved instead of throwing, and API_URL was the localhost
// literal instead of undefined. Demonstrated red-then-green on the PR.
//
// env.client.js skips validation when NODE_ENV === "test", which is always true
// under vitest — so the required-ness case has to stub NODE_ENV to turn the
// schema back on. Without that stub this suite is green either way, which is
// exactly the "two possible causes" green .claude/rules/testing.md warns about.
//
// The `undefined` second argument to vi.stubEnv is vitest's documented way to
// DELETE an env var (not a useless literal): the "absent" cases must not depend
// on the ambient shell happening to leave NEXT_PUBLIC_API_URL unset, or they
// would be green for two different reasons.
/* eslint-disable unicorn/no-useless-undefined */
describe("env.client.js — NEXT_PUBLIC_API_URL is required (MEH-1754)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws at import when the var is absent and validation is on", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SKIP_ENV_VALIDATION", undefined);
    vi.stubEnv("NEXT_PUBLIC_API_URL", undefined);
    vi.resetModules();
    await expect(import("../lib/env.client.js")).rejects.toThrow(
      /Invalid environment variables/i,
    );
  });

  it("imports cleanly when the var is present and validation is on", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SKIP_ENV_VALIDATION", undefined);
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
    vi.resetModules();
    const { API_URL } = await import("../lib/env.client.js");
    expect(API_URL).toBe("https://api.example.test");
  });

  it("does not substitute a localhost fallback when the var is absent", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", undefined);
    vi.resetModules();
    const { API_URL } = await import("../lib/env.client.js");
    expect(API_URL).toBeUndefined();
  });
});
/* eslint-enable unicorn/no-useless-undefined */
