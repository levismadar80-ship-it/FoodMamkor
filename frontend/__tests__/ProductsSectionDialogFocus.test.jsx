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
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

// Review finding on #3780: the confirmed delete is the dialog's most common
// exit, and it removes the row — trigger included — so "return to the
// trigger" had nowhere to go and focus dropped to <body>.
describe("product delete confirmed — focus lands on the section (MEH-2491)", () => {
  it("after a successful delete focus is on the products section, not <body>", async () => {
    api.delete.mockResolvedValue({});
    const { dialog } = await openDelete();
    const [confirm] = dialog.querySelectorAll("button");
    confirm.focus();
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText(NAME)).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement.contains(screen.getByText(P.section_heading))).toBe(true);
  });
});

describe("duplicate-name confirm — focus (MEH-2491)", () => {
  async function openDuplicate() {
    render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <ProductsSection />
      </NextIntlClientProvider>,
    );
    await screen.findByText(NAME);
    fireEvent.click(screen.getByRole("button", { name: P.add_cta }));
    fireEvent.change(document.getElementById("new-product-name"), { target: { value: NAME } });
    fireEvent.change(document.getElementById("new-product-price-min"), { target: { value: "30" } });
    const submit = document.querySelector('form button[type="submit"]');
    submit.focus();
    fireEvent.click(submit);
    return { submit, dialog: await screen.findByRole("dialog") };
  }

  it("focus starts on «בטלו», the choice that sends nothing", async () => {
    await openDuplicate();
    expect(document.activeElement).toBe(screen.getByTestId("duplicate-cancel"));
  });

  // CI review on #3780: confirming starts the save, which disables the submit
  // that opened the dialog — focus() on a disabled button is a no-op.
  it("confirming (save in flight, submit disabled) puts focus on the section", async () => {
    api.post.mockReturnValue(new Promise(() => {}));
    const { submit } = await openDuplicate();
    fireEvent.click(screen.getByTestId("duplicate-confirm"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(submit).toBeDisabled();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement.contains(screen.getByText(P.section_heading))).toBe(true);
  });

  it("Escape returns focus to the add form's submit", async () => {
    const { submit } = await openDuplicate();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(submit);
  });
});
