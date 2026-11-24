/**
 * MEH-3788 — «ספרו לנו על העסק» shows only while the page is still empty: no
 * description, or the registration placeholder. With a real description the
 * writer inside «תיאור העסק» is the one entry. A save from the panel that
 * fills the description does not make the panel vanish on that visit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import EditPage from "@/app/[locale]/producer/dashboard/edit/page";
import { DEFAULT_PRODUCER_DESCRIPTIONS } from "@/lib/producer-completeness";

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
// The panel's own behaviour is PageFill.test.jsx's; here only whether it is
// mounted, plus a handle on its onSaved to drive the save-then-reload cell.
const { saved } = vi.hoisted(() => ({ saved: { fn: null } }));
vi.mock("@/components/PageFillPanel", () => ({
  default: ({ onSaved }) => {
    saved.fn = onSaved;
    return <div data-testid="page-fill" />;
  },
}));

const BASE = {
  id: 1, name: "משק", images: [], categories: [], products: [], has_physical_location: true,
  city: "", custom_questions: [], kashrut_badges: [], phone: "", primary_contact_method: "whatsapp",
};

const me = { current: BASE };
function mount(profile) {
  me.current = profile;
  api.get.mockImplementation((url) =>
    Promise.resolve({ data: url === "/producers/me" ? me.current : url.includes("/locations") ? [] : [] }),
  );
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <EditPage />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  saved.fn = null;
  window.location.hash = "";
});

describe("«ספרו לנו על העסק» only for an empty page (MEH-3788)", () => {
  it.each([
    ["no description", undefined],
    ["a blank description", "   "],
    ["the registration placeholder", DEFAULT_PRODUCER_DESCRIPTIONS[0]],
  ])("%s: the panel is shown", async (_label, description) => {
    mount({ ...BASE, description });
    expect(await screen.findByTestId("page-fill")).toBeInTheDocument();
  });

  it("a real description: no panel, and the hub still renders", async () => {
    mount({ ...BASE, description: "חווה משפחתית בגליל, ירקות אורגניים מהשדה." });
    expect(await screen.findByTestId("hub-card-profile")).toBeInTheDocument();
    expect(screen.queryByTestId("page-fill")).toBeNull();
  });

  it("a save from the panel fills the description: the panel stays on this visit", async () => {
    mount({ ...BASE, description: "" });
    await screen.findByTestId("page-fill");
    me.current = { ...BASE, description: "חווה משפחתית בגליל." };
    await act(async () => { await saved.fn(); });
    expect(screen.getByTestId("page-fill")).toBeInTheDocument();
  });
});
