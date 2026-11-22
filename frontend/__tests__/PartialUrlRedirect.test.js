/**
 * MEH-3076: /organizers and /freshness have no index page, so the bare path
 * fell into the business [slug] route («בית העסק הזה לא נמצא»). They now
 * redirect to the page that lists the thing. next.config.js cannot be
 * required under jsdom, so the rules are read from its text (a config shape:
 * nothing else runs it in this suite).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const config = fs
  .readFileSync(path.join(process.cwd(), "next.config.js"), "utf-8")
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

/** @param {string} source */
function destinationOf(source) {
  const at = config.indexOf(`source: "${source}"`);
  if (at === -1) return null;
  const rule = config.slice(at, config.indexOf("}", at));
  const m = rule.match(/destination:\s*"([^"]+)"/);
  return m ? m[1] : null;
}

describe("bare sub-route folders redirect instead of «business not found»", () => {
  it.each([
    ["/:locale(he|en)/organizers", "/:locale/events"],
    ["/organizers", "/events"],
    ["/:locale(he|en)/freshness", "/:locale"],
    ["/freshness", "/"],
  ])("%s → %s", (source, dest) => {
    expect(destinationOf(source)).toBe(dest);
  });

  it("control: a rule that predates this change is found, a missing one is not", () => {
    expect(destinationOf("/search")).toBe("/producers");
    expect(destinationOf("/no-such-rule")).toBeNull();
  });
});
