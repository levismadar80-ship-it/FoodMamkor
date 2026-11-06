/**
 * MEH-2759 (MEH-2757 chunk 2): the Friday strip lists businesses that DELIVER
 * ON FRIDAY — an explicit שישי delivery day — instead of the owner-ticked
 * «זמין היום» state, which the server no longer accepts (MEH-2758).
 *
 * Pins the request the strip sends: the old one (availability_state=
 * available_today) fails both assertions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import FridayDeliveryStrip from "@/components/FridayDeliveryStrip";

const { getSpy } = vi.hoisted(() => ({
  getSpy: vi.fn(() => Promise.resolve({ data: [] })),
}));
vi.mock("@/lib/api", () => ({ default: { get: getSpy } }));
vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
}));
vi.mock("@phosphor-icons/react", () => ({ ShoppingCart: () => null }));

describe("FridayDeliveryStrip source (MEH-2759)", () => {
  beforeEach(() => getSpy.mockClear());

  it("asks for Friday delivery, not available_today", async () => {
    render(<FridayDeliveryStrip />);
    await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(1));
    const [url, { params }] = getSpy.mock.calls[0];
    expect(url).toBe("/producers");
    expect(params.delivery_day).toBe("שישי");
    expect(params).not.toHaveProperty("availability_state");
  });

  it("keeps the city scope when one is given", async () => {
    render(<FridayDeliveryStrip city="חיפה" />);
    await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(1));
    expect(getSpy.mock.calls[0][1].params).toMatchObject({
      delivery_day: "שישי",
      delivery_city: "חיפה",
    });
  });
});
