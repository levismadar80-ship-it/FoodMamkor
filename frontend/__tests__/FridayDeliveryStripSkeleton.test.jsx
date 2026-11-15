/**
 * MEH-3001: while its fetch is in flight the Friday strip holds its space with
 * a skeleton, so the page below does not jump ~220px when the list arrives.
 * Before the fix the component rendered nothing until the fetch settled.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import FridayDeliveryStrip from "@/components/FridayDeliveryStrip";

const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: { get: getSpy } }));
vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
}));
vi.mock("@phosphor-icons/react", () => ({ ShoppingCart: () => null, CaretLeft: () => null, CaretRight: () => null }));

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

describe("FridayDeliveryStrip skeleton", () => {
  beforeEach(() => getSpy.mockReset());

  it("holds the space while loading, then swaps to the strip", async () => {
    const d = deferred();
    getSpy.mockReturnValue(d.promise);
    render(<FridayDeliveryStrip />);
    expect(screen.getByTestId("friday-delivery-strip-skeleton")).toBeTruthy();
    expect(screen.queryByTestId("friday-delivery-strip")).toBeNull();
    await act(async () => d.resolve({ data: [{ id: 1, name: "Farm", slug: "farm" }] }));
    expect(await screen.findByTestId("friday-delivery-strip")).toBeTruthy();
    expect(screen.queryByTestId("friday-delivery-strip-skeleton")).toBeNull();
  });

  it("disappears entirely when no business delivers on Friday", async () => {
    getSpy.mockResolvedValue({ data: [] });
    const { container } = render(<FridayDeliveryStrip />);
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });

  it("holds the banner slot while loading, releases it when empty", async () => {
    const d = deferred();
    getSpy.mockReturnValue(d.promise);
    const onVis = vi.fn();
    render(<FridayDeliveryStrip onVisibilityChange={onVis} />);
    expect(onVis).toHaveBeenLastCalledWith(true);
    await act(async () => d.resolve({ data: [] }));
    await waitFor(() => expect(onVis).toHaveBeenLastCalledWith(false));
  });

  it("keeps the old strip on a city change instead of flashing the skeleton", async () => {
    getSpy.mockResolvedValueOnce({ data: [{ id: 1, name: "Farm", slug: "farm" }] });
    const { rerender } = render(<FridayDeliveryStrip city="חיפה" />);
    await screen.findByTestId("friday-delivery-strip");
    getSpy.mockReturnValueOnce(deferred().promise);
    rerender(<FridayDeliveryStrip city="חדרה" />);
    await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("friday-delivery-strip-skeleton")).toBeNull();
    expect(screen.getByTestId("friday-delivery-strip")).toBeTruthy();
  });
});
