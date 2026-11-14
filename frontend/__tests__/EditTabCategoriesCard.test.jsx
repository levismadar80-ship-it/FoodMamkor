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
import { CategoriesCard } from "@/app/[locale]/producer/dashboard/edit/cards";

// MEH-1306: cards.jsx now imports @/i18n/navigation (view-on-page link);
// mock it so createNavigation's next/navigation import never loads in jsdom.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const C = he.dashboard.producer.categories;
// MEH-1539 T3: the card now renders the register CategorySelector, whose rest
// state shows only the popular-6 (POPULAR in components/CategorySelector.jsx).
// "ירקות" + "סבונים טבעיים" are both popular, so both cards are visible without
// expanding; "פירות" is a rest-category used to cover the show-more path.
const CATS = [
  { id: 1, name: "ירקות", slug: "veg" },
  { id: 2, name: "סבונים טבעיים", slug: "care" },
  { id: 3, name: "פירות", slug: "fruit" },
];
const chip = (id) => screen.getByTestId(`category-chip-${id}`);

function renderCard(props = {}) {
  const onSave = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <CategoriesCard
        profile={{ categories: [{ id: 1, name: "ירקות", slug: "veg" }] }}
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
    await screen.findByTestId("category-chip-1");
    fireEvent.click(chip(2));
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

  it("marks the first-selected category as primary and reflects selection state", async () => {
    renderCard();
    await screen.findByTestId("category-chip-1");
    // Seeded selection is [1] → chip 1 is pressed AND carries the primary badge.
    expect(chip(1)).toHaveAttribute("aria-pressed", "true");
    expect(chip(2)).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("primary-badge")).toBeInTheDocument();
    // Deselect → nothing pressed, primary badge gone.
    fireEvent.click(chip(1));
    expect(chip(1)).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("primary-badge")).not.toBeInTheDocument();
  });

  it("surfaces the backend Hebrew 422 detail inline (not generic)", async () => {
    api.put.mockRejectedValueOnce({
      response: { status: 422, data: { detail: [{ msg: "צריך מספר רישיון" }] } },
    });
    renderCard();
    await screen.findByTestId("category-chip-2");
    fireEvent.click(chip(2));
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


// MEH-3137 — moving into ירקות/פירות asks for the grower declaration once.
// `farmer_declared_at: null` = she never recorded it; a timestamp = she did;
// absent = unknown (older payloads), where the card does not ask.
describe("CategoriesCard — grower declaration (MEH-3137)", () => {
  const SOAP = [{ id: 2, name: "סבונים טבעיים", slug: "care" }];

  it("adding ירקות with no recorded declaration: the box appears and its tick is sent", async () => {
    renderCard({ profile: { categories: SOAP, farmer_declared_at: null } });
    await screen.findByTestId("category-chip-1");
    expect(screen.queryByTestId("categories-farmer")).toBeNull();
    fireEvent.click(chip(1));
    const box = screen.getByTestId("categories-farmer");
    expect(screen.getByText(he.auth.register.producer.terms.farmer_declaration)).toBeTruthy();
    fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: C.save_cta }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        category_ids: [2, 1],
        farmer_declaration_accepted: true,
      }),
    );
  });

  it("declaration already recorded: no box, no key", async () => {
    renderCard({ profile: { categories: SOAP, farmer_declared_at: "2026-11-14T10:00:00Z" } });
    await screen.findByTestId("category-chip-1");
    fireEvent.click(chip(1));
    expect(screen.queryByTestId("categories-farmer")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: C.save_cta }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", { category_ids: [2, 1] }),
    );
  });

  it("no grower category selected: no box", async () => {
    renderCard({ profile: { categories: [{ id: 1, name: "ירקות", slug: "veg" }], farmer_declared_at: null } });
    await screen.findByTestId("category-chip-1");
    fireEvent.click(chip(1)); // remove ירקות
    fireEvent.click(chip(2));
    expect(screen.queryByTestId("categories-farmer")).toBeNull();
  });
});
