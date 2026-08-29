/**
 * Edit-tab PricingCard isolation tests (MEH-1242 PR 3).
 *
 * Renders the CARD directly (not the full edit page — that hangs the vitest
 * runner) under the REAL NextIntlClientProvider + he.json, mirroring the
 * EditTabCategoriesCard harness. Covers: save payload shape (PUT /producers/me
 * with price_range), seed + not-dirty disabled state, and inline surfacing of
 * a backend Hebrew 422 detail.
 *
 * MEH-2094: the top-product text field moved out of this card and into the
 * product row (ProductsSection). The payload assertion below is now the guard
 * that this card does not send `top_product_name` AT ALL — sending it as null
 * would clear the owner's signature product on every price save, which is the
 * regression this split could most easily introduce.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { PricingCard } from "@/app/[locale]/producer/dashboard/edit/cards";

// MEH-1306: cards.jsx now imports @/i18n/navigation (view-on-page link);
// mock it so createNavigation's next/navigation import never loads in jsdom.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const P = he.dashboard.producer.pricing;

function renderCard(props = {}) {
  const onSave = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <PricingCard profile={{}} onSave={onSave} {...props} />
    </NextIntlClientProvider>,
  );
  return { onSave, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.put.mockResolvedValue({ data: {} });
});

describe("Edit-tab PricingCard (isolation)", () => {
  it("saves price_range via PUT /producers/me", async () => {
    const { onSave } = renderCard();
    fireEvent.change(screen.getByLabelText(P.field_price_range), {
      target: { value: "מ-₪40" },
    });
    fireEvent.click(screen.getByRole("button", { name: P.save_cta }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        price_range: "מ-₪40",
      }),
    );
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ price_range: "מ-₪40" }),
    );
  });

  // MEH-2094 legacy safety, from the card's side. producer_me.py:577 applies
  // model_dump(exclude_unset=True), so a key that is ABSENT is left untouched
  // while a key sent as null is written as NULL. A price save must therefore
  // not mention top_product_name in any form.
  it("never sends top_product_name — a price save must not clear the signature product", async () => {
    renderCard({ profile: { top_product_name: "דבש", price_range: "₪50" } });
    fireEvent.change(screen.getByLabelText(P.field_price_range), {
      target: { value: "₪60" },
    });
    fireEvent.click(screen.getByRole("button", { name: P.save_cta }));

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const [, payload] = api.put.mock.calls[0];
    expect(Object.keys(payload)).toEqual(["price_range"]);
    expect("top_product_name" in payload).toBe(false);
  });

  it("seeds existing values and starts not-dirty (save disabled)", () => {
    renderCard({ profile: { top_product_name: "דבש", price_range: "₪50" } });
    expect(screen.getByLabelText(P.field_price_range).value).toBe("₪50");
    expect(screen.getByRole("button", { name: P.save_cta })).toBeDisabled();
  });

  // The card must not render a top-product text input any more. Asserting the
  // ABSENCE of the control, not just that the payload changed — a leftover
  // field that still wrote the column would pass every assertion above.
  it("renders no top-product text field (it moved to the product row)", () => {
    renderCard({ profile: { top_product_name: "דבש" } });
    const textboxes = screen.getAllByRole("textbox");
    expect(textboxes).toHaveLength(1);
    expect(textboxes[0]).toBe(screen.getByLabelText(P.field_price_range));
  });

  it("surfaces a backend Hebrew 422 detail inline (not generic)", async () => {
    api.put.mockRejectedValueOnce({
      response: { status: 422, data: { detail: [{ msg: "מחיר לא תקין" }] } },
    });
    renderCard();
    fireEvent.change(screen.getByLabelText(P.field_price_range), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByRole("button", { name: P.save_cta }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("מחיר לא תקין");
    expect(alert.textContent).not.toContain("[object Object]");
  });
});
