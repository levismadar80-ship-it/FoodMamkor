/**
 * MEH-2759 (MEH-2757 chunk 2) — the dashboard availability card is ONE
 * «בהפסקה» switch. It replaced four radios (פתוח להזמנות / זמין היום / עמוס
 * השבוע / בהפסקה) and their MEH-2199 arrow-key layer; this file replaces that
 * layer's test.
 *
 * Cells pinned (state × action):
 *   - accepting_orders → OFF; click reveals the date, POSTs nothing (MEH-999).
 *   - revealed-but-unsaved → click again hides the date, POSTs nothing.
 *   - on_vacation saved → ON; click POSTs accepting_orders.
 *   - legacy available_today / full_this_week → OFF (the server's read-only
 *     values never light anything, and no radio for them exists).
 *   - not approved → disabled, inert (MEH-964 1D).
 *
 * Scaffolding mirrors __tests__/DashboardVacationDateReveal.test.jsx.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProducerDashboardPage from "@/app/[locale]/producer/dashboard/page";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: 1, name: "דנה", role: "producer" }, loading: false }),
}));

vi.mock("next-intl", () => {
  const t = (key) => key;
  t.rich = (key) => key;
  return { useLocale: () => "he", useTranslations: () => t };
});

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
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
// MEH-1687 D: the holiday hint renders HolidayIcon (Phosphor names this file's icon mock lacks).
vi.mock("@/components/HolidayIcon", () => ({ default: () => null }));

const { postSpy, dashboardRef } = vi.hoisted(() => ({
  postSpy: vi.fn(() => Promise.resolve({})),
  dashboardRef: { current: null },
}));

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) =>
      url === "/producers/me/dashboard"
        ? Promise.resolve({ data: dashboardRef.current })
        : Promise.resolve({ data: null }),
    ),
    post: postSpy,
    put: vi.fn(() => Promise.resolve({})),
  },
}));

const availabilityPost = () =>
  postSpy.mock.calls.filter((c) => c[0] === "/producers/me/availability-state");

const pauseSwitch = () => screen.getByRole("switch", { name: /options\.on_vacation/ });
const dateField = () => screen.queryByLabelText(/vacation_return_label/);

const boot = (producer) => {
  dashboardRef.current = {
    producer: { id: 1, name: "עסק לדוגמה", status: "approved", availability_state: "accepting_orders", ...producer },
  };
};

beforeEach(() => {
  postSpy.mockClear();
  mockPush.mockClear();
  boot({});
});

describe("Dashboard pause switch (MEH-2759)", () => {
  it("renders one switch and no radios — the four-option group is gone", async () => {
    render(<ProducerDashboardPage />);
    await screen.findByRole("switch", { name: /options\.on_vacation/ });
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getAllByRole("switch")).toHaveLength(1);
  });

  it("accepting_orders → OFF; click reveals the return date and posts nothing", async () => {
    render(<ProducerDashboardPage />);
    await screen.findByRole("switch", { name: /options\.on_vacation/ });
    expect(pauseSwitch()).toHaveAttribute("aria-checked", "false");
    expect(dateField()).not.toBeInTheDocument();

    fireEvent.click(pauseSwitch());

    expect(pauseSwitch()).toHaveAttribute("aria-checked", "true");
    expect(dateField()).toBeInTheDocument();
    expect(availabilityPost()).toHaveLength(0);
  });

  it("revealed but never saved → a second click hides the date and still posts nothing", async () => {
    render(<ProducerDashboardPage />);
    await screen.findByRole("switch", { name: /options\.on_vacation/ });
    fireEvent.click(pauseSwitch());
    fireEvent.click(pauseSwitch());

    expect(pauseSwitch()).toHaveAttribute("aria-checked", "false");
    expect(dateField()).not.toBeInTheDocument();
    expect(availabilityPost()).toHaveLength(0);
  });

  it("saved on_vacation → ON; click resumes with accepting_orders", async () => {
    boot({ availability_state: "on_vacation", vacation_until: "2099-01-01" });
    render(<ProducerDashboardPage />);
    await screen.findByRole("switch", { name: /options\.on_vacation/ });
    expect(pauseSwitch()).toHaveAttribute("aria-checked", "true");

    fireEvent.click(pauseSwitch());

    expect(availabilityPost()).toHaveLength(1);
    expect(availabilityPost()[0][1]).toEqual({ state: "accepting_orders" });
  });

  it.each(["available_today", "full_this_week"])(
    "legacy %s → OFF, and pausing still works from it",
    async (state) => {
      boot({ availability_state: state });
      render(<ProducerDashboardPage />);
      await screen.findByRole("switch", { name: /options\.on_vacation/ });
      expect(pauseSwitch()).toHaveAttribute("aria-checked", "false");
      fireEvent.click(pauseSwitch());
      expect(dateField()).toBeInTheDocument();
      expect(availabilityPost()).toHaveLength(0);
    },
  );

  it("not approved → disabled, inert (MEH-964 1D)", async () => {
    boot({ status: "pending" });
    render(<ProducerDashboardPage />);
    await screen.findByRole("switch", { name: /options\.on_vacation/ });
    expect(pauseSwitch()).toBeDisabled();
    expect(pauseSwitch()).toHaveAttribute("aria-checked", "false");
    fireEvent.click(pauseSwitch());
    expect(dateField()).not.toBeInTheDocument();
    expect(availabilityPost()).toHaveLength(0);
  });
});
