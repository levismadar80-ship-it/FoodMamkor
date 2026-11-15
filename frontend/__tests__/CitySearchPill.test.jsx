/**
 * MEH-2592 C — CitySearch's `pill` prop gives the business page's delivery
 * checker a round field. Every other caller passes nothing and must keep the
 * rounded-sm field, so both cells are asserted on the same element.
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
    expect(f.className).not.toContain("rounded-sm");
  });

  it("keeps the rounded-sm field by default (MEH-3092)", () => {
    const f = field({});
    expect(f.className).toContain("rounded-sm");
    expect(f.className).not.toContain("rounded-full");
  });
});
