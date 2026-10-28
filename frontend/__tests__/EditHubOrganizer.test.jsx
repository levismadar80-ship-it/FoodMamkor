import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import EditPage from "@/app/[locale]/producer/dashboard/edit/page";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));
const authStub = { user: { id: 1, role: "producer" }, loading: false };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authStub }));
const routerStub = { push: vi.fn(), replace: vi.fn() };
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => routerStub,
  usePathname: () => "/producer/dashboard/edit",
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
// The active group is read from ?group — drive it per test via `params`.
let params = {};
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (k) => (k in params ? params[k] : null) }),
}));
vi.mock("@/components/ProductsSection", () => ({ default: () => null }));

const PROFILE = {
  id: 1,
  name: "משק",
  images: [],
  categories: [],
  products: [],
  has_physical_location: true,
  city: "",
  custom_questions: [],
  kashrut_badges: [],
  phone: "",
  primary_contact_method: "whatsapp",
};

const tHub = he.dashboard.producer.edit_accordion;

function mount() {
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <EditPage />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  params = {};
  window.location.hash = "";
  api.get.mockImplementation((url) =>
    url === "/producers/me"
      ? Promise.resolve({ data: PROFILE })
      : Promise.resolve({ data: [] }),
  );
  api.put.mockResolvedValue({ data: {} });
});

/**
 * MEH-2460 (review #3711 F2/F3) — the edit hub for an organizer
 * (kind='organizer', ADR-036). Harness above copied from EditHubNav.test.jsx.
 *  - only profile + contact tiles;
 *  - a group outside that set (?group=products, an #products deep link)
 *    resolves to the HUB — never a page with every group hidden;
 *  - the profile tile counts no categories card (3 members, not 4);
 *  - control: a business still enters ?group=products.
 */
const ORGANIZER = { ...PROFILE, kind: "organizer" };

function asOrganizer() {
  api.get.mockImplementation((url) =>
    url === "/producers/me"
      ? Promise.resolve({ data: ORGANIZER })
      : Promise.resolve({ data: [] }),
  );
}

const tileKeys = () =>
  [...screen.getByTestId("edit-hub").querySelectorAll('[data-testid^="hub-card-"]')].map(
    (el) => el.getAttribute("data-testid").replace("hub-card-", ""),
  );

describe("MEH-2460 — edit hub for an organizer", () => {
  it("shows only the profile and contact tiles", async () => {
    asOrganizer();
    mount();
    await screen.findByTestId("edit-hub");
    expect(tileKeys()).toEqual(["profile", "contact"]);
  });

  it("?group=products resolves to the hub, not to a blank page", async () => {
    asOrganizer();
    params.group = "products";
    mount();
    await screen.findByTestId("edit-hub");
    expect(screen.getByTestId("edit-hub")).toBeVisible();
    for (const g of ["profile", "products", "location", "contact", "trust"]) {
      expect(screen.getByTestId(`group-${g}`)).not.toBeVisible();
    }
  });

  it("the profile group has no categories card and its tile counts 3 members", async () => {
    asOrganizer();
    mount();
    await screen.findByTestId("edit-hub");
    expect(screen.queryByTestId("accordion-categories")).not.toBeInTheDocument();
    const tile = screen.getByTestId("hub-card-profile");
    expect(tile.textContent).toMatch(/מתוך 3 /);
    expect(tile.textContent).not.toMatch(/מתוך 4 /);
  });

  it("an #products deep link keeps an organizer on the hub (review #3711 R2-6)", async () => {
    asOrganizer();
    window.location.hash = "#products";
    mount();
    await screen.findByTestId("edit-hub");
    expect(routerStub.replace).not.toHaveBeenCalledWith(
      expect.objectContaining({ query: { group: "products" } }),
      expect.anything(),
    );
    expect(screen.getByTestId("edit-hub")).toBeVisible();
  });

  it("control: the same #products deep link moves a business into its group", async () => {
    window.location.hash = "#products";
    mount();
    await screen.findByTestId("edit-hub");
    await waitFor(() =>
      expect(routerStub.replace).toHaveBeenCalledWith(
        expect.objectContaining({ query: { group: "products" } }),
        expect.anything(),
      ),
    );
  });

  it("control: a business still enters ?group=products", async () => {
    params.group = "products";
    mount();
    await screen.findByTestId("group-products");
    expect(screen.getByTestId("group-products")).toBeVisible();
    expect(screen.getByTestId("edit-hub")).not.toBeVisible();
  });

  it("the description card reads «חובה» for an organizer — her gate requires it (review #3711 R2-3)", async () => {
    asOrganizer();
    mount();
    await screen.findByTestId("edit-hub");
    expect(screen.getByTestId("section-chip-bio").textContent).toBe(tHub.chip_required);
    // and no «חובה» on cards her gate never reads
    expect(screen.getByTestId("section-chip-products").textContent).toBe(tHub.chip_optional);
    expect(screen.getByTestId("section-chip-locations").textContent).toBe(tHub.chip_optional);
  });

  it("control: for a business the description card stays «רשות» and products «חובה»", async () => {
    mount();
    await screen.findByTestId("edit-hub");
    expect(screen.getByTestId("section-chip-bio").textContent).toBe(tHub.chip_optional);
    expect(screen.getByTestId("section-chip-products").textContent).toBe(tHub.chip_required);
  });
});
