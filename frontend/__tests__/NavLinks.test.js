// MEH-2994: one builder for Waze / Google Maps links. The URLs are pinned to
// exactly what MiniMap.jsx, DeliveryBlock.jsx and lib/event-when.js built
// before the move, and the guard below reds if a fourth copy appears.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { coordsNavLinks, addressNavLinks } from "@/lib/nav-links";
import { addressNavLinks as reexported } from "@/lib/event-when";

describe("coordsNavLinks", () => {
  it("builds the pre-MEH-2994 URLs from a point (numbers and numeric strings)", () => {
    expect(coordsNavLinks(32.5, 34.9)).toEqual({
      waze: "https://waze.com/ul?ll=32.5,34.9&navigate=yes",
      google: "https://www.google.com/maps/dir/?api=1&destination=32.5,34.9",
    });
    expect(coordsNavLinks("32.5", "34.9").waze).toBe("https://waze.com/ul?ll=32.5,34.9&navigate=yes");
  });
  it("is null when either coordinate is missing or not a number", () => {
    expect(coordsNavLinks(null, 34.9)).toBeNull();
    expect(coordsNavLinks(32.5, undefined)).toBeNull();
    expect(coordsNavLinks("abc", 34.9)).toBeNull();
  });
});

describe("addressNavLinks", () => {
  it("joins the non-empty parts and encodes them", () => {
    expect(addressNavLinks("הנשיא 5", " ", "חדרה")).toEqual({
      waze: `https://waze.com/ul?q=${encodeURIComponent("הנשיא 5, חדרה")}&navigate=yes`,
      google: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("הנשיא 5, חדרה")}`,
    });
  });
  it("is null with no address", () => {
    expect(addressNavLinks("", null)).toBeNull();
  });
  it("lib/event-when keeps re-exporting the same function", () => {
    expect(reexported).toBe(addressNavLinks);
  });
});

describe("one builder (guard)", () => {
  const ROOT = path.resolve(__dirname, "..");
  const walk = (d) =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) return e.name === "node_modules" || e.name === "__tests__" ? [] : walk(p);
      return /\.(js|jsx)$/.test(e.name) ? [p] : [];
    });
  const files = ["app", "components", "lib"].flatMap((d) => walk(path.join(ROOT, d)));

  it("control: the scan reads the builder itself", () => {
    const hits = files.filter((f) => fs.readFileSync(f, "utf8").includes("waze.com/ul"));
    expect(hits.map((f) => path.relative(ROOT, f))).toContain(path.join("lib", "nav-links.js"));
  });
  it("no file outside lib/nav-links.js builds a Waze or Google Maps nav URL", () => {
    const offenders = files
      .filter((f) => !f.endsWith(path.join("lib", "nav-links.js")))
      .filter((f) => /waze\.com\/ul|google\.com\/maps\/(dir|search)/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f));
    expect(offenders, "build nav links with lib/nav-links.js").toEqual([]);
  });
});
