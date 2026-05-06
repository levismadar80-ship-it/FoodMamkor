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
