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
});
