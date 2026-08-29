import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import SettingsPage from "@/app/[locale]/settings/page";

// MEH-2199 chunk 3 — /settings declares role="tablist" + role="tab" +
// aria-selected on its profile/security bar and, until this ticket, carried no
// arrow-key layer: both tabs were separate tab stops and the arrows did nothing.
//
// Same shape as __tests__/EventsTabsKeyboard.test.jsx, now over the SHARED
// hooks/useTabsKeyboard.js both surfaces consume. The direction assertions name
// their target by wire value rather than "the other tab", so an LTR arrow
// mapping — the regression this file exists to prevent — fails them.
//
// Mock scaffolding mirrors __tests__/SettingsPage.test.jsx (same page, same
// dependency surface).

const mockPush = vi.fn();
const mockReplace = vi.fn();
const paramsRef = { current: new URLSearchParams("") };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => paramsRef.current,
}));

const userRef = { current: null };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: userRef.current,
    loading: false,
    updateProfile: vi.fn().mockResolvedValue({}),
    changePassword: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    deleteAccount: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({})),
    delete: vi.fn(() => Promise.resolve({})),
  },
}));

// Mirrors page.jsx's icon imports exactly. A name missing here resolves to
// `undefined`, `<undefined />` throws during render, the tree unmounts, and the
// symptom reads as a missing element rather than a missing mock (MEH-1700).
vi.mock("@phosphor-icons/react", () => ({
  UserCircle: (props) => <span data-testid="icon-user" {...props} />,
  Lock: (props) => <span data-testid="icon-lock" {...props} />,
  Eye: (props) => <span data-testid="icon-eye" {...props} />,
  EyeSlash: (props) => <span data-testid="icon-eye-slash" {...props} />,
  Camera: (props) => <span data-testid="icon-camera" {...props} />,
  CheckCircle: (props) => <span data-testid="icon-check-circle" {...props} />,
  HourglassSimple: (props) => <span data-testid="icon-hourglass" {...props} />,
}));
vi.mock("@/components/PasswordStrength", () => ({ default: () => null }));
vi.mock("@/components/PasswordInput", () => ({
  default: ({ id, value, onChange }) => <input id={id} value={value ?? ""} onChange={onChange} />,
}));
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (k) => (ns ? `${ns}.${k}` : k),
  useLocale: () => "he",
}));

const tablist = () => screen.getByRole("tablist");
const tabs = () => within(tablist()).getAllByRole("tab");
const tabIndexes = () => tabs().map((el) => el.getAttribute("tabindex"));
const selectedStates = () => tabs().map((el) => el.getAttribute("aria-selected"));

beforeEach(() => {
  userRef.current = { id: "u1", name: "סמדר", email: "s@example.com", city: "חיפה", phone: "" };
  paramsRef.current = new URLSearchParams("");
  window.history.replaceState(null, "", "/he/settings");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SettingsPage — profile/security tablist keyboard (MEH-2199)", () => {
  it("exposes exactly one tab stop, on the selected tab", () => {
    render(<SettingsPage />);
    expect(tabIndexes()).toEqual(["0", "-1"]);
    // Numeric, not a spot check: N-1 tabs must be out of the tab order.
    expect(tabIndexes().filter((v) => v === "0")).toHaveLength(1);
    expect(selectedStates()).toEqual(["true", "false"]);
  });

  it("ArrowLeft moves to the NEXT tab and activates it (RTL contract)", async () => {
    render(<SettingsPage />);
    const [profile, security] = tabs();
    profile.focus();
    fireEvent.keyDown(profile, { key: "ArrowLeft" });

    expect(document.activeElement).toBe(security);
    await waitFor(() => expect(selectedStates()).toEqual(["false", "true"]));
    expect(tabIndexes()).toEqual(["-1", "0"]);
  });

  it("ArrowRight moves to the PREVIOUS tab, wrapping (RTL contract)", async () => {
    render(<SettingsPage />);
    const [profile, security] = tabs();
    profile.focus();
    fireEvent.keyDown(profile, { key: "ArrowRight" });

    expect(document.activeElement).toBe(security);
    await waitFor(() => expect(selectedStates()).toEqual(["false", "true"]));
  });

  it("End selects the last tab and Home the first", async () => {
    render(<SettingsPage />);
    const [profile, security] = tabs();

    profile.focus();
    fireEvent.keyDown(profile, { key: "End" });
    expect(document.activeElement).toBe(security);
    await waitFor(() => expect(selectedStates()).toEqual(["false", "true"]));

    fireEvent.keyDown(security, { key: "Home" });
    expect(document.activeElement).toBe(profile);
    await waitFor(() => expect(selectedStates()).toEqual(["true", "false"]));
  });

  it("switching by keyboard renders the other tab's panel, not just the ARIA state", async () => {
    render(<SettingsPage />);
    const [profile, security] = tabs();
    // aria-selected is a CLAIM; the rendered panel is the outcome. Without this
    // case every assertion above could hold on a page whose panels never
    // changed at all — the exact shape of a test that reads as coverage while
    // covering nothing. The security panel owns the password form; the profile
    // panel does not, so the heading discriminates in both directions.
    expect(screen.queryByText("settings.security.password.heading")).toBeNull();
    profile.focus();
    fireEvent.keyDown(profile, { key: "ArrowLeft" });
    await waitFor(() => expect(security).toHaveAttribute("aria-selected", "true"));
    expect(screen.getByText("settings.security.password.heading")).toBeInTheDocument();
  });

  it("leaves an unhandled key alone — no preventDefault, no selection change", () => {
    render(<SettingsPage />);
    const [profile] = tabs();
    profile.focus();
    // fireEvent returns false when preventDefault was called.
    expect(fireEvent.keyDown(profile, { key: "a" })).toBe(true);
    expect(selectedStates()).toEqual(["true", "false"]);
  });

  it("every tab carries the wire value the shared handler reads", () => {
    render(<SettingsPage />);
    expect(tabs().map((el) => el.dataset.tabValue)).toEqual(["profile", "security"]);
  });
});
