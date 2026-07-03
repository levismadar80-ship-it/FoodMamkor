/**
 * Edit-tab chunk A — CategoriesCard isolation tests.
 *
 * Renders the CARD directly (not ProducerDashboardEditPage — the full-page
 * mount hangs the vitest runner; i18n was ruled out) under the REAL
 * NextIntlClientProvider + he.json, mirroring the MEH-996 harness
 * (I18nNamespaceResolution.test.jsx). Real translator ⇒ stable `t` ⇒ the
 * mount-fetch effect settles.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { CategoriesCard } from "@/app/[locale]/producer/dashboard/edit/page";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const C = he.dashboard.producer.categories;
const CATS = [
  { id: 1, name: "ירקות" },
  { id: 2, name: "פירות" },
];

function renderCard(props = {}) {
  const onSave = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <CategoriesCard
        profile={{ categories: [{ id: 1, name: "ירקות" }] }}
        onSave={onSave}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onSave, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: CATS });
  api.put.mockResolvedValue({ data: {} });
});

describe("Edit-tab CategoriesCard (isolation)", () => {
  it("toggles a category and saves the new category_ids set", async () => {
    const { onSave } = renderCard();
    await screen.findByRole("checkbox", { name: "ירקות" });
    fireEvent.click(screen.getByRole("checkbox", { name: "פירות" }));
    fireEvent.click(screen.getByRole("button", { name: C.save_cta }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", { category_ids: [1, 2] }),
    );
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ categories: expect.any(Array) }),
      ),
    );
  });

  it("surfaces the backend Hebrew 422 detail inline (not generic)", async () => {
    api.put.mockRejectedValueOnce({
      response: { status: 422, data: { detail: [{ msg: "צריך מספר רישיון" }] } },
    });
    renderCard();
    await screen.findByRole("checkbox", { name: "פירות" });
    fireEvent.click(screen.getByRole("checkbox", { name: "פירות" }));
    fireEvent.click(screen.getByRole("button", { name: C.save_cta }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("צריך מספר רישיון");
    expect(alert.textContent).not.toContain("[object Object]");
  });

  it("shows the inline fetch_error branch when GET /categories fails", async () => {
    api.get.mockRejectedValueOnce(new Error("network"));
    renderCard();
    // No detail on a plain network error → falls back to the fetch_error copy.
    expect(await screen.findByText(C.fetch_error)).toBeInTheDocument();
  });
});
