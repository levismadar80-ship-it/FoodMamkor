/**
 * MEH-2229: a failed availability write must not leave the rejected,
 * optimistic state on screen.
 *
 * Before the fix, `setAvailabilityState` applied the new state optimistically,
 * and on a failed POST the ONLY thing undoing it was a refetch whose
 * `.catch(() => {})` swallowed its own failure. A write that failed AND a
 * refetch that failed (network, 401 mid token-refresh, 500) therefore left
 * the radio lit on a state the server had just refused — next to an error
 * toast saying it was refused. MEH-325 silent-except class.
 *
 * Renders the full dashboard page (whole-component convention from
 * DashboardVacationDateReveal.test.jsx) and drives the real
 * `setAvailabilityState` — no copy of the handler is exercised here.
 *
 * Shape of the suite, per testing.md "a green that has two possible causes":
 *   - case 1 is the discriminator: it FAILS against the pre-MEH-2229 handler
 *     (the rejected state stays checked) and passes after.
 *   - case 2 is the CONTROL: refetch succeeds, both old and new code pass —
 *     proves the suite is not red for a reason unrelated to the change.
 *   - case 3 guards the happy path: a successful write is NOT rolled back.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProducerDashboardPage from "@/app/[locale]/producer/dashboard/page";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/auth-context", () => {
  const user = { id: 1, name: "דנה", role: "producer" };
  return {
    useAuth: () => ({ user, loading: false }),
  };
});

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
  PencilSimple: (p) => <span {...p} />,
  Warning: (p) => <span {...p} />,
  Leaf: (p) => <span {...p} />,
  Check: (p) => <span {...p} />,
  ArrowRight: (p) => <span {...p} />,
  X: (p) => <span {...p} />,
  Sparkle: (p) => <span {...p} />,
  WhatsappLogo: (p) => <span {...p} />,
  Eye: (p) => <span {...p} />,
}));
vi.mock("@/components/InfoTooltip", () => ({ default: () => null }));
vi.mock("@/components/PhoneVerifyCard", () => ({ default: () => null }));
vi.mock("@/components/ProfileCompletenessCard", () => ({ default: () => null }));
vi.mock("@/lib/holidays", () => ({ getUpcomingHoliday: () => null }));

// vi.hoisted so the api/toast mock factories can close over these despite
// vi.mock hoisting. `refetchRef` scripts the SECOND (and later) GET of
// /producers/me/dashboard — the failure-path refetch — independently of the
// first one, which is the page load.
const { postSpy, toastError, dashboardRef, refetchRef, dashboardGets } = vi.hoisted(() => ({
  postSpy: vi.fn(),
  toastError: vi.fn(),
  dashboardRef: { current: null },
  refetchRef: { current: null },
  dashboardGets: { count: 0 },
}));

vi.mock("@/lib/toast", () => ({
  showToast: { success: vi.fn(), error: toastError, info: vi.fn() },
}));

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) => {
      if (url === "/producers/me/dashboard") {
        dashboardGets.count += 1;
        if (dashboardGets.count === 1) {
          return Promise.resolve({ data: dashboardRef.current });
        }
        return refetchRef.current();
      }
      // analytics + /producers/me → null (KPI hero + completeness stay unmounted).
      return Promise.resolve({ data: null });
    }),
    post: postSpy,
    put: vi.fn(() => Promise.resolve({})),
  },
}));

const radio = (value) => screen.getByRole("radio", { name: new RegExp(`options\\.${value}`) });
const availabilityPosts = () =>
  postSpy.mock.calls.filter((c) => c[0] === "/producers/me/availability-state");

const serverState = () => ({
  producer: {
    id: 1,
    name: "עסק לדוגמה",
    status: "approved",
    availability_state: "accepting_orders",
  },
});

describe("Dashboard availability — failed write never leaves the rejected state lit (MEH-2229)", () => {
  beforeEach(() => {
    postSpy.mockReset();
    toastError.mockClear();
    mockPush.mockClear();
    dashboardGets.count = 0;
    dashboardRef.current = serverState();
    refetchRef.current = () => Promise.resolve({ data: serverState() });
  });

  it("write fails AND the refetch fails → the radio returns to the server state, and the failed re-sync is reported", async () => {
    postSpy.mockImplementation(() => Promise.reject(new Error("network")));
    refetchRef.current = () => Promise.reject(new Error("network"));

    render(<ProducerDashboardPage />);
    await screen.findByRole("radio", { name: /options\.full_this_week/ });
    expect(radio("accepting_orders")).toHaveAttribute("aria-checked", "true");

    fireEvent.click(radio("full_this_week"));

    // The optimistic write DID happen — otherwise a rollback proves nothing.
    expect(radio("full_this_week")).toHaveAttribute("aria-checked", "true");
    expect(availabilityPosts()).toHaveLength(1);

    // After the POST rejects and the refetch rejects, the screen must show the
    // last server-confirmed state — not the one the server just refused.
    await waitFor(() => {
      expect(radio("full_this_week")).toHaveAttribute("aria-checked", "false");
      expect(radio("accepting_orders")).toHaveAttribute("aria-checked", "true");
    });

    // The refetch was attempted (rollback does not replace the re-sync)...
    expect(dashboardGets.count).toBe(2);
    // ...and its failure is no longer swallowed: one toast for the rejected
    // write, one for the failed re-sync.
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(2));
  });

  it("CONTROL — write fails but the refetch succeeds → the screen follows the refetched server state", async () => {
    postSpy.mockImplementation(() => Promise.reject(new Error("422")));
    refetchRef.current = () => Promise.resolve({ data: serverState() });

    render(<ProducerDashboardPage />);
    await screen.findByRole("radio", { name: /options\.full_this_week/ });
    fireEvent.click(radio("full_this_week"));
    expect(radio("full_this_week")).toHaveAttribute("aria-checked", "true");

    await waitFor(() => {
      expect(radio("full_this_week")).toHaveAttribute("aria-checked", "false");
      expect(radio("accepting_orders")).toHaveAttribute("aria-checked", "true");
    });
    expect(dashboardGets.count).toBe(2);
    // Exactly one error: the rejected write. The re-sync worked, so it adds none.
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("write succeeds → the selected state stays and nothing is refetched or rolled back", async () => {
    postSpy.mockImplementation(() => Promise.resolve({}));

    render(<ProducerDashboardPage />);
    await screen.findByRole("radio", { name: /options\.full_this_week/ });
    fireEvent.click(radio("full_this_week"));

    await waitFor(() => expect(availabilityPosts()).toHaveLength(1));
    // Give any (wrong) rollback a tick to land before asserting it did not.
    await new Promise((r) => setTimeout(r, 0));
    expect(radio("full_this_week")).toHaveAttribute("aria-checked", "true");
    expect(radio("accepting_orders")).toHaveAttribute("aria-checked", "false");
    expect(dashboardGets.count).toBe(1);
    expect(toastError).not.toHaveBeenCalled();
  });
});
