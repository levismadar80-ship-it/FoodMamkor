import { describe, it, expect } from "vitest";
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
  it("evaluates without throwing when imported in a client-shaped context", async () => {
    await expect(import("../lib/env.client.js")).resolves.toBeDefined();
  });

  it("exports SITE_URL as a non-empty string (fallback or NEXT_PUBLIC_SITE_URL)", async () => {
    const { SITE_URL } = await import("../lib/env.client.js");
    expect(typeof SITE_URL).toBe("string");
    expect(SITE_URL.length).toBeGreaterThan(0);
  });

  it("exports API_URL as a non-empty string (fallback or NEXT_PUBLIC_API_URL)", async () => {
    const { API_URL } = await import("../lib/env.client.js");
    expect(typeof API_URL).toBe("string");
    expect(API_URL.length).toBeGreaterThan(0);
  });
});
