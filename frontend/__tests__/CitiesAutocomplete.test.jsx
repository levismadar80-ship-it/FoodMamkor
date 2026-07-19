/**
 * MEH-1254 — CitiesAutocomplete commit-on-type fix.
 *
 * A fully typed city must become a chip even without picking from the
 * dropdown: exact match commits on Enter (activeIdx === -1, multiple
 * suggestions) and on blur (click on Save); non-matching text clears on
 * blur; browser autofill (programmatic value + blur) commits too because
 * the change event still drives the suggestion fetch. api is mocked —
 * GET /cities returns a fixed list.
 */
import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import CitiesAutocomplete from "@/components/CitiesAutocomplete";
import api from "@/lib/api";
import { REGIONS } from "@/data/regions";
import { ISRAEL_CITIES } from "@/data/cities";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

const CITIES = ["זכרון יעקב", "זכרון משה"];

function Harness({ onChange, initial = [], showRegionChips = false }) {
  const [v, setV] = useState(initial);
  return (
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <CitiesAutocomplete
        value={v}
        onChange={(next) => { setV(next); onChange(next); }}
        showRegionChips={showRegionChips}
      />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: CITIES });
});

async function typeAndWaitForSuggestions(value) {
  const input = screen.getByRole("combobox");
  fireEvent.change(input, { target: { value } });
  await screen.findAllByRole("option", {}, { timeout: 2000 });
  return input;
}

describe("CitiesAutocomplete (MEH-1254)", () => {
  it("Enter commits an exact match even with multiple suggestions and no active index", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = await typeAndWaitForSuggestions("זכרון יעקב");

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(["זכרון יעקב"]);
    expect(input.value).toBe("");
  });

  it("blur commits an exact match (typing then clicking Save keeps the city)", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = await typeAndWaitForSuggestions("זכרון יעקב");

    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(["זכרון יעקב"]);
    expect(input.value).toBe("");
  });

  it("blur clears non-matching text without committing", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = await typeAndWaitForSuggestions("זכרון");

    fireEvent.blur(input);

    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  it("autofill scenario: programmatic value + blur commits, and autofill is disabled on the input", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("autocomplete", "off");

    // Browser autofill surfaces as a change event with the full value.
    fireEvent.change(input, { target: { value: "זכרון יעקב" } });
    await screen.findAllByRole("option", {}, { timeout: 2000 });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(["זכרון יעקב"]);
    expect(input.value).toBe("");
  });

  it("keyboard nav regression: ArrowDown + Enter commits the highlighted suggestion", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = await typeAndWaitForSuggestions("זכרון");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(["זכרון משה"]);
  });

  it("blur before the debounced fetch fires cancels it — no ghost dropdown reopens", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole("combobox");

    // Blur inside the 200ms debounce window (fast click on Save).
    fireEvent.change(input, { target: { value: "זכרון" } });
    fireEvent.blur(input);
    await new Promise((r) => setTimeout(r, 500));

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  it("shows the muted commit hint while typed text is uncommitted", async () => {
    render(<Harness onChange={vi.fn()} />);
    await typeAndWaitForSuggestions("זכרון");

    expect(
      screen.getByText(he.search.cities_autocomplete.commit_hint),
    ).toBeInTheDocument();
  });

  it("hides the commit hint while a suggestion is arrow-highlighted (PR #1811 review)", async () => {
    render(<Harness onChange={vi.fn()} />);
    const input = await typeAndWaitForSuggestions("זכרון");

    fireEvent.keyDown(input, { key: "ArrowDown" });

    expect(
      screen.queryByText(he.search.cities_autocomplete.commit_hint),
    ).not.toBeInTheDocument();
  });
});

describe("CitiesAutocomplete region quick-add (MEH-1256)", () => {
  const SHARON = REGIONS.find((r) => r.key === "sharon");

  it("data guard: every region city is an exact member of ISRAEL_CITIES", () => {
    for (const region of REGIONS) {
      const strays = region.cities.filter((c) => !ISRAEL_CITIES.includes(c));
      expect(strays, `${region.name}: ${strays.join(", ")}`).toEqual([]);
    }
  });

  it("does not render region chips by default", () => {
    render(<Harness onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: SHARON.name })).not.toBeInTheDocument();
  });

  it("clicking a region chip adds all of its cities", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} showRegionChips />);

    fireEvent.click(screen.getByRole("button", { name: SHARON.name }));

    expect(onChange).toHaveBeenCalledWith(SHARON.cities);
  });

  it("dedupes: already-selected cities are not added twice", () => {
    const onChange = vi.fn();
    const preselected = [SHARON.cities[0], SHARON.cities[1]];
    render(<Harness onChange={onChange} showRegionChips initial={preselected} />);

    fireEvent.click(screen.getByRole("button", { name: SHARON.name }));

    const result = onChange.mock.calls[0][0];
    expect(result).toEqual([...preselected, ...SHARON.cities.slice(2)]);
    expect(new Set(result).size).toBe(result.length);
  });

  // MEH-1346: the added-state chip is a toggle, no longer disabled.
  it("a fully selected region renders enabled with aria-pressed", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} showRegionChips initial={[...SHARON.cities]} />);

    const addedLabel = `${SHARON.name} · ✓ ${he.search.cities_autocomplete.region_added}`;
    const chip = screen.getByRole("button", { name: addedLabel });
    expect(chip).not.toBeDisabled();
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking an added region removes exactly its city list", () => {
    const onChange = vi.fn();
    const other = "אילת"; // not in SHARON
    render(
      <Harness onChange={onChange} showRegionChips initial={[other, ...SHARON.cities]} />,
    );

    const addedLabel = `${SHARON.name} · ✓ ${he.search.cities_autocomplete.region_added}`;
    fireEvent.click(screen.getByRole("button", { name: addedLabel }));

    expect(onChange).toHaveBeenCalledWith([other]);
  });

  it("removal includes region cities the user had added individually", () => {
    // Simplest-correct semantics (per ticket): membership in the region's
    // list is what counts, not how the city got selected.
    const onChange = vi.fn();
    render(<Harness onChange={onChange} showRegionChips initial={[...SHARON.cities]} />);

    const addedLabel = `${SHARON.name} · ✓ ${he.search.cities_autocomplete.region_added}`;
    fireEvent.click(screen.getByRole("button", { name: addedLabel }));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("a partially selected region still adds (not removes)", () => {
    const onChange = vi.fn();
    const partial = SHARON.cities.slice(0, 2);
    render(<Harness onChange={onChange} showRegionChips initial={partial} />);

    fireEvent.click(screen.getByRole("button", { name: SHARON.name }));

    const result = onChange.mock.calls[0][0];
    expect(result).toEqual([...partial, ...SHARON.cities.slice(2)]);
  });
});
