/**
 * MEH-2326 — the admin builds a draft's catalogue before the owner claims it.
 *
 * Contract:
 *   - 0 / 1 / many products render (empty copy, rows with price).
 *   - Add posts name/description/price only — never a diet flag (Sapir, 26/10:
 *     the owner declares those) — and appends the row.
 *   - Delete is two-step and removes the row only on success.
 *   - The server's 409 (draft already claimed) is shown verbatim.
 *   - The edit page shows the panel for a draft only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import DraftProductsPanel from "@/components/admin/DraftProductsPanel";
import EditProducerPage from "@/app/[locale]/admin/producers/[id]/edit/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: "p-9" }),
}));

// One stable object: the edit page's fetch effect depends on `user`.
const adminAuth = { user: { role: "admin" }, loading: false };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => adminAuth }));

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const T = he.admin.producers.draft_products;
const P = he.settings.products;

const wrap = (ui) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );

const bread = { id: "x1", name: "לחם מחמצת", price_min: "32.00", price_max: null };
const cookies = { id: "x2", name: "עוגיות", price_min: "20.00", price_max: "30.00" };

function fill({ name = "", price_min = "", price_max = "", description = "" }) {
  fireEvent.change(screen.getByLabelText(new RegExp(P.form.name_label)), {
    target: { value: name },
  });
  fireEvent.change(screen.getByLabelText(new RegExp(P.form.description_label)), {
    target: { value: description },
  });
  fireEvent.change(screen.getByLabelText(new RegExp(P.form.price_min_label)), {
    target: { value: price_min },
  });
  fireEvent.change(screen.getByLabelText(new RegExp(P.form.price_max_label)), {
    target: { value: price_max },
  });
}

beforeEach(() => vi.clearAllMocks());

describe("DraftProductsPanel — counts", () => {
  it("0 products: the empty line, no list", () => {
    wrap(<DraftProductsPanel producerId="d-1" />);
    expect(screen.getByTestId("draft-products-empty")).toHaveTextContent(T.empty);
    expect(screen.queryByTestId("draft-products-list")).not.toBeInTheDocument();
  });

  it("1 product: one row with its price, no empty line", () => {
    wrap(<DraftProductsPanel producerId="d-1" initialProducts={[bread]} />);
    const rows = screen.getAllByTestId("draft-product-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("לחם מחמצת");
    expect(rows[0]).toHaveTextContent("32");
    expect(screen.queryByTestId("draft-products-empty")).not.toBeInTheDocument();
  });

  it("many products: one row each", () => {
    wrap(<DraftProductsPanel producerId="d-1" initialProducts={[bread, cookies]} />);
    expect(screen.getAllByTestId("draft-product-row")).toHaveLength(2);
  });
});

describe("DraftProductsPanel — add", () => {
  it("posts name/description/price only and appends the row", async () => {
    api.post.mockResolvedValue({ data: { ...cookies } });
    wrap(<DraftProductsPanel producerId="d-1" initialProducts={[bread]} />);

    fill({ name: " עוגיות ", description: "קופסה", price_min: "20", price_max: "30" });
    fireEvent.click(screen.getByTestId("draft-product-add"));

    await waitFor(() => expect(screen.getAllByTestId("draft-product-row")).toHaveLength(2));
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe("/admin/producers/d-1/products");
    expect(body).toEqual({ name: "עוגיות", description: "קופסה", price_min: 20, price_max: 30 });
  });

  it("an invalid form posts nothing and says why", () => {
    wrap(<DraftProductsPanel producerId="d-1" />);
    fill({ name: "", price_min: "" });
    fireEvent.click(screen.getByTestId("draft-product-add"));
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByText(P.errors.name_required)).toBeInTheDocument();
    expect(screen.getByText(P.errors.price_required)).toBeInTheDocument();
  });

  it("shows the server's 409 verbatim and adds no row", async () => {
    const detail = "אפשר לערוך מוצרים מהאדמין רק בטיוטה שעוד לא שויכה לבעלת העסק";
    api.post.mockRejectedValue({ response: { status: 409, data: { detail } } });
    wrap(<DraftProductsPanel producerId="d-1" />);
    fill({ name: "לחם", price_min: "30" });
    fireEvent.click(screen.getByTestId("draft-product-add"));
    expect(await screen.findByTestId("draft-products-error")).toHaveTextContent(detail);
    expect(screen.queryByTestId("draft-product-row")).not.toBeInTheDocument();
  });

  it("a response without an id is an error, never a row", async () => {
    api.post.mockResolvedValue({ data: { name: "לחם" } });
    wrap(<DraftProductsPanel producerId="d-1" />);
    fill({ name: "לחם", price_min: "30" });
    fireEvent.click(screen.getByTestId("draft-product-add"));
    expect(await screen.findByTestId("draft-products-error")).toHaveTextContent(
      P.errors.save_failed,
    );
    expect(screen.queryByTestId("draft-product-row")).not.toBeInTheDocument();
  });
});

describe("DraftProductsPanel — delete", () => {
  it("is two-step and removes the row on success", async () => {
    api.delete.mockResolvedValue({ status: 204 });
    wrap(<DraftProductsPanel producerId="d-1" initialProducts={[bread, cookies]} />);

    const row = screen.getAllByTestId("draft-product-row")[0];
    fireEvent.click(within(row).getByTestId("draft-product-delete"));
    expect(api.delete).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByTestId("draft-product-confirm-delete"));

    await waitFor(() => expect(screen.getAllByTestId("draft-product-row")).toHaveLength(1));
    expect(api.delete).toHaveBeenCalledWith("/admin/producers/d-1/products/x1");
    expect(screen.getByTestId("draft-product-row")).toHaveTextContent("עוגיות");
  });

  it("a failed delete keeps the row and shows the server's detail", async () => {
    const detail = "בית העסק כבר שויך";
    api.delete.mockRejectedValue({ response: { status: 409, data: { detail } } });
    wrap(<DraftProductsPanel producerId="d-1" initialProducts={[bread]} />);
    fireEvent.click(screen.getByTestId("draft-product-delete"));
    fireEvent.click(screen.getByTestId("draft-product-confirm-delete"));
    expect(await screen.findByTestId("draft-products-error")).toHaveTextContent(detail);
    expect(screen.getAllByTestId("draft-product-row")).toHaveLength(1);
  });
});

describe("edit page — the panel is for drafts only", () => {
  it.each([
    ["draft", true],
    ["approved", false],
  ])("status %s → panel shown: %s", async (status, shown) => {
    api.get.mockImplementation((url) =>
      Promise.resolve({
        data:
          url === "/admin/producers/p-9"
            ? { id: "p-9", name: "עסק", status, products: [bread] }
            : [],
      }),
    );
    wrap(<EditProducerPage />);
    await screen.findByText(he.admin.producers.form.sections.basic);
    if (shown) {
      expect(screen.getByTestId("draft-products-panel")).toBeInTheDocument();
      expect(screen.getByTestId("draft-product-row")).toHaveTextContent("לחם מחמצת");
    } else {
      expect(screen.queryByTestId("draft-products-panel")).not.toBeInTheDocument();
    }
  });
});
