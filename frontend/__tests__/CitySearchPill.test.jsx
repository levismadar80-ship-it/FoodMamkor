/**
 * MEH-2592 C — CitySearch's `pill` prop gives the business page's delivery
 * checker a round field. Every other caller passes nothing and must keep the
 * rounded-md field, so both cells are asserted on the same element.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import CitySearch from "@/components/CitySearch";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn().mockResolvedValue({ data: [] }) } }));

function field(props) {
  render(
    <NextIntlClientProvider locale="he" messages={he}>
      <CitySearch id="c" value="" onChange={() => {}} useBackend={false} {...props} />
    </NextIntlClientProvider>,
  );
  return screen.getByRole("combobox").parentElement;
}

describe("CitySearch pill (MEH-2592 C)", () => {
  it("is round with pill", () => {
    const f = field({ pill: true });
    expect(f.className).toContain("rounded-full");
    expect(f.className).not.toContain("rounded-md");
  });

  it("keeps the rounded-md field by default", () => {
    const f = field({});
    expect(f.className).toContain("rounded-md");
    expect(f.className).not.toContain("rounded-full");
  });
});
