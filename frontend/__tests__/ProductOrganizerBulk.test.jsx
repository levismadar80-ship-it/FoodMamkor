/**
 * MEH-3477 — mark several products: move them to a group in one write, or to
 * the top / end of their group. MEH-3478 — «הצעת קבוצות»: a preview the
 * owner edits; nothing saved until «שמירת הקבוצות»; «ביטול» after undoes.
 * Cells: selection 0 (no bar) / 1 / many × groups 0 / many; suggestion
 * closed / loading / shown / failed / empty / saved → undone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import ProductOrganizer from "@/components/ProductOrganizer";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const O = he.settings.products.organize;
const GROUPS = [{ id: "g1", name: "לחמים" }];
const PRODUCTS = [
  { id: "a", name: "חלה", position: 0, group_id: "g1" },
  { id: "b", name: "בגט", position: 1, group_id: "g1" },
  { id: "c", name: "פוקאצ'ה", position: 2, group_id: "g1" },
  { id: "d", name: "עוגת גבינה", position: 3, group_id: null },
  { id: "e", name: "עוגת שמרים", position: 4, group_id: null },
];

function mount(groups = GROUPS, products = PRODUCTS) {
  api.get.mockResolvedValue({ data: groups });
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProductOrganizer products={products} onProductsChange={onChange} />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByTestId("product-organizer-open"));
  return onChange;
}

const ready = (n) =>
  waitFor(() => {
    const s = screen.getAllByTestId("product-order-section");
    expect(s).toHaveLength(n);
    return s;
  });
const mark = (name) => fireEvent.click(screen.getByRole("checkbox", { name: O.select_aria.replace("{name}", name) }));

beforeEach(() => {
  vi.clearAllMocks();
  api.put.mockResolvedValue({ data: [] });
});

describe("selection bar (MEH-3477)", () => {
  it("0 marked: no bar; 1 marked: the singular count; many: the plural count; «ביטול הבחירה» clears", async () => {
    mount();
    await ready(2);
    expect(screen.queryByTestId("product-selection-bar")).toBeNull();
    mark("חלה");
    expect(screen.getByTestId("product-selection-bar")).toHaveTextContent("מוצר אחד נבחר");
    mark("עוגת גבינה");
    expect(screen.getByTestId("product-selection-bar")).toHaveTextContent("2 מוצרים נבחרו");
    fireEvent.click(screen.getByRole("button", { name: O.clear_selection }));
    expect(screen.queryByTestId("product-selection-bar")).toBeNull();
  });

  it("«העברה לקבוצה» moves every marked product in ONE write and says how many went where", async () => {
    const onChange = mount();
    await ready(2);
    mark("עוגת גבינה");
    mark("עוגת שמרים");
    api.put.mockResolvedValueOnce({ data: [{ id: "d", group_id: "g1" }, { id: "e", group_id: "g1" }] });
    fireEvent.change(screen.getByLabelText(O.move_to_group), { target: { value: "g1" } });
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me/product-groups/assign", {
        moves: [{ group_id: "g1", product_ids: ["d", "e"] }],
      }),
    );
    await waitFor(() => expect(showToast.success).toHaveBeenCalledWith("2 מוצרים הועברו ללחמים"));
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls.at(-1)[0].filter((p) => p.group_id === "g1").map((p) => p.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(screen.queryByTestId("product-selection-bar")).toBeNull();
    expect(await ready(1)).toHaveLength(1); // everything is in «לחמים» now
  });

  it("a marked product that leaves the list is not counted or sent", async () => {
    api.get.mockResolvedValue({ data: GROUPS });
    const props = { onProductsChange: vi.fn() };
    const { rerender } = render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <ProductOrganizer products={PRODUCTS} {...props} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("product-organizer-open"));
    await ready(2);
    mark("עוגת גבינה");
    mark("עוגת שמרים");
    rerender(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <ProductOrganizer products={PRODUCTS.filter((p) => p.id !== "e")} {...props} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("product-selection-bar")).toHaveTextContent("מוצר אחד נבחר"));
  });

  it("with 0 groups there is no «העברה לקבוצה», but top / end still work", async () => {
    mount([]);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    mark("עוגת שמרים");
    expect(screen.queryByLabelText(O.move_to_group)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: O.move_top }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me/product-order", { product_ids: ["e", "a", "b", "c", "d"] }),
    );
  });

  it("«לסוף הקבוצה» sends the marked products to the end of THEIR group, keeping their order", async () => {
    mount();
    const sections = await ready(2);
    mark("חלה");
    mark("בגט");
    mark("עוגת גבינה");
    fireEvent.click(screen.getByRole("button", { name: O.move_bottom }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me/product-order", { product_ids: ["c", "a", "b", "e", "d"] }),
    );
    expect(sections).toBeTruthy();
  });
});

describe("«הצעת קבוצות» (MEH-3478)", () => {
  const SUGGESTION = {
    groups: [
      { id: "g1", name: "לחמים", product_ids: [] },
      { id: null, name: "עוגות", product_ids: ["d", "e"] },
    ],
  };

  it("hidden when every product already has a group", async () => {
    mount(GROUPS, PRODUCTS.map((p) => ({ ...p, group_id: "g1" })));
    await ready(1);
    expect(screen.queryByRole("button", { name: O.suggest_cta })).toBeNull();
  });

  it("shows the preview, saves nothing until approved, then groups + moves in two writes; «ביטול» undoes both", async () => {
    const onChange = mount();
    await ready(2);
    expect(screen.getByText(O.suggest_hint)).toBeInTheDocument();
    let answer;
    api.post.mockReturnValueOnce(new Promise((r) => (answer = r)));
    fireEvent.click(screen.getByRole("button", { name: O.suggest_cta }));
    expect(await screen.findByText(O.suggest_loading)).toBeInTheDocument();
    answer({ data: SUGGESTION });
    const preview = await screen.findByTestId("group-suggestion");
    expect(within(preview).getByText(O.suggest_heading)).toBeInTheDocument();
    // An empty suggested group is not shown.
    expect(within(preview).getAllByTestId("group-suggestion-group")).toHaveLength(1);
    expect(api.put).not.toHaveBeenCalled();

    // rename the new group and take one product out
    fireEvent.change(within(preview).getByLabelText(O.group_rename_aria.replace("{name}", "עוגות")), { target: { value: "עוגות בית" } });
    fireEvent.change(within(preview).getByLabelText(O.product_group_label.replace("{name}", "עוגת שמרים")), { target: { value: "" } });

    api.put
      .mockResolvedValueOnce({ data: [...GROUPS, { id: "g2", name: "עוגות בית" }] })
      .mockResolvedValueOnce({ data: [{ id: "d", group_id: "g2" }] });
    fireEvent.click(within(preview).getByRole("button", { name: O.suggest_save }));
    await waitFor(() =>
      expect(api.put).toHaveBeenNthCalledWith(1, "/producers/me/product-groups", {
        groups: [{ id: "g1", name: "לחמים" }, { name: "עוגות בית" }],
      }),
    );
    await waitFor(() =>
      expect(api.put).toHaveBeenNthCalledWith(2, "/producers/me/product-groups/assign", {
        moves: [{ group_id: "g2", product_ids: ["d"] }],
      }),
    );
    expect(await screen.findByText(O.suggest_saved)).toBeInTheDocument();
    expect(onChange.mock.calls.at(-1)[0].find((p) => p.id === "d").group_id).toBe("g2");
    await ready(3);

    api.put.mockResolvedValueOnce({ data: [{ id: "d", group_id: null }] }).mockResolvedValueOnce({ data: GROUPS });
    fireEvent.click(screen.getByRole("button", { name: O.suggest_undo }));
    await waitFor(() =>
      expect(api.put).toHaveBeenNthCalledWith(3, "/producers/me/product-groups/assign", {
        moves: [{ group_id: null, product_ids: ["d"] }],
      }),
    );
    await waitFor(() =>
      expect(api.put).toHaveBeenNthCalledWith(4, "/producers/me/product-groups", { groups: GROUPS }),
    );
    await waitFor(() => expect(screen.queryByText(O.suggest_saved)).toBeNull());
    expect(onChange.mock.calls.at(-1)[0].find((p) => p.id === "d").group_id).toBeNull();
  });

  // Review findings (rule 5a): «ביטול» must not undo the owner's own work, and
  // a product deleted meanwhile must not break it.
  async function applied(onChangeHolder) {
    api.post.mockResolvedValueOnce({ data: SUGGESTION });
    fireEvent.click(screen.getByRole("button", { name: O.suggest_cta }));
    const preview = await screen.findByTestId("group-suggestion");
    api.put
      .mockResolvedValueOnce({ data: [...GROUPS, { id: "g2", name: "עוגות" }] })
      .mockResolvedValueOnce({ data: [] });
    fireEvent.click(within(preview).getByRole("button", { name: O.suggest_save }));
    expect(await screen.findByText(O.suggest_saved)).toBeInTheDocument();
    return onChangeHolder;
  }

  it("a manual group change after the suggestion takes «ביטול» away", async () => {
    mount();
    await ready(2);
    await applied();
    api.put.mockResolvedValueOnce({ data: { id: "a", group_id: null } });
    fireEvent.change(screen.getAllByTestId("product-group-select")[0], { target: { value: "" } });
    await waitFor(() => expect(screen.queryByRole("button", { name: O.suggest_undo })).toBeNull());
  });

  it("«ביטול» deletes only the groups the suggestion created, and skips a product deleted since", async () => {
    mount();
    await ready(2);
    // the server already has a group the page never loaded
    api.get.mockResolvedValueOnce({ data: [...GROUPS, { id: "gx", name: "מארזים" }] });
    await applied();
    expect(api.put).toHaveBeenNthCalledWith(1, "/producers/me/product-groups", {
      groups: [{ id: "g1", name: "לחמים" }, { id: "gx", name: "מארזים" }, { name: "עוגות" }],
    });
    api.put.mockClear();
    api.put.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: GROUPS });
    fireEvent.click(screen.getByRole("button", { name: O.suggest_undo }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
    const groupsWrite = api.put.mock.calls.find(([u]) => u === "/producers/me/product-groups")[1];
    expect(groupsWrite.groups.map((g) => g.id)).not.toContain("g2");
  });

  it("«ביטול» on the preview closes it and saves nothing", async () => {
    mount();
    await ready(2);
    api.post.mockResolvedValueOnce({ data: SUGGESTION });
    fireEvent.click(screen.getByRole("button", { name: O.suggest_cta }));
    const preview = await screen.findByTestId("group-suggestion");
    fireEvent.click(within(preview).getByRole("button", { name: O.suggest_cancel }));
    expect(screen.queryByTestId("group-suggestion")).toBeNull();
    expect(api.put).not.toHaveBeenCalled();
  });

  it("a 503 or an empty suggestion: the approved fallback line, no preview", async () => {
    mount();
    await ready(2);
    api.post.mockRejectedValueOnce({ response: { status: 503, data: { detail: "x" } } });
    fireEvent.click(screen.getByRole("button", { name: O.suggest_cta }));
    expect(await screen.findByText(O.suggest_failed)).toBeInTheDocument();
    api.post.mockResolvedValueOnce({ data: { groups: [] } });
    fireEvent.click(screen.getByRole("button", { name: O.suggest_cta }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(screen.getByText(O.suggest_failed)).toBeInTheDocument();
    expect(screen.queryByTestId("group-suggestion")).toBeNull();
  });

  it("calls the admin routes under basePath", async () => {
    api.get.mockResolvedValue({ data: GROUPS });
    render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <ProductOrganizer products={PRODUCTS} onProductsChange={vi.fn()} basePath="/admin/producers/b1" />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("product-organizer-open"));
    await ready(2);
    api.post.mockResolvedValueOnce({ data: { groups: [] } });
    fireEvent.click(screen.getByRole("button", { name: O.suggest_cta }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/admin/producers/b1/product-groups/suggest"));
  });
});
