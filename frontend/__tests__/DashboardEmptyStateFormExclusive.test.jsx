import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// MEH-996 audit finding (family 7 — contradictory UI states, PRE-FOUND
// 02/07 screenshot): on the producer dashboard group-buys page the
// empty state ("צרו קבוצה ראשונה" + cart illustration) and the open
// create form render TOGETHER — the two branches are independent
// (`showForm &&` vs `items.length === 0`), so a producer with zero
// group-buys who opens the form sees both mutually-exclusive states.
// Sibling: the recipes dashboard page has the identical structure.
// The correct pattern already exists at settings/page.jsx (`&& !adding`).

vi.mock("next-intl", () => ({
  useTranslations: (ns) => {
    const t = (key) => `${ns}.${key}`;
    t.rich = (key) => `${ns}.${key}`;
    t.raw = (key) => `${ns}.${key}`;
    return t;
  },
  useLocale: () => "he",
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

// Stable identity — the pages' load effects depend on `user`; a fresh
// object per render would loop the effect forever.
const stableUser = { id: "u1", role: "producer" };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: stableUser, loading: false }),
}));

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) => {
      if (url === "/producers/me/dashboard") {
        return Promise.resolve({ data: { producer: { id: "p1", city: "תל אביב" } } });
      }
      // /group-buys (any status) and /producers/me/recipes — empty lists.
      return Promise.resolve({ data: [] });
    }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// RecipeForm drags uploads/toasts along — out of scope; the finding is
// about the page-level branch logic.
vi.mock("@/components/RecipeForm", () => ({
  default: () => <div data-testid="recipe-form-stub" />,
}));

import ProducerGroupBuysPage from "@/app/[locale]/producer/dashboard/group-buys/page";
import ProducerRecipesPage from "@/app/[locale]/producer/dashboard/recipes/page";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dashboard empty state vs create form are mutually exclusive (MEH-996 family 7)", () => {
  it("group-buys: opening the create form from the empty-state CTA hides the empty state", async () => {
    render(<ProducerGroupBuysPage />);
    // Empty list loaded → empty state shows.
    const cta = await screen.findByText("group_buys.dashboard.empty_cta");
    expect(screen.getByText("group_buys.dashboard.empty_title")).toBeTruthy();

    fireEvent.click(cta);

    // Form is open…
    expect(
      screen.getByText("group_buys.dashboard.form.heading"),
    ).toBeTruthy();
    // …so the contradictory empty state must be gone.
    expect(screen.queryByText("group_buys.dashboard.empty_title")).toBeNull();
    expect(screen.queryByText("group_buys.dashboard.empty_cta")).toBeNull();
  });

  it("group-buys: closing the form brings the empty state back", async () => {
    render(<ProducerGroupBuysPage />);
    const cta = await screen.findByText("group_buys.dashboard.empty_cta");
    fireEvent.click(cta);
    // Header toggle now reads btn_close_form.
    fireEvent.click(screen.getByText("group_buys.dashboard.btn_close_form"));
    await waitFor(() =>
      expect(screen.getByText("group_buys.dashboard.empty_title")).toBeTruthy(),
    );
  });

  it("recipes (sibling): opening the create form from the empty-state CTA hides the empty state", async () => {
    render(<ProducerRecipesPage />);
    const cta = await screen.findByText("recipes.dashboard.empty_cta");
    expect(
      screen.getByText("recipes.dashboard.empty_title"),
    ).toBeTruthy();

    fireEvent.click(cta);

    expect(screen.getByTestId("recipe-form-stub")).toBeTruthy();
    expect(
      screen.queryByText("recipes.dashboard.empty_title"),
    ).toBeNull();
  });
});
