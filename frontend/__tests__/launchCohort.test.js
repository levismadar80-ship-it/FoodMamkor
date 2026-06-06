import { describe, it, expect } from "vitest";
import { computeLaunchCohort } from "@/lib/launch-cohort";

// MEH-434 — launch window is hardcoded LAUNCH_START 2026-05-15 + 30d
// (LAUNCH_END 2026-06-14, exclusive). These cases pin the boundary
// behavior so a launch-day bump of LAUNCH_START stays intentional.
describe("computeLaunchCohort", () => {
  it("returns month_1 for a user created inside the window", () => {
    expect(computeLaunchCohort("2026-05-20T10:00:00Z")).toBe("month_1");
  });

  it("includes the LAUNCH_START boundary (inclusive)", () => {
    expect(computeLaunchCohort("2026-05-15T00:00:00Z")).toBe("month_1");
  });

  it("excludes the LAUNCH_END boundary (exclusive)", () => {
    expect(computeLaunchCohort("2026-06-14T00:00:00Z")).toBeNull();
  });

  it("returns null for a user created before the window", () => {
    expect(computeLaunchCohort("2026-05-01T00:00:00Z")).toBeNull();
  });

  it("returns null for a user created after the window", () => {
    expect(computeLaunchCohort("2026-07-01T00:00:00Z")).toBeNull();
  });

  it("returns null for missing / invalid input (never throws)", () => {
    expect(computeLaunchCohort(null)).toBeNull();
    expect(computeLaunchCohort(undefined)).toBeNull();
    expect(computeLaunchCohort("")).toBeNull();
    expect(computeLaunchCohort("not-a-date")).toBeNull();
  });
});
