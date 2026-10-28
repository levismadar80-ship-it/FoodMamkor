/**
 * MEH-2491 — the product delete confirm keeps focus inside and gives it back.
 *
 * The dialog declared aria-modal="true" and delivered neither half: Tab walked
 * out into the page behind it, and closing left focus on <body>. Both halves
 * now come from hooks/useDialogFocus.js (shared with the group-buy dialog).
 *
 * REUSES: __tests__/ProductsSectionLoadError.test.jsx (render harness).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProductsSection from "@/components/ProductsSection";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const P = he.settings.products;
const NAME = "ריבת משמש";

async function openDelete() {
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProductsSection />
    </NextIntlClientProvider>,
  );
  const trigger = await screen.findByRole("button", {
    name: P.card.delete_aria_template.replace("{name}", NAME),
  });
  trigger.focus();
  fireEvent.click(trigger);
  return { trigger, dialog: screen.getByRole("dialog") };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({
    data: [{ id: 3, name: NAME, price_min: 25, price_max: null, image_url: null }],
  });
});

describe("product delete confirm — focus (MEH-2491)", () => {
  it("focus starts on «ביטול», the safe choice", async () => {
    await openDelete();
    expect(document.activeElement).toHaveTextContent(P.delete_confirm.cancel);
  });

  it("Tab from the last button wraps to the first, Shift+Tab back", async () => {
    const { dialog } = await openDelete();
    const [first, last] = dialog.querySelectorAll("button");
    last.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  // Each close test first puts focus inside the dialog, as a keyboard user's
  // Tab would: otherwise focus never left the trigger and "returned" is free.
  it("closing returns focus to the row's delete button", async () => {
    const { trigger, dialog } = await openDelete();
    dialog.querySelector("button").focus();
    fireEvent.click(screen.getByRole("button", { name: P.delete_confirm.cancel }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("Escape also returns focus to the row's delete button", async () => {
    const { trigger, dialog } = await openDelete();
    dialog.querySelector("button").focus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
