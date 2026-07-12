/**
 * MEH-1134: state-aware Overview card order.
 *
 * A brand-new owner (pending / incomplete profile) used to see the
 * availability card — disabled for her (`disabled={!isApproved}`) — ABOVE
 * the ProfileCompletenessCard, which sat last even though it is the only
 * actionable card in that state. The fix mounts the completeness card
 * directly below the status banners (above availability) while
 * `producer.status !== "approved"` OR the completeness heuristic reports
 * missing fields; once approved AND complete, today's order stands
 * (availability first — the daily action of a live business).
 *
 * This test pins the page-level ORDER contract only:
 *   - pending  + incomplete → completeness above availability
 *   - approved + incomplete → completeness above availability
 *   - approved + complete   → availability above completeness (unchanged)
 *   - exactly ONE completeness mount per state (no duplicate)
 *
 * ProfileCompletenessCard is mocked to a testid stub — its internals are
 * covered by ProfileCompletenessCard.test.jsx; the availability card is
 * located via its identity-mocked heading key. Mock harness mirrors
 * DashboardSingleCompletenessWidget.test.jsx.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ProducerDashboardPage from "@/app/[locale]/producer/dashboard/page";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Signed-in producer so the page clears its role guard and fetches. Stable
// `user` ref so the [user, authLoading] effect doesn't re-fire every render.
vi.mock("@/lib/auth-context", () => {
  const user = { id: 1, name: "דנה", role: "producer" };
  return {
    useAuth: () => ({ user, loading: false }),
  };
});

// next-intl identity mock — `t(key) => key`, plus `t.rich` (welcome_subtitle).
vi.mock("next-intl", () => {
  const t = (key) => key;
  t.rich = (key) => key;
  return {
    useLocale: () => "he",
    useTranslations: () => t,
  };
});

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@phosphor-icons/react", () => ({
  WhatsappLogo: (p) => <span {...p} />,
  Eye: (p) => <span {...p} />,
  Sparkle: (p) => <span {...p} />,
  LockSimple: (p) => <span {...p} />,
  X: (p) => <span {...p} />,
}));
vi.mock("@/components/InfoTooltip", () => ({ default: () => null }));
vi.mock("@/components/PhoneVerifyCard", () => ({ default: () => null }));
vi.mock("@/lib/holidays", () => ({ getUpcomingHoliday: () => null }));
// The order contract is page-level — stub the card to a stable testid.
vi.mock("@/components/ProfileCompletenessCard", () => ({
  default: () => <div data-testid="completeness-card" />,
}));
// Admin request-changes banner is out of scope (its position is pinned
// elsewhere); stub so the test doesn't depend on its internals.
vi.mock("@/app/[locale]/producer/dashboard/ChangesRequestedBanner", () => ({
  default: () => null,
}));

// Every field the lib/producer-completeness.js heuristic reads, filled —
// missing.length === 0 → the "complete" branch.
const completeProfile = {
  id: 1,
  name: "עסק לדוגמה",
  city: "חיפה",
  lat: 32.79,
  lng: 34.99,
  phone: "0501234567",
  instagram: null,
  categories: ["honey"],
  images: ["https://res.cloudinary.com/demo/image/upload/v1/a.jpg"],
  delivery_areas: [],
  short_description: "דבש מקומי",
};

// city/coords/contact/categories/images/description all empty → missing > 0.
const incompleteProfile = {
  id: 1,
  name: "עסק לדוגמה",
  city: null,
  lat: null,
  lng: null,
  phone: null,
  instagram: null,
  categories: [],
  images: [],
  delivery_areas: [],
};

// Per-test knobs the api mock reads (set in each `it` before render).
let producerStatus = "pending";
let profileFixture = incompleteProfile;

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) => {
      if (url === "/producers/me/dashboard") {
        return Promise.resolve({
          data: {
            producer: {
              id: 1,
              name: "עסק לדוגמה",
              slug: "esek-ledugma",
              status: producerStatus,
              availability_state: "accepting_orders",
            },
          },
        });
      }
      if (url === "/producers/me/analytics") {
        return Promise.resolve({
          data: {
            profile_views: { total: 0, last_7d: 0 },
            whatsapp_clicks: { total: 0, last_7d: 0 },
          },
        });
      }
      if (url === "/producers/me") {
        return Promise.resolve({ data: profileFixture });
      }
      return Promise.resolve({ data: null });
    }),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
  },
}));

/** DOM-order helper: does `a` precede `b` in the rendered document? */
function precedes(first, second) {
  const pos = first.compareDocumentPosition(second);
  return (pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

async function renderAndLocate() {
  render(<ProducerDashboardPage />);
  const completeness = await screen.findByTestId("completeness-card");
  const availabilityHeading = screen.getByText("availability.heading");
  return { completeness, availabilityHeading };
}

describe("Producer dashboard — conditional card order (MEH-1134)", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("pending + incomplete → completeness card above the availability card", async () => {
    producerStatus = "pending";
    profileFixture = incompleteProfile;
    const { completeness, availabilityHeading } = await renderAndLocate();

    expect(precedes(completeness, availabilityHeading)).toBe(true);
    expect(screen.getAllByTestId("completeness-card")).toHaveLength(1);
  });

  it("approved + incomplete → completeness card above the availability card", async () => {
    producerStatus = "approved";
    profileFixture = incompleteProfile;
    const { completeness, availabilityHeading } = await renderAndLocate();

    expect(precedes(completeness, availabilityHeading)).toBe(true);
    expect(screen.getAllByTestId("completeness-card")).toHaveLength(1);
  });

  it("approved + complete → today's order preserved (availability first)", async () => {
    producerStatus = "approved";
    profileFixture = completeProfile;
    const { completeness, availabilityHeading } = await renderAndLocate();

    expect(precedes(availabilityHeading, completeness)).toBe(true);
    expect(screen.getAllByTestId("completeness-card")).toHaveLength(1);
  });
});
