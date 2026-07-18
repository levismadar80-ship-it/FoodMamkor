/**
 * Edit-tab PricingCard isolation tests (MEH-1242 PR 3).
 *
 * Renders the CARD directly (not the full edit page — that hangs the vitest
 * runner) under the REAL NextIntlClientProvider + he.json, mirroring the
 * EditTabCategoriesCard harness. Covers: save payload shape (PUT /producers/me
 * with top_product_name + price_range), seed + not-dirty disabled state, and
 * inline surfacing of a backend Hebrew 422 detail.
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
  it("saves top_product_name + price_range via PUT /producers/me", async () => {
    const { onSave } = renderCard();
    fireEvent.change(screen.getByLabelText(P.field_top_product), {
      target: { value: "גבינת עזים" },
    });
    fireEvent.change(screen.getByLabelText(P.field_price_range), {
      target: { value: "מ-₪40" },
    });
    fireEvent.click(screen.getByRole("button", { name: P.save_cta }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        top_product_name: "גבינת עזים",
        price_range: "מ-₪40",
      }),
    );
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        top_product_name: "גבינת עזים",
        price_range: "מ-₪40",
      }),
    );
  });

  it("seeds existing values and starts not-dirty (save disabled)", () => {
    renderCard({ profile: { top_product_name: "דבש", price_range: "₪50" } });
    expect(screen.getByLabelText(P.field_top_product).value).toBe("דבש");
    expect(screen.getByLabelText(P.field_price_range).value).toBe("₪50");
    expect(screen.getByRole("button", { name: P.save_cta })).toBeDisabled();
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
