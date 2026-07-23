/**
 * MEH-1057 — /upgrade production gate regression lock.
 *
 * Both guards (UpgradePage + generateMetadata) call notFound() when
 * NODE_ENV === "production". If a future refactor drops either guard, the
 * orphan plan-comparison page silently reactivates in production with no
 * CI signal — these tests are that signal. The route is meant to return
 * post-launch by deleting the guards AND this file together (MEH-617).
 */
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    // Mirrors Next's real behavior: notFound() throws, so nothing after it runs.
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key) => key),
}));

// UpgradeClient pulls client-only deps; the gate test never renders it.
vi.mock("@/app/[locale]/upgrade/UpgradeClient", () => ({
  default: () => null,
}));

import UpgradePage, { generateMetadata } from "@/app/[locale]/upgrade/page";
import { notFound } from "next/navigation";

const params = () => Promise.resolve({ locale: "he" });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("MEH-1057 /upgrade production gate", () => {
  it("UpgradePage calls notFound() in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => UpgradePage()).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("generateMetadata calls notFound() in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(generateMetadata({ params: params() })).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("UpgradePage renders outside production (route returns post-launch)", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(() => UpgradePage()).not.toThrow();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("generateMetadata resolves outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const meta = await generateMetadata({ params: params() });
    expect(meta).toHaveProperty("title");
    expect(notFound).not.toHaveBeenCalled();
  });
});
