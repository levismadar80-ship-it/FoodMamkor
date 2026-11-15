/**
 * MEH-3001: the Friday strip follows the page direction. It used to pin
 * dir="rtl" on its own <section>, so /en (dir="ltr" at <html>) rendered the
 * strip right-to-left while the rest of the page read left-to-right.
 *
 * The strip is rendered inside an LTR wrapper; its section must resolve that
 * wrapper as its nearest [dir] — the old dir="rtl" makes it resolve itself.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import FridayDeliveryStrip from "@/components/FridayDeliveryStrip";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [{ id: 1, name: "Farm", slug: "farm", city: "Haifa" }] })) },
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
}));
vi.mock("@phosphor-icons/react", () => ({ ShoppingCart: () => null, CaretLeft: () => null, CaretRight: () => null }));

describe("FridayDeliveryStrip direction", () => {
  it("inherits dir from the page instead of forcing rtl", async () => {
    render(
      <div dir="ltr" data-testid="page">
        <FridayDeliveryStrip />
      </div>,
    );
    const strip = await screen.findByTestId("friday-delivery-strip");
    expect(screen.getByText("Farm")).toBeTruthy();
    expect(strip.closest("[dir]")).toBe(screen.getByTestId("page"));
  });
});
