/**
 * MEH-3477 — «סידור וקבוצות» shows each product inside its group, as the
 * public page does, and the order is set inside each group. Cells:
 * 0 groups (one flat list) · groups with products (one section each,
 * ungrouped last) · an empty group (no section) × open.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProductOrganizer from "@/components/ProductOrganizer";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const O = he.settings.products.organize;
const GROUPS = [
  { id: "g1", name: "לחמים" },
  { id: "g2", name: "פירות קפואים מהמשק שלנו" },
  { id: "g3", name: "ריקה" },
];
// API order mixes the groups on purpose: the organizer must regroup them.
const PRODUCTS = [
  { id: "a", name: "פוקאצ'ה", position: 0, group_id: "g2" },
  { id: "b", name: "חלה", position: 1, group_id: "g1" },
  { id: "c", name: "מיץ", position: 2, group_id: null },
  { id: "d", name: "תותים", position: 3, group_id: "g2", image_url: "https://res.cloudinary.com/x/image/upload/v1/t.jpg" },
  { id: "e", name: "בגט", position: 4, group_id: "g1" },
];

function mount(products = PRODUCTS) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProductOrganizer products={products} onProductsChange={onChange} />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByTestId("product-organizer-open"));
  return onChange;
}

// The flat list renders first; the sections arrive with the groups.
const grouped = () =>
  waitFor(() => {
    const s = screen.getAllByTestId("product-order-section");
    expect(s).toHaveLength(3);
    return s;
  });

const sectionNames = (s) => within(s).getAllByTestId("product-order-row").map((r) => r.getAttribute("data-name"));

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: GROUPS });
  api.put.mockResolvedValue({ data: [] });
});

describe("ProductOrganizer grouped (MEH-3477)", () => {
  it("one section per group that holds products, in group order, ungrouped last; an empty group has none", async () => {
    mount();
    const sections = await grouped();
    expect(sections.map((s) => s.getAttribute("data-group"))).toEqual(["g1", "g2", ""]);
    expect(within(sections[0]).getByRole("heading")).toHaveTextContent("לחמים");
    expect(within(sections[2]).getByRole("heading")).toHaveTextContent(O.product_group_none);
    expect(sectionNames(sections[0])).toEqual(["חלה", "בגט"]);
    expect(sectionNames(sections[1])).toEqual(["פוקאצ'ה", "תותים"]);
    expect(sectionNames(sections[2])).toEqual(["מיץ"]);
  });

  it("0 groups: one flat list, no section headings", async () => {
    api.get.mockResolvedValue({ data: [] });
    mount();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.getAllByTestId("product-order-section")).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: O.product_group_none })).not.toBeInTheDocument();
    expect(screen.getAllByTestId("product-order-row")).toHaveLength(5);
  });

  it("arrows move inside the group only, and the saved order is the groups laid end to end", async () => {
    mount();
    const sections = await grouped();
    const ups = within(sections[1]).getAllByTestId("product-move-up");
    const downs = within(sections[1]).getAllByTestId("product-move-down");
    expect(ups[0]).toBeDisabled(); // first in its group, though 3rd overall
    expect(downs[1]).toBeDisabled(); // last in its group
    fireEvent.click(downs[0]);
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me/product-order", { product_ids: ["b", "e", "d", "a", "c"] }),
    );
  });

  it("a product with a photo shows a thumbnail through Cloudinary; one without shows the same-size empty box", async () => {
    mount();
    const sections = await grouped();
    const rows = within(sections[1]).getAllByTestId("product-order-row");
    expect(within(rows[0]).getByTestId("product-thumb-empty")).toBeInTheDocument();
    const img = rows[1].querySelector("img");
    expect(img.getAttribute("src")).toContain("/upload/f_auto,q_auto,");
  });

  it("the group select carries the full group name as its title, so a cut name is still readable", async () => {
    mount();
    const sections = await grouped();
    const select = within(sections[1]).getAllByTestId("product-group-select")[0];
    expect(select).toHaveAttribute("title", "פירות קפואים מהמשק שלנו");
  });

  it("the open panel is width-capped, so arrows sit near the name at 1440", async () => {
    mount();
    await screen.findAllByTestId("product-order-section");
    expect(screen.getByTestId("product-organizer").className).toMatch(/max-w-/);
  });
});
