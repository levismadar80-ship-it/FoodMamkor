/**
 * MEH-2312 — the admin import panel: pasted JSON goes to the import route,
 * bad JSON is caught before any request, drafts list with a count, and
 * «אישור כל הטיוטות» approves them all. States: 0 drafts · many drafts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import AdminProductImport from "@/components/admin/AdminProductImport";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));

const T = he.admin.producers.product_import;
const wrap = () =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <AdminProductImport producerId="p-1" />
    </NextIntlClientProvider>,
  );
const DRAFTS = [
  { id: "11111111-1111-4111-8111-111111111111", name: "אגס עדן", price_min: "20", price_unit: "kg" },
  { id: "22222222-2222-4222-8222-222222222222", name: "אננס", price_min: "35", price_unit: "unit" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdminProductImport (MEH-2312)", () => {
  it("0 drafts: shows the empty line and no approve button", async () => {
    api.get.mockResolvedValue({ data: [] });
    wrap();
    expect(await screen.findByText(T.drafts_empty)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /אישור כל הטיוטות/ })).toBeNull();
  });

  it("1 draft: listed with its unit", async () => {
    api.get.mockResolvedValue({ data: [DRAFTS[0]] });
    wrap();
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent(T.unit.kg);
  });

  it("a failed load says so (not «no drafts»)", async () => {
    api.get.mockRejectedValue(new Error("500"));
    wrap();
    expect(await screen.findByText(T.load_failed)).toBeInTheDocument();
    expect(screen.queryByText(T.drafts_empty)).toBeNull();
  });

  it("bad JSON is refused before any request", async () => {
    api.get.mockResolvedValue({ data: [] });
    wrap();
    fireEvent.change(screen.getByLabelText(T.paste_label), { target: { value: "not json" } });
    fireEvent.click(screen.getByRole("button", { name: T.import_cta }));
    expect(await screen.findByText(T.error_json)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("imports pasted rows, then lists the drafts and approves them all", async () => {
    api.get.mockResolvedValueOnce({ data: [] }).mockResolvedValue({ data: DRAFTS });
    api.post.mockResolvedValueOnce({ data: { created: 2, skipped_duplicates: [], invalid: [], unknown_units: [] } });
    wrap();
    const rows = [{ name: "אגס עדן", price: 20, unit: 'לק"ג' }, { name: "אננס", price: 35 }];
    fireEvent.change(screen.getByLabelText(T.paste_label), { target: { value: JSON.stringify(rows) } });
    fireEvent.click(screen.getByRole("button", { name: T.import_cta }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/admin/producers/p-1/product-import", { rows }));
    expect(await screen.findByTestId("import-result")).toBeInTheDocument();
    expect(await screen.findAllByRole("listitem")).toHaveLength(2);

    api.post.mockResolvedValueOnce({ data: { approved: 2 } });
    api.get.mockResolvedValue({ data: [] });
    fireEvent.click(screen.getByRole("button", { name: /אישור כל הטיוטות/ }));
    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith("/admin/producers/p-1/product-drafts/approve", {
        product_ids: DRAFTS.map((d) => d.id),
      }),
    );
    expect(await screen.findByText(T.drafts_empty)).toBeInTheDocument();
  });
});
