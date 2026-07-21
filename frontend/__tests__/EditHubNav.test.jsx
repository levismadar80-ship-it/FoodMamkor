/**
 * MEH-1408 — edit-tab hub-and-spoke group navigation.
 *
 * Covers the shell added over the existing accordion: the 4-group hub, entering
 * a group (router.push with ?group, scroll:false), the back-to-hub link, and
 * anchor→group deep-link resolution (#bio → profile group). The card bodies +
 * their own accordion behavior are covered by the per-card EditTab* suites and
 * EditUnsavedGuard; this file only exercises the group layer.
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

describe("Edit hub-and-spoke navigation (MEH-1408)", () => {
  it("renders the 4 group tiles as the default hub view", async () => {
    mount();
    await screen.findByTestId("edit-hub");

    expect(screen.getByTestId("edit-hub")).toBeVisible();
    for (const g of ["profile", "trust", "location", "contact"]) {
      expect(screen.getByTestId(`hub-card-${g}`)).toBeInTheDocument();
    }
    // Group panels are mounted but hidden until entered.
    expect(screen.getByTestId("group-profile")).not.toBeVisible();
    expect(screen.getByTestId("group-contact")).not.toBeVisible();
    // The hub tile carries the locked Hebrew group name.
    expect(screen.getByTestId("hub-card-location")).toHaveTextContent(
      tHub.hub_group_location,
    );
  });

  it("entering a group via a hub tile pushes ?group with scroll:false", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("hub-card-contact"));
    expect(routerStub.push).toHaveBeenCalledWith(
      { pathname: "/producer/dashboard/edit", query: { group: "contact" } },
      { scroll: false },
    );
  });

  it("shows only the active group's cards and a back link when ?group is set", async () => {
    params.group = "profile";
    mount();
    await screen.findByTestId("group-profile");

    expect(screen.getByTestId("group-profile")).toBeVisible();
    expect(screen.getByTestId("edit-hub")).not.toBeVisible();
    expect(screen.getByTestId("group-contact")).not.toBeVisible();
    // profile cards visible; a contact card stays mounted but hidden.
    expect(screen.getByTestId("accordion-images")).toBeVisible();
    expect(screen.getByTestId("accordion-questions")).not.toBeVisible();
    expect(screen.getAllByTestId("hub-back").length).toBeGreaterThan(0);
  });

  it("the back link returns to the hub via push (Back = hub on mobile)", async () => {
    params.group = "profile";
    mount();
    await screen.findByTestId("group-profile");
    // Every group wrapper reuses the same back link; the visible one is profile.
    fireEvent.click(screen.getAllByTestId("hub-back")[0]);
    expect(routerStub.push).toHaveBeenCalledWith(
      { pathname: "/producer/dashboard/edit" },
      { scroll: false },
    );
  });

  it("resolves a #bio deep link to the profile group (replace, no hub entry)", async () => {
    window.location.hash = "#bio";
    mount();
    await waitFor(() =>
      expect(routerStub.replace).toHaveBeenCalledWith(
        { pathname: "/producer/dashboard/edit", query: { group: "profile" } },
        { scroll: false },
      ),
    );
  });

  it("opens + scrolls the card for an in-group #hours deep link", async () => {
    const scrollSpy = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollSpy;
    window.requestAnimationFrame = (cb) => cb();
    params.group = "location";
    window.location.hash = "#hours";
    mount();
    await waitFor(() =>
      expect(screen.getByTestId("accordion-hours")).toHaveAttribute(
        "aria-expanded",
        "true",
      ),
    );
    expect(scrollSpy).toHaveBeenCalled();
    // No group switch needed — already in the location group.
    expect(routerStub.replace).not.toHaveBeenCalled();
  });

  it("composes license + kashrut as one unified trust card (no separate cards)", async () => {
    params.group = "trust";
    mount();
    const trust = await screen.findByTestId("accordion-trust");
    fireEvent.click(trust); // open the unified card

    const L = he.dashboard.producer.license;
    const K = he.dashboard.producer.kashrut;
    expect(screen.getByText(L.heading)).toBeInTheDocument();
    expect(screen.getByText(K.heading)).toBeInTheDocument();
    // The old standalone license/kashrut accordions no longer exist.
    expect(screen.queryByTestId("accordion-license")).not.toBeInTheDocument();
    expect(screen.queryByTestId("accordion-kashrut")).not.toBeInTheDocument();
  });
});
