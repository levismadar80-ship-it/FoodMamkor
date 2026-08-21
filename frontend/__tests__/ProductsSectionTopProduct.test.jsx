/**
 * Module:   ProductsSectionTopProduct.test
 * Purpose:  MEH-2094 — the signature-product choice moved from a free-text
 *           field (edit/cards.jsx PricingCard) into the product row. Covers
 *           mark, re-mark (radio), unmark, failed-PUT revert, the zero-products
 *           empty state, and the legacy unmatched-name non-regression.
 * Touches:  mocked PUT /producers/me + GET /producers/me/products only.
 * Does NOT: cover the public page's matcher — that file is untouched by this
 *           ticket (app/[locale]/producer/[id]/components/ProducerSections.jsx).
 * Related:  components/ProductsSection.jsx (the toggle),
 *           __tests__/EditTabPricingCard.test.jsx (the other half of the split).
 * History:  MEH-2094 (creation).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProductsSection from "@/components/ProductsSection";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const C = he.settings.products.card;
const S = he.settings.products;

const PRODUCTS = [
  { id: 1, name: "לחם מחמצת", price_min: 30, price_max: null, image_url: null },
  { id: 2, name: "חלה", price_min: 25, price_max: null, image_url: null },
];

/**
 * Renders with BOTH `topProductName` and `topProductId` controlled, so the
 * prop→patch→prop round trip the real mount site performs (edit/page.js
 * setProfile) is actually exercised — a test that passed a static prop could
 * not see a revert.
 *
 * MEH-2137 chunk 3: `initialTopId` defaults to `null`, which is the LEGACY
 * shape — a producer whose chunk-1 backfill refused to guess. Every test that
 * does not pass it is therefore still exercising the name-fallback path, and
 * that is deliberate: those producers exist in the data and must keep working.
 */
function renderSection({
  initialTop = null,
  initialTopId = null,
  products = PRODUCTS,
} = {}) {
  api.get.mockResolvedValue({ data: products });
  const onTopProductChange = vi.fn();
  let current = initialTop;
  let currentId = initialTopId;

  const view = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProductsSection
        topProductName={current}
        topProductId={currentId}
        onTopProductChange={onTopProductChange}
      />
    </NextIntlClientProvider>,
  );

  // Re-render with whatever the component last patched upward.
  const rerenderWithPatches = () => {
    const calls = onTopProductChange.mock.calls;
    if (calls.length) {
      const patch = calls[calls.length - 1][0];
      current = patch.top_product_name;
      currentId = patch.top_product_id;
    }
    view.rerender(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <ProductsSection
          topProductName={current}
          topProductId={currentId}
          onTopProductChange={onTopProductChange}
        />
      </NextIntlClientProvider>,
    );
  };

  return { onTopProductChange, rerenderWithPatches, ...view };
}

const markBtn = (name) => screen.getByLabelText(C.top_product_mark_aria_template.replace("{name}", name));
const unmarkBtn = (name) => screen.getByLabelText(C.top_product_unmark_aria_template.replace("{name}", name));

beforeEach(() => {
  vi.clearAllMocks();
  api.put.mockResolvedValue({ data: {} });
});

