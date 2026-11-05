/**
 * MEH-2699 — «עסק של מילואימניקים» lives inside the «מאחורי העסק» card.
 * Pins: no separate reservist accordion card; the switch renders inside the
 * owner-story card; the CLOSED owner-story card's summary names the badge
 * when the claim is on, and does not when it is off.
 */
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
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/producer/dashboard/edit",
  Link: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
}));
vi.mock("@/components/ProductsSection", () => ({ default: () => null }));

const BASE = {
  id: 1,
  name: "משק",
  images: [],
  categories: [],
  products: [],
  custom_questions: [],
  kashrut_badges: [],
  phone: "0500000000",
  primary_contact_method: "whatsapp",
};

function mount(profile) {
  api.get.mockImplementation((url) =>
    url === "/producers/me"
      ? Promise.resolve({ data: profile })
      : Promise.resolve({ data: [] }),
  );
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <EditPage />
    </NextIntlClientProvider>,
  );
  return screen.findByTestId("edit-hub");
}

beforeEach(() => {
  vi.clearAllMocks();
  api.put.mockResolvedValue({ data: {} });
});

const LABEL = "עסק של מילואימניקים";

describe("reservist switch inside «מאחורי העסק» (MEH-2699)", () => {
  it("renders the switch inside the owner-story card, with no card of its own", async () => {
    await mount({ ...BASE, reservist_owned: false });
    const ownerStory = document.getElementById("owner-story");
    expect(ownerStory).not.toBeNull();
    expect(within(ownerStory).getByTestId("reservist-owned-row")).toBeInTheDocument();
    // The old standalone accordion carried this heading as its title.
    expect(document.querySelectorAll("#reservist-owned")).toHaveLength(1);
    expect(ownerStory.contains(document.getElementById("reservist-owned"))).toBe(true);
  });

  it("the closed card summary names the badge when the claim is on", async () => {
    await mount({ ...BASE, reservist_owned: true });
    const ownerStory = document.getElementById("owner-story");
    expect(ownerStory.textContent).toContain(` · ${LABEL}`);
  });

  it("no badge in the summary when the claim is off", async () => {
    await mount({ ...BASE, reservist_owned: false });
    const ownerStory = document.getElementById("owner-story");
    expect(ownerStory.textContent).not.toContain(` · ${LABEL}`);
  });
});
