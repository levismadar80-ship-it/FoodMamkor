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

// MEH-1766: the hint's own copy, read from he.json so a copy edit can't quietly
// desync the assertion from what renders.
const HINT = he.search.address_search.no_results_hint;
const HINT_TESTID = "address-search-no-results-hint";

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

/**
 * MEH-1766 — visible degradation.
 *
 * The pre-MEH-1766 component swallowed both "matched nothing" and "provider
 * rejected the request" into an empty dropdown with no on-screen trace, so a
 * disabled Google key was indistinguishable from a bad street name. These specs
 * pin the state machine: the hint appears ONLY after a lookup has actually
 * completed and produced nothing, and the console tells the two causes apart.
 *
 * Shown failing by construction before the fix — see the PR body. Deleting the
 * hint element, or dropping either guard condition, reds a named case here.
 */
describe("AddressSearch — empty/error hint (MEH-1766)", () => {
  it("shows the hint after a completed query that returned zero results", async () => {
    autocompleteAddresses.mockResolvedValue([]);
    render(<Harness onSelect={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "דרך שרה" } });

    const hint = await screen.findByTestId(HINT_TESTID, {}, { timeout: 2000 });
    expect(hint).toHaveTextContent(HINT);
  });

  it("shows the hint when the provider REJECTS the lookup", async () => {
    const rejection = Object.assign(new Error("google address lookup rejected (HTTP 403)"), {
      name: "ProviderError",
      provider: "google",
      status: 403,
      detail: "PERMISSION_DENIED",
    });
    autocompleteAddresses.mockRejectedValue(rejection);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(<Harness onSelect={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "דרך שרה" } });

    const hint = await screen.findByTestId(HINT_TESTID, {}, { timeout: 2000 });
    expect(hint).toHaveTextContent(HINT);

    // The console must distinguish rejection from no-match — that distinction is
    // the whole point of the ticket, so assert the diagnostic, not just the hint.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("REJECTED"),
      expect.objectContaining({ provider: "google", status: 403 }),
    );
    warn.mockRestore();
  });

  it("logs a no-match distinctly from a rejection", async () => {
    autocompleteAddresses.mockResolvedValue([]);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(<Harness onSelect={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "דרך שרה" } });

    await screen.findByTestId(HINT_TESTID, {}, { timeout: 2000 });
    expect(info).toHaveBeenCalledWith(expect.stringContaining("genuine no-match"));
    expect(warn).not.toHaveBeenCalled();
    info.mockRestore();
    warn.mockRestore();
  });

  // NOTE (MEH-1619 discipline): both suppression specs below deliberately start
  // from a state where the hint is ALREADY showing. Asserting absence on a fresh
  // mount proves nothing — providerIssue is null there anyway, so the assertion
  // passes with the guard deleted. Verified: the naive "type 2 chars and assert
  // absent" form stayed GREEN with its guard removed. These forms go red.
  it("clears the hint when the field is emptied back below 3 chars", async () => {
    autocompleteAddresses.mockResolvedValue([]);
    render(<Harness onSelect={vi.fn()} />);
    const box = screen.getByRole("combobox");
    fireEvent.change(box, { target: { value: "דרך שרה" } });
    await screen.findByTestId(HINT_TESTID, {}, { timeout: 2000 }); // hint IS up

    fireEvent.change(box, { target: { value: "דר" } }); // back under the floor
    await vi.waitFor(() =>
      expect(screen.queryByTestId(HINT_TESTID)).toBeNull(),
    );
  });

  it("hides the hint while a follow-up lookup is in flight", async () => {
    autocompleteAddresses.mockResolvedValue([]);
    render(<Harness onSelect={vi.fn()} />);
    const box = screen.getByRole("combobox");
    fireEvent.change(box, { target: { value: "דרך שרה" } });
    await screen.findByTestId(HINT_TESTID, {}, { timeout: 2000 }); // hint IS up

    // The next lookup hangs, so loading flips true while providerIssue is still
    // "empty" — the only thing that can hide the hint here is the !loading guard.
    autocompleteAddresses.mockImplementation(() => new Promise(() => {}));
    fireEvent.change(box, { target: { value: "דרך שרה 12" } });
    await vi.waitFor(() =>
      expect(screen.queryByTestId(HINT_TESTID)).toBeNull(),
    );
  });

  it("does NOT show the hint on an aborted request", async () => {
    autocompleteAddresses.mockRejectedValue(
      Object.assign(new Error("aborted"), { name: "AbortError" }),
    );
    render(<Harness onSelect={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "דרך שרה" } });

    await new Promise((r) => setTimeout(r, 800));
    expect(screen.queryByTestId(HINT_TESTID)).toBeNull();
  });

  it("clears the hint once a later query does return results", async () => {
    autocompleteAddresses.mockResolvedValue([]);
    render(<Harness onSelect={vi.fn()} />);
    const box = screen.getByRole("combobox");
    fireEvent.change(box, { target: { value: "דרך שרה" } });
    await screen.findByTestId(HINT_TESTID, {}, { timeout: 2000 });

    autocompleteAddresses.mockResolvedValue([
      { id: 1, primary: "שרה", secondary: "זכרון יעקב", provider: "nominatim", raw: PLACE },
    ]);
    fireEvent.change(box, { target: { value: "שרה 5" } });

    await screen.findByRole("option", {}, { timeout: 2000 });
    expect(screen.queryByTestId(HINT_TESTID)).toBeNull();
  });
});
