/** MEH-2695 — missing-badge request line in the owner dashboard. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

vi.mock("@/components/ProductsSection", () => ({ default: () => null }));

// MEH-2695 — one line under the badge cards in the products group that sends a
// business which needs a tag we don't have to the existing contact page.
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

const copy = he.dashboard.producer.badge_request;

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
});

describe("Missing-badge request line (MEH-2695)", () => {
  it("uses the copy Sapir approved word-for-word", () => {
    expect(copy.prompt).toBe("חסר תג שמתאים לעסק שלך?");
    expect(copy.link).toBe("כתבו לנו");
  });

  it("sits inside the products group, after the grass-fed card, linking to the contact page", async () => {
    params = { group: "products" };
    mount();
    const line = await screen.findByTestId("badge-request-line");
    const group = screen.getByTestId("group-products");
    expect(group).toContainElement(line);
    expect(group).toBeVisible();
    expect(line).toHaveTextContent(copy.prompt);

    const link = within(line).getByRole("link", { name: copy.link });
    expect(link).toHaveAttribute("href", "/about#contact");

    // Order: the line comes after the grass-fed card (the last badge card).
    const grass = group.querySelector("#grass-fed");
    expect(grass).not.toBeNull();
    expect(
      grass.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("is hidden while another group is open", async () => {
    params = { group: "contact" };
    mount();
    const line = await screen.findByTestId("badge-request-line");
    expect(line).not.toBeVisible();
  });
});
