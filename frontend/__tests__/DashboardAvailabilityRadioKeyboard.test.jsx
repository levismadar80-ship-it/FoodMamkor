/**
 * MEH-2199 chunk 4 — the dashboard availability card declares role="radiogroup"
 * + role="radio" + aria-checked, and until this ticket carried no arrow keys.
 * Per the W3C APG Radio Group pattern the arrows must move focus AND select,
 * and the group must be a single tab stop.
 *
 * Two properties this file exists to pin, beyond "the arrows work":
 *
 *   1. VACATION KEEPS ITS REVEAL-THEN-CONFIRM SHAPE. Arrowing onto vacation
 *      must reveal the return-date field and POST NOTHING, exactly as clicking
 *      it does (MEH-999). A keyboard path that fired the POST early would be a
 *      behaviour change smuggled in under an a11y ticket.
 *   2. THE GROUP IS INERT PRE-APPROVAL. The radios are already `disabled` when
 *      the business is not approved (MEH-964 1D); the keyboard layer must not
 *      route around that.
 *
 * Arrow direction follows the house RTL contract — ArrowLeft = next,
 * ArrowRight = prev (Lightbox.jsx:58) — so the assertions name their target by
 * option value rather than "the next one", and an LTR mapping fails them.
 *
 * Scaffolding mirrors __tests__/DashboardVacationDateReveal.test.jsx.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
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

// The four options in DOM order — the SoT for what "next" and "previous" mean.
const ORDER = ["accepting_orders", "available_today", "full_this_week", "on_vacation"];

const group = () => screen.getByRole("radiogroup");
const radios = () => within(group()).getAllByRole("radio");
const radio = (value) =>
  radios().find((el) => el.getAttribute("data-radio-value") === value);
const tabIndexes = () => radios().map((el) => el.getAttribute("tabindex"));
const checkedStates = () => radios().map((el) => el.getAttribute("aria-checked"));
const focusedValue = () => document.activeElement?.getAttribute("data-radio-value") ?? null;

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

describe("Dashboard availability radiogroup — keyboard (MEH-2199)", () => {
  it("is a single tab stop, on the checked radio", async () => {
    render(<ProducerDashboardPage />);
    await screen.findByRole("radiogroup");
    expect(radios()).toHaveLength(ORDER.length);
    // Numeric, per the APG pattern: exactly one tab stop, N-1 removed.
    expect(tabIndexes().filter((v) => v === "0")).toHaveLength(1);
    expect(tabIndexes()).toEqual(["0", "-1", "-1", "-1"]);
    expect(checkedStates()).toEqual(["true", "false", "false", "false"]);
  });

  it("ArrowLeft moves to the NEXT radio and SELECTS it (RTL contract)", async () => {
    render(<ProducerDashboardPage />);
    await screen.findByRole("radiogroup");
    radio("accepting_orders").focus();
    fireEvent.keyDown(radio("accepting_orders"), { key: "ArrowLeft" });

    expect(focusedValue()).toBe("available_today");
    expect(checkedStates()).toEqual(["false", "true", "false", "false"]);
    expect(tabIndexes()).toEqual(["-1", "0", "-1", "-1"]);
    // APG radio groups select on move — the POST is the proof it really selected
    // rather than only repainting.
    expect(availabilityPost()).toHaveLength(1);
    expect(availabilityPost()[0][1]).toMatchObject({ state: "available_today" });
  });

  it("ArrowRight moves to the PREVIOUS radio, wrapping to the last (RTL contract)", async () => {
    render(<ProducerDashboardPage />);
    await screen.findByRole("radiogroup");
    radio("accepting_orders").focus();
    fireEvent.keyDown(radio("accepting_orders"), { key: "ArrowRight" });
    // Wraps backwards onto on_vacation — which is the reveal case, asserted below.
    expect(focusedValue()).toBe("on_vacation");
  });

  it("ArrowDown is next and ArrowUp is previous (vertical axis is not mirrored)", async () => {
    render(<ProducerDashboardPage />);
    await screen.findByRole("radiogroup");
    radio("accepting_orders").focus();
    fireEvent.keyDown(radio("accepting_orders"), { key: "ArrowDown" });
    expect(focusedValue()).toBe("available_today");
    fireEvent.keyDown(radio("available_today"), { key: "ArrowUp" });
    expect(focusedValue()).toBe("accepting_orders");
  });

  it("arrowing onto vacation REVEALS the date field and posts nothing (MEH-999 shape kept)", async () => {
    render(<ProducerDashboardPage />);
    await screen.findByRole("radiogroup");
    expect(screen.queryByLabelText(/vacation_return_label/)).not.toBeInTheDocument();

    radio("accepting_orders").focus();
    fireEvent.keyDown(radio("accepting_orders"), { key: "ArrowRight" }); // wraps to on_vacation

    expect(focusedValue()).toBe("on_vacation");
    expect(screen.getByLabelText(/vacation_return_label/)).toBeInTheDocument();
    // The whole point: reveal-then-confirm survives the keyboard path.
    expect(availabilityPost()).toHaveLength(0);
  });

  it("leaves an unhandled key alone — no preventDefault, no selection change", async () => {
    render(<ProducerDashboardPage />);
    await screen.findByRole("radiogroup");
    // Located POSITIONALLY, not by the attribute this ticket introduces: a
    // control has to be able to run against the old markup too, or it is not a
    // control. Same reason the disabled case below uses radios()[0].
    radios()[0].focus();
    // fireEvent returns false when preventDefault was called.
    expect(fireEvent.keyDown(radios()[0], { key: "a" })).toBe(true);
    expect(checkedStates()).toEqual(["true", "false", "false", "false"]);
    expect(availabilityPost()).toHaveLength(0);
  });

  it("every radio carries the value the handler reads", async () => {
    render(<ProducerDashboardPage />);
    await screen.findByRole("radiogroup");
    expect(radios().map((el) => el.getAttribute("data-radio-value"))).toEqual(ORDER);
  });
});

describe("Dashboard availability radiogroup — inert before approval (MEH-2199 × MEH-964)", () => {
  it("does not move or select while the radios are disabled", async () => {
    cleanup();
    boot({ status: "pending" });
    render(<ProducerDashboardPage />);
    await screen.findByRole("radiogroup");

    // Precondition, asserted rather than assumed: if these were NOT disabled the
    // inertness assertion below would be about a different world entirely.
    expect(radios().every((el) => el.hasAttribute("disabled"))).toBe(true);
    const before = checkedStates();

    fireEvent.keyDown(radios()[0], { key: "ArrowLeft" });

    expect(checkedStates()).toEqual(before);
    expect(availabilityPost()).toHaveLength(0);
    expect(screen.queryByLabelText(/vacation_return_label/)).not.toBeInTheDocument();
  });
});
