/**
 * MEH-999: vacation return-date reveal + client-side guard.
 *
 * Renders the full dashboard page (whole-component convention from
 * DashboardActivityPulse.test.jsx) and drives the availability card.
 *
 * Locked behavior under test:
 *   - selecting "on_vacation" reveals the return-date field BEFORE any POST
 *     (breaks the chicken-and-egg where the field was gated on the server
 *     already carrying state === "on_vacation").
 *   - confirming vacation with an empty date is blocked client-side: no
 *     POST to /producers/me/availability-state, inline error shown (no 422
 *     round-trip). This is the new assertion the AC requires.
 *   - confirming vacation WITH a date POSTs { state, vacation_until }.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

// Expose the post spy + a mutable dashboard payload (so one test can boot the
// producer already on vacation). vi.hoisted so the api mock factory can close
// over both despite vi.mock hoisting.
const { postSpy, dashboardRef } = vi.hoisted(() => ({
  postSpy: vi.fn(() => Promise.resolve({})),
  dashboardRef: { current: null },
}));

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) => {
      if (url === "/producers/me/dashboard") {
        return Promise.resolve({ data: dashboardRef.current });
      }
      // analytics + /producers/me → null (KPI hero + completeness stay unmounted).
      return Promise.resolve({ data: null });
    }),
    post: postSpy,
    put: vi.fn(() => Promise.resolve({})),
  },
}));

const availabilityPost = () =>
  postSpy.mock.calls.filter((c) => c[0] === "/producers/me/availability-state");

describe("Dashboard vacation date reveal (MEH-999)", () => {
  beforeEach(() => {
    postSpy.mockClear();
    mockPush.mockClear();
    dashboardRef.current = {
      producer: {
        id: 1,
        name: "עסק לדוגמה",
        status: "approved",
        availability_state: "accepting_orders",
      },
    };
  });

  it("selecting vacation reveals the return-date field before any POST", async () => {
    render(<ProducerDashboardPage />);
    // Field is hidden until vacation is selected (server state is accepting_orders).
    await screen.findByRole("radio", { name: /options\.on_vacation/ });
    expect(screen.queryByLabelText(/vacation_return_label/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /options\.on_vacation/ }));

    // Now the date field is reachable, and no POST has fired yet.
    expect(screen.getByLabelText(/vacation_return_label/)).toBeInTheDocument();
    expect(availabilityPost()).toHaveLength(0);
  });

  it("confirming vacation WITHOUT a date is blocked client-side (no POST, inline error)", async () => {
    render(<ProducerDashboardPage />);
    await screen.findByRole("radio", { name: /options\.on_vacation/ });
    fireEvent.click(screen.getByRole("radio", { name: /options\.on_vacation/ }));

    // Confirm with the date still empty.
    fireEvent.click(screen.getByRole("button", { name: /vacation_confirm/ }));

    // No 422 round-trip: the availability POST never fired.
    expect(availabilityPost()).toHaveLength(0);
    // Inline error surfaced.
    expect(screen.getByRole("alert")).toHaveTextContent(/vacation_date_required/);
  });

  it("confirming vacation WITH a date POSTs { state, vacation_until }", async () => {
    render(<ProducerDashboardPage />);
    await screen.findByRole("radio", { name: /options\.on_vacation/ });
    fireEvent.click(screen.getByRole("radio", { name: /options\.on_vacation/ }));

    fireEvent.change(screen.getByLabelText(/vacation_return_label/), {
      target: { value: "2099-01-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: /vacation_confirm/ }));

    expect(availabilityPost()).toHaveLength(1);
    expect(availabilityPost()[0][1]).toEqual({
      state: "on_vacation",
      vacation_until: "2099-01-01",
    });
  });

  it("producer already on_vacation on load: field visible without selecting; confirm POSTs the edited date", async () => {
    // Boot straight into on_vacation with an existing return date — vacationSelected
    // stays false, but the saved server state must render the mini-form immediately.
    dashboardRef.current = {
      producer: {
        id: 1,
        name: "עסק לדוגמה",
        status: "approved",
        availability_state: "on_vacation",
        vacation_until: "2099-01-01",
      },
    };
    render(<ProducerDashboardPage />);

    // Field is present on first paint — no radio click needed.
    const input = await screen.findByLabelText(/vacation_return_label/);
    expect(input).toHaveValue("2099-01-01");

    // Edit the date and confirm → POST carries the updated value.
    fireEvent.change(input, { target: { value: "2099-02-02" } });
    fireEvent.click(screen.getByRole("button", { name: /vacation_confirm/ }));

    expect(availabilityPost()).toHaveLength(1);
    expect(availabilityPost()[0][1]).toEqual({
      state: "on_vacation",
      vacation_until: "2099-02-02",
    });
  });
});
