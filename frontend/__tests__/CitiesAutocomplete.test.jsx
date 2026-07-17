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

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

const CITIES = ["זכרון יעקב", "זכרון משה"];

function Harness({ onChange, initial = [] }) {
  const [v, setV] = useState(initial);
  return (
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <CitiesAutocomplete
        value={v}
        onChange={(next) => { setV(next); onChange(next); }}
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

    expect(screen.getByText("בחרי עיר מהרשימה כדי להוסיף")).toBeInTheDocument();
  });
});
