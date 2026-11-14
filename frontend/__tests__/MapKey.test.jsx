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
  // Every mark the map draws is created at one of these call sites in
  // MapComponent.jsx; a new one turns this red until it gets a key row (or a
  // reason here) and the list below is updated.
  it("every marker the map creates has a key row", () => {
    const src = readFileSync(resolve(__dirname, "../components/MapComponent.jsx"), "utf8");
    const sites = src.match(/L\.(divIcon|circleMarker|circle|icon|marker|polygon|polyline|rectangle)\(/g) ?? [];
    const KNOWN = {
      "L.divIcon(": ["photo/verified (createCategoryMarker)", "pickup (createSecondaryMarker)", "same_business (createSingleBusinessClusterIcon)", "cluster (iconCreateFunction)"],
      "L.circleMarker(": ["my_location"],
      "L.marker(": ["every pin — wears one of the divIcons above"],
    };
    const counts = sites.reduce((acc, k) => ({ ...acc, [k]: (acc[k] ?? 0) + 1 }), {});
    expect(counts).toEqual(Object.fromEntries(Object.entries(KNOWN).map(([k, v]) => [k, v.length])));
    renderKey();
    fireEvent.click(toggle());
    const texts = screen.getAllByTestId("map-key-row").map((r) => r.textContent);
    for (const k of ["photo", "verified", "pickup", "same_business", "cluster", "my_location", "dimmed", "approximate"]) {
      expect(texts, `key row for ${k}`).toContain(K[k]);
    }
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
