/**
 * MEH-1433 follow-up — pin formatCompact's locale-aware compact output.
 *
 * The `he` compact suffix is ICU-data-dependent: some runtimes append a
 * trailing RLM (U+200F) after "K"/"M", others don't. These assertions lock the
 * contract WITHOUT relying on visual QA, and use startsWith/contains for the
 * `he` case so the RLM can never fail the match. Guards dev/CI/prod divergence.
 *
 * formatCompact is a named export of the insights page (a "use client"
 * module). We import ONLY the pure function — never mounting the page — and
 * stub its side-effecting imports (api, i18n/navigation) so the module
 * evaluates cleanly in jsdom (mirrors EditTabCategoriesCard.test.jsx).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/i18n/navigation", () => ({ Link: () => null }));

import { formatCompact } from "@/app/[locale]/producer/dashboard/insights/page";

describe("formatCompact", () => {
  it("renders 4-digit values compactly in both locales (RLM-tolerant)", () => {
    // startsWith, not ===: `he` may append a trailing RLM (U+200F) after "K".
    expect(formatCompact(2540, "he").startsWith("2.5K")).toBe(true);
    expect(formatCompact(2540, "en").startsWith("2.5K")).toBe(true);
    expect(formatCompact(2540, "he")).toContain("2.5K");
  });

  it("leaves values under 1000 unsuffixed", () => {
    expect(formatCompact(540, "he")).toBe("540");
    expect(formatCompact(540, "en")).toBe("540");
  });

  it("renders the zero-state as a bare 0", () => {
    expect(formatCompact(0, "he")).toBe("0");
    expect(formatCompact(0, "en")).toBe("0");
  });

  it("compacts 6-digit values to K in en", () => {
    expect(formatCompact(250000, "en")).toBe("250K");
  });

  it("defaults nullish input to 0 (windows?.total ?? 0 parity)", () => {
    expect(formatCompact(null, "en")).toBe("0");
    expect(formatCompact(undefined, "en")).toBe("0");
  });
});
