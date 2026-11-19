import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import EditPage from "@/app/[locale]/producer/dashboard/edit/page";
import { producerCompleteness } from "@/lib/producer-completeness";

// MEH-2930 (pilot B9): the location tile counted delivery only and read
// «1 מתוך 1» while the completeness checklist said «שעות פתיחה — חסר». Hours
// live on the primary location (MEH-2142), so the tile must count them too,
// through the same resolveStoreHours the checklist uses.

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: 1, role: "producer" }, loading: false }) }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/producer/dashboard/edit",
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => ({ get: () => null }) }));
vi.mock("@/components/ProductsSection", () => ({ default: () => null }));

const BASE = {
  id: 1, name: "משק", images: [], categories: [], products: [], city: "חיפה",
  has_physical_location: true, custom_questions: [], kashrut_badges: [], phone: "",
  primary_contact_method: "whatsapp",
};
const progress = (done, total) =>
  he.dashboard.producer.edit_accordion.hub_progress.replace("{done}", done).replace("{total}", total);

function mountWith(profile, liveLocations = profile.locations) {
  api.get.mockImplementation((url) => {
    if (url === "/producers/me") return Promise.resolve({ data: profile });
    if (url === "/producers/me/locations") return Promise.resolve({ data: liveLocations });
    return Promise.resolve({ data: [] });
  });
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <EditPage />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("location tile agrees with the hours checklist (MEH-2930)", () => {
  it("no hours on the primary location → the tile is not complete", async () => {
    const profile = { ...BASE, locations: [{ id: 1, is_primary: true, opening_hours: "" }] };
    // The checklist's own verdict, from the real helper — the oracle.
    expect(producerCompleteness(profile).missing).toContain("hours");
    mountWith(profile);
    const tile = await screen.findByTestId("hub-card-location");
    expect(tile).toHaveTextContent(progress(1, 2));
  });

  it("hours on the primary location → the tile is complete", async () => {
    const profile = { ...BASE, locations: [{ id: 1, is_primary: true, opening_hours: "א-ה 08:00-16:00" }] };
    mountWith(profile);
    const tile = await screen.findByTestId("hub-card-location");
    expect(tile).toHaveTextContent(progress(2, 2));
  });

  it("hours saved in the locations editor move the tile without a reload", async () => {
    const stale = { ...BASE, locations: [{ id: 1, is_primary: true, opening_hours: "" }] };
    mountWith(stale, [{ id: 1, is_primary: true, opening_hours: "א-ה 08:00-16:00" }]);
    const tile = await screen.findByTestId("hub-card-location");
    await waitFor(() => expect(tile).toHaveTextContent(progress(2, 2)));
  });
});
