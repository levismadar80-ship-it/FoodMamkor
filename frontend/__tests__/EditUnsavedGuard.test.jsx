/**
 * MEH-1100 — page-level unsaved-changes guard (integration).
 *
 * Mounts the full edit page with mocked api/auth and drives the
 * reportDirty → anyDirty → banner flow through a real card edit + save.
 * The confirm/beforeunload dialogs themselves are covered by the
 * Playwright QA run (qa-artifacts/MEH-1100) — jsdom has no native dialogs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import EditPage from "@/app/[locale]/producer/dashboard/edit/page";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));
// Stable identities — the page's fetch effect lists `user` and `router` in
// its deps; per-render objects would re-trigger it and reset the profile
// mid-test (re-dirtying the just-saved card).
const authStub = { user: { id: 1, role: "producer" }, loading: false };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => authStub,
}));
const routerStub = { push: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => routerStub,
}));
// ProductsSection is self-fetching CRUD, irrelevant to the guard.
vi.mock("@/components/ProductsSection", () => ({ default: () => null }));

const PROFILE = {
  id: 1,
  name: "משק",
  images: [],
  categories: [],
  has_physical_location: false,
  custom_questions: [],
  phone: "",
  instagram: "",
  website: "",
  contact_email: "",
  facebook: "",
  external_order_form: "",
  primary_contact_method: "whatsapp",
};

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((url) => {
    if (url === "/producers/me") return Promise.resolve({ data: PROFILE });
    return Promise.resolve({ data: [] });
  });
  api.put.mockResolvedValue({ data: {} });
});

describe("Edit page unsaved-changes guard (MEH-1100)", () => {
  it("shows the banner while a card is dirty and clears it after save", async () => {
    render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <EditPage />
      </NextIntlClientProvider>,
    );
    const Q = he.dashboard.producer.custom_questions;
    await waitFor(() =>
      expect(screen.getByPlaceholderText(Q.placeholder_1)).toBeInTheDocument(),
    );

    // Clean page: no banner.
    expect(screen.queryByTestId("unsaved-banner")).not.toBeInTheDocument();

    // Edit a custom question → its derived dirty flag lifts to the page.
    fireEvent.change(screen.getByPlaceholderText(Q.placeholder_1), {
      target: { value: "מה כשר אצלכם?" },
    });
    expect(await screen.findByTestId("unsaved-banner")).toBeInTheDocument();

    // Save the card → dirty clears via the onSave profile patch → banner gone.
    fireEvent.click(screen.getByRole("button", { name: Q.save_cta }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        custom_questions: ["מה כשר אצלכם?"],
      }),
    );
    await waitFor(
      () => expect(screen.queryByTestId("unsaved-banner")).not.toBeInTheDocument(),
      { timeout: 3000 },
    );
  });
});
