/**
 * MEH-3867 — Enter in a CitySearch field never submits the form around it.
 *
 * Measured 25/11 on a local build: in the admin «פרטי בסיס» form, a city typed
 * with no suggestion list open (an off-list spelling such as «תל-מונד») was
 * saved with the whole business on Enter. Control in the same probe: Enter in
 * an ordinary text field of that form does submit, so the probe could see a
 * submit. fireEvent.keyDown returns false when the handler called
 * preventDefault — the default action that would have submitted the form.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import CitySearch from "@/components/CitySearch";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
});

function renderIn(props) {
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <form>
        <CitySearch label="עיר" labelVisible value="תל-מונד" onChange={() => {}} {...props} />
      </form>
    </NextIntlClientProvider>,
  );
  return screen.getByRole("combobox");
}

describe("CitySearch Enter (MEH-3867)", () => {
  it("with no list open and no onSubmit, Enter is swallowed, not a form submit", () => {
    const input = renderIn({});
    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(false);
  });

  it("with onSubmit, Enter still hands the typed value to it", () => {
    const onSubmit = vi.fn();
    const input = renderIn({ onSubmit });
    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(false);
    expect(onSubmit).toHaveBeenCalledWith("תל-מונד");
  });

  it("other keys are left alone", () => {
    const input = renderIn({});
    expect(fireEvent.keyDown(input, { key: "a" })).toBe(true);
  });
});