describe("ProductsSection — top-product toggle (MEH-2094)", () => {
  it("marks a product: PUTs its exact name to /producers/me", async () => {
    const { onTopProductChange } = renderSection();
    await screen.findByText("לחם מחמצת");

    fireEvent.click(markBtn("לחם מחמצת"));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        top_product_id: 1,
      }),
    );
    expect(onTopProductChange).toHaveBeenCalledWith({
      top_product_id: 1,
      top_product_name: "לחם מחמצת",
    });
  });

  it("radio semantics: marking B replaces A rather than adding a second", async () => {
    const { onTopProductChange, rerenderWithPatches } = renderSection({
      initialTop: "לחם מחמצת",
    });
    await screen.findByText("חלה");
    // Precondition: exactly one row is marked, and it is A.
    expect(screen.getAllByTestId("product-row-top")).toHaveLength(1);

    fireEvent.click(markBtn("חלה"));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", { top_product_id: 2 }),
    );
    expect(onTopProductChange).toHaveBeenCalledWith({
      top_product_id: 2,
      top_product_name: "חלה",
    });

    rerenderWithPatches();
    // Still exactly one marked row, and it is now B — A was replaced, not joined.
    const marked = screen.getAllByTestId("product-row-top");
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toContain("חלה");
  });

  it("re-marking the marked product clears it (sends null)", async () => {
    const { onTopProductChange, rerenderWithPatches } = renderSection({
      initialTop: "לחם מחמצת",
    });
    await screen.findByText("לחם מחמצת");

    fireEvent.click(unmarkBtn("לחם מחמצת"));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", { top_product_id: null }),
    );
    expect(onTopProductChange).toHaveBeenCalledWith({
      top_product_id: null,
      top_product_name: null,
    });

    rerenderWithPatches();
    expect(screen.queryAllByTestId("product-row-top")).toHaveLength(0);
  });

  it("a failed PUT reverts the toggle AND surfaces an error — never silent", async () => {
    api.put.mockRejectedValueOnce({ response: { status: 500, data: {} } });
    const { onTopProductChange, rerenderWithPatches } = renderSection();
    await screen.findByText("לחם מחמצת");

    fireEvent.click(markBtn("לחם מחמצת"));

    // Optimistic patch first, then the revert to the previous value (null).
    await waitFor(() => expect(onTopProductChange).toHaveBeenCalledTimes(2));
    expect(onTopProductChange.mock.calls[0][0]).toEqual({
      top_product_id: 1,
      top_product_name: "לחם מחמצת",
    });
    // BOTH fields revert. Reverting one would leave the row and the
    // completeness checklist disagreeing about which product is featured.
    expect(onTopProductChange.mock.calls[1][0]).toEqual({
      top_product_id: null,
      top_product_name: null,
    });

    expect(await screen.findByText(S.errors.top_product_failed)).toBeInTheDocument();

    rerenderWithPatches();
    expect(screen.queryAllByTestId("product-row-top")).toHaveLength(0);
  });

  it("zero products: the affordance explains what to do instead of rendering a dead control", async () => {
    renderSection({ products: [] });

    const hint = await screen.findByTestId("top-product-hint");
    expect(hint.textContent).toBe(S.top_product_empty_hint);
    // No toggle exists to click, and no request was made on render.
    expect(screen.queryAllByTestId("product-row")).toHaveLength(0);
    expect(api.put).not.toHaveBeenCalled();
  });

  // THE single most important non-regression in MEH-2094.
  it("legacy: a stored name matching no product marks nothing and repairs nothing", async () => {
    renderSection({ initialTop: "מוצר שנמחק מזמן" });
    await screen.findByText("לחם מחמצת");

    // Not marked, not cleared, not migrated — and crucially no write of any kind.
    expect(screen.queryAllByTestId("product-row-top")).toHaveLength(0);
    expect(screen.getAllByTestId("product-row")).toHaveLength(2);
    expect(api.put).not.toHaveBeenCalled();

    // Every row still offers "mark" (none is in the unmark state).
    expect(markBtn("לחם מחמצת")).toBeInTheDocument();
    expect(markBtn("חלה")).toBeInTheDocument();
  });

  // The hint and the star share one render condition: copy that describes a
  // control must not outlive the control. Asserted in BOTH directions, so
  // hiding either one without the other re-reds this.
  it("copy and control appear together, and vanish together", async () => {
    const { unmount } = renderSection();
    await screen.findByText("לחם מחמצת");
    expect(screen.getByTestId("top-product-hint")).toBeInTheDocument();
    expect(markBtn("לחם מחמצת")).toBeInTheDocument();
    unmount();

    api.get.mockResolvedValue({ data: PRODUCTS });
    render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <ProductsSection />
      </NextIntlClientProvider>,
    );
    await screen.findByText("לחם מחמצת");
    expect(screen.queryByTestId("top-product-hint")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(C.top_product_mark_aria_template.replace("{name}", "לחם מחמצת")),
    ).not.toBeInTheDocument();
  });

  // Single-flight. One column means two overlapping writes race: the second
  // click would capture the OPTIMISTIC value as its `previous`, so a failure of
  // the FIRST would revert on top of the second's committed write — the UI
  // ending on null while the server holds a product. Asserted as "the second
  // write never starts", which is the property, rather than as "the button has
  // an attribute", which is the mechanism.
  it("a toggle in flight blocks a second toggle — no revert can clobber a newer write", async () => {
    let releaseFirst;
    api.put.mockImplementationOnce(
      () => new Promise((_, reject) => { releaseFirst = () => reject({ response: { status: 500, data: {} } }); }),
    );
    const { onTopProductChange } = renderSection();
    await screen.findByText("לחם מחמצת");

    fireEvent.click(markBtn("לחם מחמצת"));   // A — in flight, will fail
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));

    fireEvent.click(markBtn("חלה"));          // B — must not start
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(onTopProductChange).toHaveBeenCalledTimes(1);

    releaseFirst();
    // A's revert lands on the value A itself replaced, never on top of a B.
    await waitFor(() => expect(onTopProductChange).toHaveBeenCalledTimes(2));
    expect(onTopProductChange.mock.calls[1][0]).toEqual({
      top_product_id: null,
      top_product_name: null,
    });
    expect(api.put).toHaveBeenCalledTimes(1);
  });

  it("matches on trimmed name, mirroring the public page's exact-string join", async () => {
    renderSection({ initialTop: "  לחם מחמצת  " });
    await screen.findByText("לחם מחמצת");

    const marked = screen.getAllByTestId("product-row-top");
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toContain("לחם מחמצת");
  });
});

// Two products, ONE name. This is the reported defect, and under the string
// vote none of these assertions could even be written — both rows matched
// `top_product_name === "לחם"`, so "exactly one" was not expressible.
const SAME_NAME = [
  { id: 11, name: "לחם", price_min: 44, price_max: null, image_url: null },
  { id: 12, name: "לחם", price_min: 57, price_max: null, image_url: null },
];

