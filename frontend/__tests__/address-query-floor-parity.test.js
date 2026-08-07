import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * MEH-1936 — `ADDRESS_QUERY_FLOOR` in LocationsEditor is a second copy of the
 * query floor that AddressSearch actually enforces. Raised by the CI
 * adversarial reviewer: if AddressSearch's value changes, the editor's
 * "we couldn't find that address" line starts firing at the wrong moment, with
 * no compile error and no failing test — because the unit suite exercises the
 * editor's own constant, never the source of truth.
 *
 * That is workflow.md's Smell #1 (two owners for one fact), and the repo's
 * answer to it is a test that RE-DERIVES the claim rather than a comment
 * asserting it — the same shape as leaflet-inline-writers.test.js, which reads
 * the installed bundle instead of trusting prose about it.
 *
 * Why not simply export the constant from AddressSearch and import it: this
 * ticket's scope declares AddressSearch read-only ("REUSE, אפס עריכה"), and
 * editing it to satisfy a review note would be the scope breach the ticket
 * says to stop on. A test costs nothing there and catches the same drift, from
 * either side.
 */

const ROOT = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("address query floor is not silently duplicated (MEH-1936)", () => {
  // AddressSearch bails out below the floor with `if (q.length < N)`.
  const floorFromAddressSearch = () => {
    const src = read("components/AddressSearch.jsx");
    const m = src.match(/q\.length\s*<\s*(\d+)/);
    return m ? Number(m[1]) : null;
  };

  const floorFromEditor = () => {
    const src = read("app/[locale]/producer/dashboard/edit/LocationsEditor.jsx");
    const m = src.match(/const ADDRESS_QUERY_FLOOR\s*=\s*(\d+)/);
    return m ? Number(m[1]) : null;
  };

  // Run FIRST. A regex that stops matching would make the comparison below
  // pass for the wrong reason — `null === null` is agreement about nothing.
  // This is the self-test the classifier rule asks for, anchored to the real
  // files rather than to a fixture of the shape I expect them to have.
  it("both thresholds are actually found in their source files", () => {
    expect(floorFromAddressSearch()).toEqual(expect.any(Number));
    expect(floorFromEditor()).toEqual(expect.any(Number));
  });

  it("LocationsEditor's copy equals the floor AddressSearch enforces", () => {
    expect(floorFromEditor()).toBe(floorFromAddressSearch());
  });
});
