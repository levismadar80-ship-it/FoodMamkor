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
const routerStub = { push: vi.fn(), replace: vi.fn() };
// MEH-1157: the page's login redirect moved to the locale-aware router.
// MEH-1306: cards.jsx now renders LocaleLink (the view-on-page back-link),
// so the mock factory must also provide Link.
// MEH-1408: the hub-and-spoke page also reads usePathname (for the group
// router.push) here.
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => routerStub,
  usePathname: () => "/producer/dashboard/edit",
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
// MEH-1408: the active group comes from ?group via next/navigation's
// useSearchParams — drive it with a mutable `params` (EventsUrlSync pattern) so
// each test can mount straight into the group whose card it exercises.
let params = {};
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (k) => (k in params ? params[k] : null) }),
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
  params = {};
  api.get.mockImplementation((url) => {
    if (url === "/producers/me") return Promise.resolve({ data: PROFILE });
    return Promise.resolve({ data: [] });
  });
  api.put.mockResolvedValue({ data: {} });
});

describe("Edit page unsaved-changes guard (MEH-1100)", () => {
  it("shows the banner while a card is dirty and clears it after save", async () => {
    // MEH-1408: mount into the contact group so the questions card's save
    // button is visible (getByRole excludes hidden group wrappers).
    params.group = "contact";
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

    // MEH-1116: cards start collapsed inside the accordion — expand the
    // questions card first (role queries skip hidden panels).
    fireEvent.click(screen.getByTestId("accordion-questions"));

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

  // MEH-1237: the banner names each dirty card with a jump link (Shopify Polaris
  // contextual save bar) — reusing the card heading strings + KEY_TO_ANCHOR.
  it("names each dirty card as a jump link and jumps on click", async () => {
    const scrollSpy = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollSpy;
    window.requestAnimationFrame = (cb) => cb();

    // MEH-1408: mount into the profile group so the bio jump-target is in the
    // active group and jumpToCard scrolls synchronously (a cross-group jump
    // defers the scroll to the post-router.push re-render, which the stubbed
    // router doesn't trigger). Both cards stay mounted regardless, so the
    // questions edit still lifts its dirty flag from the hidden contact group.
    params.group = "profile";
    render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <EditPage />
      </NextIntlClientProvider>,
    );
    const Q = he.dashboard.producer.custom_questions;
    const D = he.dashboard.producer.description_card;
    await waitFor(() =>
      expect(screen.getByTestId("accordion-questions")).toBeInTheDocument(),
    );

    // Dirty two cards (they stay mounted when collapsed, so both flags persist).
    fireEvent.click(screen.getByTestId("accordion-questions"));
    fireEvent.change(screen.getByPlaceholderText(Q.placeholder_1), {
      target: { value: "מה כשר אצלכם?" },
    });
    fireEvent.click(screen.getByTestId("accordion-bio"));
    fireEvent.change(await screen.findByPlaceholderText(D.desc_placeholder), {
      target: { value: "תיאור חדש לעסק" },
    });

    await screen.findByTestId("unsaved-banner");
    // Both dirty cards named as links, with the reused heading strings.
    expect(screen.getByTestId("unsaved-jump-bio")).toHaveTextContent(D.heading);
    expect(screen.getByTestId("unsaved-jump-questions")).toHaveTextContent(Q.heading);

    // Click a name → open + scroll path runs (scrollIntoView on the anchor id).
    fireEvent.click(screen.getByTestId("unsaved-jump-bio"));
    expect(scrollSpy).toHaveBeenCalled();
  });
});
