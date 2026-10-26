import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QUEUES } from "@/app/[locale]/admin/queues";

/**
 * MEH-2359 — every per-queue stat key the admin nav + home read must be a key the
 * backend's /admin/dashboard `stats` dict actually ships. A missing key reads as
 * `null` → "nothing to show" on the home (a false all-clear), so key drift
 * between admin/queues.js and admin_extra.py has to go red here, not in
 * production. The check is textual on purpose: the backend builds `stats` as a
 * literal dict, so `"<key>":` is the contract line itself.
 */
const ADMIN_EXTRA = readFileSync(
  resolve(__dirname, "../../backend/app/routers/admin_extra.py"),
  "utf8",
);
// From `stats = {` to the dict's closing brace (4-space indent), so a key that
// only appears in a LATER dict in the file cannot satisfy the check.
const statsStart = ADMIN_EXTRA.indexOf("stats = {");
const statsEnd = ADMIN_EXTRA.indexOf("\n    }\n", statsStart);
const statsBlock = ADMIN_EXTRA.slice(statsStart, statsEnd);

describe("admin queues ↔ /admin/dashboard stats contract (MEH-2359)", () => {
  it("control: the backend stats dict is where we think it is, and the slice stops at its end", () => {
    expect(statsStart).toBeGreaterThan(0);
    expect(statsEnd).toBeGreaterThan(statsStart);
    expect(statsBlock).toContain('"pending_producers":');
    // A key the endpoint returns OUTSIDE `stats` (top-level) must not be inside the slice.
    expect(ADMIN_EXTRA).toContain('"recent_activity":');
    expect(statsBlock).not.toContain('"recent_activity":');
  });

  it.each(QUEUES.map((q) => [q.key, q.stat]))(
    "queue %s reads a stat key the backend ships (%s)",
    (_key, stat) => {
      expect(statsBlock).toContain(`"${stat}":`);
    },
  );
});
