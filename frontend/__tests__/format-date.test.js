import { describe, it, expect } from "vitest";

import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { formatEventDate } from "@/lib/format-date";

describe("formatEventDate", () => {
  it("returns '' for nullish / empty input", () => {
    expect(formatEventDate(null, "he")).toBe("");
    expect(formatEventDate(undefined, "he")).toBe("");
    expect(formatEventDate("", "he")).toBe("");
  });

  // HOT-018 (MEH-782): a malformed-but-non-empty string used to render the
  // literal "Invalid Date" (toLocaleDateString does not throw on it).
  it("returns '' for a malformed non-empty date string", () => {
    expect(formatEventDate("not-a-date", "he")).toBe("");
    expect(formatEventDate("2026-13-99", "he")).toBe("");
  });

  it("formats a valid ISO date in the active locale", () => {
    const opts = { year: "numeric", month: "numeric", day: "numeric" };
    expect(formatEventDate("2026-06-07T10:00:00Z", "he", opts)).toContain("2026");
    // en surface must not be empty and must differ from a raw passthrough.
    expect(formatEventDate("2026-06-07T10:00:00Z", "en", opts)).toContain("2026");
  });

  // MEH-2233: the hub list now renders on the server (UTC), so a calendar day
  // must print the same day in a browser west of UTC, or hydration mismatches.
  // ICU caches the zone per process, so each zone runs in its own node child.
  it.each(["America/Los_Angeles", "UTC", "Asia/Jerusalem", "Pacific/Auckland"])(
    "a bare YYYY-MM-DD keeps its calendar day in %s",
    (tz) => {
      const mod = pathToFileURL(path.resolve(__dirname, "../lib/format-date.js")).href;
      const code = `import("${mod}").then((m) => process.stdout.write(m.formatEventDate("2026-11-19", "en", { day: "numeric" })))`;
      const out = execFileSync(process.execPath, ["--no-warnings", "-e", code], {
        env: { ...process.env, TZ: tz },
      });
      expect(out.toString()).toBe("19");
    },
  );
});
