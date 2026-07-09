/**
 * MEH-999 follow-up — ProductsSection mounted in the edit tab.
 *
 * Renders the COMPONENT directly (not ProducerDashboardEditPage — the full-page
 * mount hangs the vitest runner; see EditTabCategoriesCard.test.jsx) under the
 * REAL NextIntlClientProvider + he.json, so `settings.products.*` resolves and
 * the mount-fetch effect settles.
 *
 * Locked behavior under test:
 *   - the section renders its heading (the card is reachable in the edit tab)
 *   - empty products → the section's own empty-state copy shows
 *   - a product from GET /producers/me/products renders in the list with its
 *     edit + delete controls (CRUD affordances present)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProductsSection from "@/components/ProductsSection";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const P = he.settings.products;

function renderSection() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProductsSection />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Edit-tab ProductsSection (MEH-999 mount)", () => {
  it("renders the section heading + empty-state copy when there are no products", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderSection();

    // Heading proves the card is reachable/rendered in the edit tab.
    expect(await screen.findByText(P.section_heading)).toBeInTheDocument();
    // Section's own empty-state copy (AC: "עוד לא הוספת מוצרים"-equivalent).
    expect(screen.getByText(P.empty.title)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/producers/me/products");
  });

  it("renders a fetched product with its edit + delete controls", async () => {
    api.get.mockResolvedValue({
      data: [
        {
          id: 7,
          name: "לחם מחמצת",
          price_min: 18,
          price_max: 24,
          image_url: null,
        },
      ],
    });
    renderSection();

    expect(await screen.findByText("לחם מחמצת")).toBeInTheDocument();
    // Per-row CRUD affordances present (aria templates from settings.products.card).
    expect(
      screen.getByRole("button", { name: P.card.edit_aria_template.replace("{name}", "לחם מחמצת") }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: P.card.delete_aria_template.replace("{name}", "לחם מחמצת") }),
    ).toBeInTheDocument();
    // Empty-state copy must NOT show when a product exists.
    expect(screen.queryByText(P.empty.title)).not.toBeInTheDocument();
  });
});
