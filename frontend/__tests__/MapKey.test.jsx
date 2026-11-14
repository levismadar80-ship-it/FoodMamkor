/**
 * MEH-2424 — "מה רואים במפה?": the map's marker key, on every viewport.
 *
 * The map draws six kinds of marks (seven until the pickup-layer toggle left, 13/11) and, on a phone, explained none of them
 * (the desktop legend lists categories only). The key is a ? control in the
 * map's own control column that opens a panel with one row per mark, each row
 * drawn with the same visual the map uses. Rendered with the REAL he.json so
 * the assertions read the approved copy, not key names.
 *
 * Cells (CLAUDE.md § conditional-UI states): closed → open → closed by each of
 * the three exits (the toggle again, the ✕, Escape).
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import MapKey from "@/app/[locale]/map/components/MapKey";
import { styleForProducer } from "@/lib/category-registry";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Leaflet factories that put something visible on the map, counted per kind in
// CODE only (comments stripped), constructor forms folded into the factory name.
function markerCallSites(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/([^:"'`])\/\/.*$/gm, "$1");
  const re = /\b(?:new\s+)?L\.(divIcon|icon|marker|circleMarker|circle|polygon|polyline|rectangle|imageOverlay|svgOverlay|videoOverlay|popup|tooltip)\(/gi;
  const out = {};
  for (const m of code.matchAll(re)) {
    const name = `L.${m[1][0].toLowerCase()}${m[1].slice(1)}`;
    out[name] = (out[name] ?? 0) + 1;
  }
  return out;
}

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const K = he.map.pane.key;

function renderKey() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <MapKey />
    </NextIntlClientProvider>,
  );
}

const toggle = () => screen.getByRole("button", { name: K.title });

describe("map key (MEH-2424)", () => {
  it("starts closed: the ? control is there, the panel is not", () => {
    renderKey();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("map-key-panel")).toBeNull();
  });

  it("opens a panel titled with the question, one row per mark, in order", () => {
    renderKey();
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByTestId("map-key-panel");
    expect(within(panel).getByRole("heading", { name: K.title })).toBeInTheDocument();
    const rows = within(panel).getAllByTestId("map-key-row");
    expect(rows.map((r) => r.textContent)).toEqual([
      K.photo,
      K.verified,
      K.cluster,
      K.same_business,
      K.pickup,
      K.approximate,
      K.dimmed,
      K.my_location,
    ]);
  });

  // MEH-3119: the pickup sample used a green leaf while the map draws a pickup
  // point in its business's category colour + glyph. The sample now comes from
  // the same registry call as the map (styleForProducer), bakery as example.
  it("draws the pickup sample in a category colour, not the primary green", () => {
    renderKey();
    fireEvent.click(toggle());
    const row = screen.getAllByTestId("map-key-row").find((r) => r.textContent === K.pickup);
    const ring = row.closest("li").querySelector("[style]");
    const bakery = styleForProducer({ categories: [{ name: "לחמים ואפייה" }] });
    expect(ring).not.toBeNull();
    expect(ring.style.borderColor).toBe(hexToRgb(bakery.color));
  });

  // MEH-3119: the key went stale once the map grew marks it did not explain.
  // Every mark the map draws is built at a Leaflet factory call in
  // MapComponent.jsx. Each call site is listed here WITH the key rows that
  // explain it; a new call site (or a removed one) turns the count red, and
  // the entry it then needs must name rows the panel really renders. It is a
  // tripwire, not a proof: it cannot tell that a row's drawing is right.
  it("every marker the map creates has a key row", () => {
    const src = readFileSync(resolve(__dirname, "../components/MapComponent.jsx"), "utf8");
    const sites = markerCallSites(src);
    const KNOWN = {
      "L.divIcon": [
        ["photo", "verified", "approximate", "dimmed"], // createCategoryMarker
        ["pickup", "approximate", "dimmed"], // createSecondaryMarker
        ["same_business"], // createSingleBusinessClusterIcon
        ["cluster"], // iconCreateFunction
      ],
      "L.circleMarker": [["my_location"]],
      "L.marker": [[]], // every pin; it wears one of the divIcons above
    };
    expect(sites).toEqual(Object.fromEntries(Object.entries(KNOWN).map(([k, v]) => [k, v.length])));
    renderKey();
    fireEvent.click(toggle());
    const rendered = screen.getAllByTestId("map-key-row").map((r) => r.textContent);
    const explained = [...new Set(Object.values(KNOWN).flat(2))];
    // both directions: every listed row is on screen, and no row on screen is unowned
    expect(explained.map((k) => K[k]).sort()).toEqual([...rendered].sort());
  });

  // The tripwire's own control (testing.md: a probe ships with a self-test):
  // it must see a new factory call, a `new L.Marker`, and must NOT count a
  // call that only appears in a comment.
  it("markerCallSites: counts code, ignores comments, sees constructor forms", () => {
    expect(markerCallSites("const a = L.divIcon({});\n// L.divIcon( in a comment\n/* L.circle( */")).toEqual({ "L.divIcon": 1 });
    expect(markerCallSites("new L.Marker(x); L.imageOverlay(u, b); L.popup()")).toEqual({ "L.marker": 1, "L.imageOverlay": 1, "L.popup": 1 });
    const real = readFileSync(resolve(__dirname, "../components/MapComponent.jsx"), "utf8");
    expect(markerCallSites(real + "\nL.divIcon({ html: '' });")["L.divIcon"]).toBe(markerCallSites(real)["L.divIcon"] + 1);
  });

  it.each([
    ["the toggle again", () => fireEvent.click(toggle())],
    ["the ✕", () => fireEvent.click(screen.getByRole("button", { name: he.common.aria.close }))],
    ["Escape", () => fireEvent.keyDown(document, { key: "Escape" })],
  ])("closes with %s", (_label, close) => {
    renderKey();
    fireEvent.click(toggle());
    expect(screen.getByTestId("map-key-panel")).toBeInTheDocument();
    close();
    expect(screen.queryByTestId("map-key-panel")).toBeNull();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });
});
