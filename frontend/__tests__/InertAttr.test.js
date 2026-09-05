/**
 * MEH-2253 — `inert` must be PRESENT on the parked StickyContactBar in the
 * React that actually renders the page, not only in the one vitest runs.
 *
 * Two real renderers, no copies: node_modules react 18.3.1 (what vitest and
 * every component test use) and Next's vendored React (what the App Router
 * builds and serves with). The two rows that fail-by-construction are the
 * bug this ticket is about: the pre-fix `""` idiom under the shipped React,
 * and the naive `true` under the test React — each drops the attribute in
 * the other runtime. The helper picks per version, so it is right in both.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

import { inertAttrValueFor, INERT_PRESENT } from "@/lib/inert-attr";

const req = createRequire(import.meta.url);
const R18 = req("react");
const D18 = req("react-dom/server");
// The App Router alias target. Not a public API, but it IS the runtime the
// page ships with — a test that never touches it cannot see this bug.
const R19 = req("next/dist/compiled/react");
const D19 = req("next/dist/compiled/react-dom/server");

const markup = (R, D, inert) =>
  D.renderToStaticMarkup(R.createElement("div", { inert }, "x"));

describe("inertAttrValueFor — picks the value each React serializes as present", () => {
  it("anchors: the two runtimes really are on different majors", () => {
    expect(R18.version.split(".")[0]).toBe("18");
    expect(Number(R19.version.split(".")[0])).toBeGreaterThanOrEqual(19);
  });

  it("returns '' below 19 and true from 19 on; INERT_PRESENT follows the importing React", () => {
    expect(inertAttrValueFor("18.3.1")).toBe("");
    expect(inertAttrValueFor(R19.version)).toBe(true);
    expect(inertAttrValueFor(undefined)).toBe(""); // unknown → the pass-through idiom
    expect(INERT_PRESENT).toBe(inertAttrValueFor(R18.version)); // vitest imports react 18
  });

  it("react 18: the helper's value renders inert; the naive `true` is dropped (control)", () => {
    expect(markup(R18, D18, inertAttrValueFor(R18.version))).toContain('inert=""');
    expect(markup(R18, D18, true)).not.toContain("inert");
  });

  it("Next's shipped React: the helper's value renders inert; the OLD `\"\"` idiom is dropped — the MEH-2253 bug", () => {
    expect(markup(R19, D19, inertAttrValueFor(R19.version))).toContain('inert=""');
    expect(markup(R19, D19, "")).not.toContain("inert");
  });

  it("both runtimes: undefined removes the attribute (the visible-bar branch)", () => {
    expect(markup(R18, D18, undefined)).not.toContain("inert");
    expect(markup(R19, D19, undefined)).not.toContain("inert");
  });
});
