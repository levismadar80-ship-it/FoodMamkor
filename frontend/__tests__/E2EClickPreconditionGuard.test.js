/**
 * MEH-3486 · MEH-3488 — two E2E clicks that must go through their helper.
 *
 * Both flakes had the same shape: a spec clicked an element it had never
 * checked could take the click, and the failure surfaced as a 20 s timeout or
 * three steps later on an unrelated locator.
 *
 *  - map.spec.ts clicked a marker that, on a short phone (iPhone 13, 390×664),
 *    sat under the PEEK sheet. `tapMarker` hit-tests the pin, drags the map
 *    until it clears the sheet, and fails by name if it is still covered.
 *  - Eleven register specs picked a town with fill() + option.click() and
 *    trusted the click. `pickCity` (`e2e/flows/_pick-city.ts`) waits for the
 *    row to be still, clicks, and requires the list closed and the field
 *    holding the town.
 *
 * This guard keeps the bare forms from coming back. It reads code, not
 * comments, so a comment that quotes the old form does not trip it.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const FLOWS = path.join(ROOT, "e2e", "flows");

function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function specs(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) specs(full, out);
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

// A click on a CitySearch suggestion row: `.getByRole("option" … ).click(`,
// on one line or across a chain. Assertions on rows (toHaveCount, toBeVisible)
// are not clicks and stay allowed.
const OPTION_CLICK = /getByRole\(\s*["']option["'][^;]*?\.click\(/s;
const CITY_FIELDS = /register-details-city/;

describe("E2E click preconditions (MEH-3486 · MEH-3488)", () => {
  it("self-test: the pattern sees the old forms and passes the new ones", () => {
    expect(OPTION_CLICK.test(`await page.getByTestId("register-details-city").getByRole("option", { name: "תל אביב" }).first().click();`)).toBe(true);
    expect(OPTION_CLICK.test(`await city.getByRole("option").first().click();`)).toBe(true);
    expect(OPTION_CLICK.test(`await expect(city.getByRole("option")).toHaveCount(0);`)).toBe(false);
    expect(OPTION_CLICK.test(`await pickCity(page.getByTestId("register-details-city"), "תל אביב");`)).toBe(false);
  });

  it("a register spec picks a town only through pickCity", () => {
    const offenders = [];
    for (const file of specs(FLOWS)) {
      if (file.endsWith("_pick-city.ts")) continue;
      const src = code(fs.readFileSync(file, "utf8"));
      if (!CITY_FIELDS.test(src) && !/CITY_QUERY/.test(src)) continue;
      for (const stmt of src.split(";")) {
        if (OPTION_CLICK.test(`${stmt};`) && (CITY_FIELDS.test(stmt) || /\bcity\b/.test(stmt))) {
          offenders.push(`${path.relative(ROOT, file)}: ${stmt.trim().slice(0, 140)}`);
        }
      }
    }
    // control: the scan must actually see the register specs it guards
    const scanned = specs(FLOWS).filter((f) => /register-details-city/.test(fs.readFileSync(f, "utf8")));
    expect(scanned.length, "control: no register spec found — the scan is looking in the wrong place").toBeGreaterThanOrEqual(5);
    expect(offenders, "use pickCity() from e2e/flows/_pick-city.ts").toEqual([]);
  });

  it("map.spec.ts clicks a marker only inside tapMarker", () => {
    const src = code(fs.readFileSync(path.join(FLOWS, "manual", "map.spec.ts"), "utf8"));
    const bare = src.match(/markerOf\([^)]*\)\.click\(/g) ?? [];
    expect(src, "control: tapMarker must exist").toMatch(/async function tapMarker\(/);
    expect(bare.length, "a marker click outside tapMarker — call tapMarker(page, shell, p)").toBe(1);
  });
});
