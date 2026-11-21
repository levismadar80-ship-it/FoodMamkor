/**
 * MEH-3486 · MEH-3488 — two E2E clicks that must go through their helper.
 *
 * Both flakes had the same shape: a spec clicked an element it had never
 * checked could take the click, and the failure surfaced as a 20 s timeout or
 * three steps later on an unrelated locator.
 *
 *  - map.spec.ts (since MEH-3540: `manual/map-NN.spec.ts`, helpers in
 *    `manual/_map-shared.ts`) clicked a marker that, on a short phone (iPhone 13, 390×664),
 *    sat under the PEEK sheet. `tapMarker` hit-tests the pin, drags the map
 *    until it clears the sheet, and fails by name if it is still covered.
 *  - Register specs picked a town with fill() + option.click() and trusted the
 *    click. `pickCity` (`e2e/flows/_pick-city.ts`) waits for the row to be
 *    still, clicks it, and requires the list closed and the field holding it.
 *
 * Reads RAW text and drops only whole comment lines. A block-comment stripper
 * was tried first and was blind: the glob string "**\/admin/producers/*\/…"
 * contains "/*" and swallowed 56 lines of admin-producer-form-licence.spec.ts,
 * including the bare pick this guard exists to catch (fresh review, PR #4930).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const FLOWS = path.join(ROOT, "e2e", "flows");
// MEH-3540: the map spec was split into map-NN.spec.ts parts; tapMarker lives
// in _map-shared.ts. All of them are read as one source.
const MANUAL = path.join(FLOWS, "manual");
const MAP_FILES = fs
  .readdirSync(MANUAL)
  .filter((n) => n === "_map-shared.ts" || /^map-\d+\.spec\.ts$/.test(n))
  .map((n) => path.join(MANUAL, n));

/** Drop lines that are only a comment (`//…`, ` * …`, `/** …`); keep everything else verbatim. */
function code(text) {
  return text
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .join("\n");
}

function specs(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) specs(full, out);
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

// A click on a suggestion row, possibly across a chain. Assertions on rows
// (toHaveCount, toBeVisible) are not clicks and stay allowed.
const OPTION_CLICK = /getByRole\(\s*["']option["'][^;]*?\.click\(/s;
// …that belongs to a town field: the register wrapper, or a locator named city.
const CITY_STMT = /register-details-city|\bcity\b/;

function cityPickOffenders(file, src) {
  return code(src)
    .split(";")
    .filter((stmt) => OPTION_CLICK.test(`${stmt};`) && CITY_STMT.test(stmt))
    .map((stmt) => `${path.relative(ROOT, file)}: ${stmt.trim().slice(0, 140)}`);
}

/** Body of `async function tapMarker(` up to the next top-level `}`. */
function tapMarkerBody(src) {
  const start = src.indexOf("async function tapMarker(");
  if (start < 0) return null;
  const end = src.indexOf("\n}\n", start);
  return src.slice(start, end);
}
const MARKER_CLICK = /markerOf\([^;]*?\.click\(/gs;

describe("E2E click preconditions (MEH-3486 · MEH-3488)", () => {
  it("self-test: the city pattern sees the old forms, passes the new, and survives a glob string", () => {
    const f = "x.spec.ts";
    expect(cityPickOffenders(f, `await page.getByTestId("register-details-city").getByRole("option", { name: "תל אביב" }).first().click();`)).toHaveLength(1);
    expect(cityPickOffenders(f, `await city.getByRole("option").first().click();`)).toHaveLength(1);
    expect(cityPickOffenders(f, `await expect(city.getByRole("option")).toHaveCount(0);`)).toHaveLength(0);
    expect(cityPickOffenders(f, `await pickCity(page.getByTestId("register-details-city"), "תל אביב");`)).toHaveLength(0);
    // the case that blinded the first version: a "/*" inside a string
    const glob = `await page.route("**/admin/producers/*/review-checks", r);\nconst city = x;\nawait city.getByRole("option").first().click();\nconst y = "*/";`;
    expect(cityPickOffenders(f, glob), "a '/*' inside a string must not hide code").toHaveLength(1);
  });

  it("self-test: the marker pattern sees chained and stored forms", () => {
    expect(`await markerOf(shell, p).click();`.match(MARKER_CLICK)).toHaveLength(1);
    expect(`await markerOf(shell, p).first().click();`.match(MARKER_CLICK)).toHaveLength(1);
    expect(`await markerOf(shell, pick(a, b)).click();`.match(MARKER_CLICK)).toHaveLength(1);
  });

  it("a town is picked only through pickCity, in every flows spec", () => {
    const all = specs(FLOWS).filter((f) => !f.endsWith("_pick-city.ts"));
    const offenders = all.flatMap((f) => cityPickOffenders(f, fs.readFileSync(f, "utf8")));
    const users = all.filter((f) => /pickCity\(/.test(fs.readFileSync(f, "utf8")));
    expect(users.length, "control: pickCity has no callers — the scan is looking in the wrong place").toBeGreaterThanOrEqual(8);
    expect(offenders, "use pickCity() from e2e/flows/_pick-city.ts").toEqual([]);
  });

  it("the map specs click a marker only inside tapMarker", () => {
    expect(
      MAP_FILES.filter((f) => /map-\d+\.spec\.ts$/.test(f)).length,
      "control: no map-NN.spec.ts parts found — the scan is looking in the wrong place",
    ).toBeGreaterThanOrEqual(2);
    const src = MAP_FILES.map((f) => code(fs.readFileSync(f, "utf8"))).join("\n");
    const body = tapMarkerBody(src);
    expect(body, "control: tapMarker must exist").not.toBeNull();
    expect(body.match(MARKER_CLICK) ?? [], "tapMarker itself must click the marker").toHaveLength(1);
    const outside = src.replace(body, "").match(MARKER_CLICK) ?? [];
    expect(outside, "a marker click outside tapMarker — call tapMarker(page, shell, p)").toEqual([]);
  });
});
