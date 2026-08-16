/**
 * MEH-2093 chunk A — the address suggestion list must clear an inline Leaflet map.
 *
 * Why this guard exists: two consumers (RegisterProducerClient — register step 2,
 * LocationsEditor — dashboard locations) render AddressSearch as a sibling of a
 * MiniMap. Nothing between them creates a stacking context, so the map's panes
 * (leaflet.css:107, z-400) and its controls (globals.css, forced to z-1000/1001)
 * compete with the suggestion list in the PAGE-level stacking context. At the
 * original `z-50` the list lost and was clipped at the map's top edge.
 *
 * The bounds are derived from the two neighbours rather than restated, so a
 * future move of the header token cannot silently desync this test from the
 * ledger it encodes (.claude/rules/rtl.md § Map z-index tokens).
 */
import fs from "node:fs";
import path from "node:path";
import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import AddressSearch from "@/components/AddressSearch";
import { autocompleteAddresses, resolveSuggestion } from "@/lib/places";

vi.mock("@/lib/places", () => ({
  autocompleteAddresses: vi.fn(),
  resolveSuggestion: vi.fn(),
  newSessionToken: vi.fn(() => "sess-test"),
}));

const ROOT = path.resolve(__dirname, "..");

/** Highest z-index Leaflet can put on screen inside one of our maps. */
const LEAFLET_CEILING = 1001; // globals.css — attribution, `z-index: 1001 !important`

/** The header's own token, read from source so this test tracks the real value. */
function headerZFromSource() {
  const src = fs.readFileSync(path.join(ROOT, "components/Header.jsx"), "utf8");
  const m = src.match(/sticky top-0 z-\[(\d+)\]/);
  if (!m) throw new Error("Header.jsx: could not find the sticky header z token");
  return Number(m[1]);
}

/** The listbox's z token, read off the element the component actually renders. */
function listboxZ(el) {
  const m = el.className.match(/(?:^|\s)z-\[(\d+)\]/);
  if (!m) {
    const plain = el.className.match(/(?:^|\s)z-(\d+)(?:\s|$)/);
    if (plain) return Number(plain[1]); // Tailwind scale form, e.g. the old `z-50`
    throw new Error(`no z utility on the listbox: "${el.className}"`);
  }
  return Number(m[1]);
}

function Harness() {
  const [v, setV] = useState("");
  return (
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <AddressSearch id="addr" value={v} onChange={setV} onSelect={vi.fn()} />
    </NextIntlClientProvider>
  );
}

async function openListbox() {
  render(<Harness />);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "שרה" } });
  await screen.findByRole("option", {}, { timeout: 2000 });
  return screen.getByRole("listbox");
}

beforeEach(() => {
  vi.clearAllMocks();
  autocompleteAddresses.mockResolvedValue([
    { id: 1, primary: "שרה", secondary: "רמת צבי · זכרון יעקב", provider: "nominatim", raw: {} },
  ]);
  resolveSuggestion.mockImplementation(async (s) => s.raw);
});

describe("AddressSearch suggestion list — stacking (MEH-2093 chunk A)", () => {
  it("paints above every layer an inline Leaflet map can produce", async () => {
    const z = listboxZ(await openListbox());
    // Fails at the original z-50 (50 > 1001 is false) — this is the assertion
    // that encodes the bug Sapir screenshotted on 16/08.
    expect(z).toBeGreaterThan(LEAFLET_CEILING);
  });

  it("stays below the global header, which must keep winning", async () => {
    const z = listboxZ(await openListbox());
    expect(z).toBeLessThan(headerZFromSource());
  });

  it("changes ONLY the z utility — every other class on the list is untouched", async () => {
    const el = await openListbox();
    // The map-less consumers (EventForm, ExperienceForm, admin ProducerForm) share
    // this exact element; asserting the non-z classes here asserts it for them too.
    const nonZ = el.className.split(/\s+/).filter((c) => !/^z-/.test(c));
    expect(nonZ).toEqual([
      "absolute",
      "mt-1",
      "w-full",
      "bg-white",
      "border",
      "border-border",
      "rounded-[8px]",
      "shadow-lg",
      "max-h-72",
      "overflow-auto",
    ]);
    // exactly one z utility, never two competing ones
    expect(el.className.split(/\s+/).filter((c) => /^z-/.test(c))).toHaveLength(1);
  });
});
