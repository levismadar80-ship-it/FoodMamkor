/**
 * MEH-3762 — «עריכה» in one tap: tapping a group tile also opens a card.
 * Cells: a one-card group (trust) → its card, filled or not; a several-card
 * group → its first missing card (0 filled → the first; first filled → the
 * next); every card filled → none open (the helper's null cell, below).
 * A #hash deep link still wins: that path is the hash resolver, untouched.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import EditPage from "@/app/[locale]/producer/dashboard/edit/page";
import { autoOpenKeyFor } from "@/lib/edit-auto-open";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
const authStub = { user: { id: 1, role: "producer" }, loading: false };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authStub }));
const routerStub = { push: vi.fn(), replace: vi.fn() };
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => routerStub,
  usePathname: () => "/producer/dashboard/edit",
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => ({ get: () => null }) }));
vi.mock("@/components/ProductsSection", () => ({ default: () => null }));

const BASE = {
  id: 1, name: "משק", images: [], categories: [], products: [], has_physical_location: true,
  city: "", custom_questions: [], kashrut_badges: [], phone: "", primary_contact_method: "whatsapp",
};

function mount(profile) {
  api.get.mockImplementation((url) =>
    Promise.resolve({
      data: url === "/producers/me" ? profile : url.includes("/locations") ? profile.locations || [] : [],
    }),
  );
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <EditPage />
    </NextIntlClientProvider>,
  );
}

const expanded = (anchor) => screen.getByTestId(`accordion-${anchor}`).getAttribute("aria-expanded");

beforeEach(() => {
  vi.clearAllMocks();
  window.location.hash = "";
});

describe("hub tile opens a card (MEH-3762)", () => {
  it("one-card group: «רישיון וכשרות» opens its card", async () => {
    mount(BASE);
    fireEvent.click(await screen.findByTestId("hub-card-trust"));
    await waitFor(() => expect(expanded("trust")).toBe("true"));
  });

  it("several cards, none filled: the first one opens, the rest stay closed", async () => {
    mount(BASE);
    fireEvent.click(await screen.findByTestId("hub-card-profile"));
    await waitFor(() => expect(expanded("images")).toBe("true"));
    expect(expanded("categories")).toBe("false");
  });

  it("organizer: the profile group has no categories card, so it never opens", async () => {
    mount({ ...BASE, kind: "organizer", images: [{ url: "https://res.cloudinary.com/x/a.jpg" }] });
    fireEvent.click(await screen.findByTestId("hub-card-profile"));
    await waitFor(() => expect(expanded("bio")).toBe("true"));
    expect(screen.queryByTestId("accordion-categories")).toBeNull();
  });

  it("every card in the group filled: nothing opens", async () => {
    mount({
      ...BASE,
      locations: [{ id: 1, kind: "branch", is_primary: true, lat: 32.08, lng: 34.78, opening_hours: "א-ה 09:00-17:00" }],
    });
    fireEvent.click(await screen.findByTestId("hub-card-location"));
    await waitFor(() => expect(routerStub.push).toHaveBeenCalled());
    expect(expanded("locations")).toBe("false");
    expect(expanded("delivery")).toBe("false");
  });

  it("several cards, the first filled: the first MISSING one opens", async () => {
    mount({ ...BASE, images: [{ url: "https://res.cloudinary.com/x/a.jpg" }] });
    fireEvent.click(await screen.findByTestId("hub-card-profile"));
    await waitFor(() => expect(expanded("categories")).toBe("true"));
    expect(expanded("images")).toBe("false");
  });
});

describe("autoOpenKeyFor (MEH-3762)", () => {
  it("every card filled in a several-card group: nothing opens", () => {
    expect(autoOpenKeyFor("contact", ["contact", "questions"], { contact: true, questions: true })).toBeNull();
  });
  it("the one-card trust group opens even when both of its members are filled", () => {
    expect(autoOpenKeyFor("trust", ["license", "kashrut"], { license: true, kashrut: true })).toBe("trust");
  });
  it("the second card missing opens the second", () => {
    expect(autoOpenKeyFor("contact", ["contact", "questions"], { contact: true, questions: false })).toBe("questions");
  });
});
