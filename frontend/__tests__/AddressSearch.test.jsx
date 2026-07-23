/**
 * MEH-1234 — AddressSearch component wiring.
 *
 * lib/places is mocked (provider logic is unit-tested in places.test.js) so
 * this focuses on the component: typing → debounced autocomplete → suggestions
 * render → select resolves the place and fires onChange/onSelect with the
 * normalized shape. Covers the no-key fallback path (default mock) end-to-end.
 */
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

const PLACE = {
  street: "שרה",
  neighborhood: "רמת צבי",
  city: "זכרון יעקב",
  postcode: "",
  lat: 32.5,
  lng: 34.9,
  displayName: "שרה, זכרון יעקב",
};

function Harness({ onSelect }) {
  const [v, setV] = useState("");
  return (
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <AddressSearch id="addr" value={v} onChange={setV} onSelect={onSelect} />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  autocompleteAddresses.mockResolvedValue([
    { id: 1, primary: "שרה", secondary: "רמת צבי · זכרון יעקב", provider: "nominatim", raw: PLACE },
  ]);
  resolveSuggestion.mockImplementation(async (s) => s.raw);
});

describe("AddressSearch (MEH-1234)", () => {
  it("typing ≥3 chars triggers autocomplete and renders the suggestion", async () => {
    render(<Harness onSelect={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "שרה" } });

    const option = await screen.findByRole("option", {}, { timeout: 2000 });
    expect(option).toHaveTextContent("שרה");
    expect(option).toHaveTextContent("רמת צבי · זכרון יעקב");
    expect(autocompleteAddresses).toHaveBeenCalledWith(
      "שרה",
      expect.objectContaining({ sessionToken: "sess-test" }),
    );
  });

  it("does not query below 3 chars", async () => {
    render(<Harness onSelect={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "שר" } });
    // Give the debounce window a chance to (not) fire.
    await new Promise((r) => setTimeout(r, 600));
    expect(autocompleteAddresses).not.toHaveBeenCalled();
  });

  it("selecting a suggestion resolves the place and fires onSelect", async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "שרה" } });

    const option = await screen.findByRole("option", {}, { timeout: 2000 });
    fireEvent.mouseDown(option);

    await vi.waitFor(() => expect(onSelect).toHaveBeenCalledWith(PLACE));
    expect(resolveSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "nominatim" }),
      expect.objectContaining({ sessionToken: "sess-test" }),
    );
  });
});