describe("ProductsSection — the vote is an identity (MEH-2137 chunk 3)", () => {
  it("CONTROL: under the LEGACY name vote both same-named rows light up", async () => {
    // Runs first and asserts the BUG, not the fix. If this ever goes green-by-
    // passing-one, the fallback path stopped being exercised and every
    // "exactly one" below is measuring a world that no longer has the problem.
    renderSection({ initialTop: "לחם", initialTopId: null, products: SAME_NAME });
    await screen.findAllByText("לחם");

    expect(screen.getAllByTestId("product-row-top")).toHaveLength(2);
  });

  it("the ticket: with an id, exactly the chosen row is marked", async () => {
    renderSection({ initialTop: "לחם", initialTopId: 12, products: SAME_NAME });
    await screen.findAllByText("לחם");

    const marked = screen.getAllByTestId("product-row-top");
    expect(marked).toHaveLength(1);
    // ₪57 is the one that was chosen; ₪44 must not be marked.
    expect(marked[0].textContent).toContain("57");
    expect(marked[0].textContent).not.toContain("44");
  });

  it("the id wins even when the legacy name points at the OTHER row", async () => {
    // The strongest form: name and id disagree. Only an id-first matcher can
    // pass this — a name-first one, or an OR of the two, marks both.
    renderSection({ initialTop: "לחם", initialTopId: 11, products: SAME_NAME });
    await screen.findAllByText("לחם");

    const marked = screen.getAllByTestId("product-row-top");
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toContain("44");
  });

  it("marking a row PUTs its id — not its name", async () => {
    const { rerenderWithPatches, onTopProductChange } = renderSection({
      products: SAME_NAME,
    });
    await screen.findAllByText("לחם");

    // Both rows are unmarked, so both offer the mark control; take the second.
    const markButtons = screen.getAllByLabelText(
      C.top_product_mark_aria_template.replace("{name}", "לחם"),
    );
    expect(markButtons).toHaveLength(2);
    fireEvent.click(markButtons[1]);

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", { top_product_id: 12 }),
    );
    // The legacy name rides along in the optimistic patch because the SERVER
    // syncs it; the client is not a second writer of that column.
    expect(onTopProductChange).toHaveBeenCalledWith({
      top_product_id: 12,
      top_product_name: "לחם",
    });

    rerenderWithPatches();
    expect(screen.getAllByTestId("product-row-top")).toHaveLength(1);
  });

  it("a NULL id falls back to the name — those producers are not blanked", async () => {
    // The backfill left the FK NULL wherever it refused to guess. Deleting the
    // fallback would remove a badge those producers can currently see, which
    // is a regression dressed as a cleanup.
    renderSection({ initialTop: "חלה", initialTopId: null });
    await screen.findByText("חלה");

    const marked = screen.getAllByTestId("product-row-top");
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toContain("חלה");
  });
});

// `C` above is the `.card` subtree; these live one level up, next to the
// existing `delete_confirm`.
const PRODUCTS_NS = he.settings.products;

describe("ProductsSection — soft duplicate-name confirm (MEH-2137)", () => {
  // SOFT is the whole requirement: two products may legitimately share a name,
  // which is exactly why the vote moved to an id in this ticket. A hard block
  // would contradict the change it ships with.
  const fillForm = (name) => {
    fireEvent.click(screen.getByText(PRODUCTS_NS.add_cta));
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: name } });
    const spin = screen.getAllByRole("spinbutton");
    fireEvent.change(spin[0], { target: { value: "30" } });
  };

  it("CONTROL: a NON-duplicate name never asks — the prompt is not unconditional", async () => {
    // Without this, "confirm was called" below proves nothing about duplicate
    // DETECTION: a confirm fired on every create would satisfy that too.
    const spy = vi.spyOn(window, "confirm").mockReturnValue(true);
    api.post.mockResolvedValue({ data: { id: 9, name: "עוגה", price_min: 30 } });
    renderSection();
    await screen.findByText("לחם מחמצת");

    fillForm("עוגה");
    fireEvent.click(screen.getByText(PRODUCTS_NS.add_submit_cta));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("a duplicate name asks, and CONFIRMING still creates it — never a block", async () => {
    const spy = vi.spyOn(window, "confirm").mockReturnValue(true);
    api.post.mockResolvedValue({
      data: { id: 9, name: "לחם מחמצת", price_min: 30 },
    });
    renderSection();
    await screen.findByText("לחם מחמצת");

    fillForm("לחם מחמצת");
    fireEvent.click(screen.getByText(PRODUCTS_NS.add_submit_cta));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith(PRODUCTS_NS.duplicate_name_confirm);
    spy.mockRestore();
  });

  it("declining sends nothing at all", async () => {
    const spy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderSection();
    await screen.findByText("לחם מחמצת");

    fillForm("לחם מחמצת");
    fireEvent.click(screen.getByText(PRODUCTS_NS.add_submit_cta));

    expect(spy).toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
