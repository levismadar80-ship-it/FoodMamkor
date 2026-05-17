import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SettingsPage from "@/app/[locale]/settings/page";

// Mock router + search params
const mockPush = vi.fn();
const mockReplace = vi.fn();
const paramsRef = { current: new URLSearchParams("") };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => paramsRef.current,
}));

// Mock auth context
const userRef = { current: null };
const mockUpdateProfile = vi.fn().mockResolvedValue({});
const mockChangePassword = vi.fn().mockResolvedValue(undefined);
const mockLogout = vi.fn();
const mockDeleteAccount = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: userRef.current,
    loading: false,
    updateProfile: mockUpdateProfile,
    changePassword: mockChangePassword,
    logout: mockLogout,
    deleteAccount: mockDeleteAccount,
  }),
}));

// Mock api
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() =>
      Promise.resolve({
        data: {
          producer: {
            name: "חוות השקמה",
            status: "approved",
            // MEH-291 Phase 3 — new field; legacy kept during 7-day overlap.
            availability_state: "full_this_week",
            availability_status: "full",
          },
          favorites_count: 7,
          views_30d: 42,
          whatsapp_clicks_week: 3,
        },
      }),
    ),
    patch: vi.fn(() => Promise.resolve({})),
    delete: vi.fn(() => Promise.resolve({})),
  },
}));

// Mock Phosphor icons
vi.mock("@phosphor-icons/react", () => ({
  UserCircle: (props) => <span data-testid="icon-user" {...props} />,
  Lock: (props) => <span data-testid="icon-lock" {...props} />,
  Storefront: (props) => <span data-testid="icon-store" {...props} />,
}));

// Mock PasswordStrength so we don't pull its CSS bits.
// Settings no longer imports it post-MEH-306, but keeping the mock in
// case other parts of the page tree pick it up later.
vi.mock("@/components/PasswordStrength", () => ({
  default: () => <div data-testid="password-strength" />,
}));

// MEH-306: PasswordInput now owns /settings's new-password input. The
// real component fires a debounced /auth/check-password call on every
// keystroke; mocking it here keeps the unit test deterministic and
// removes the api.post requirement. The mock fires onValidityChange
// from a useEffect on `value` so the parent's submit-gate behaves
// like the real component (valid when value is non-empty).
//
// Named `MockPasswordInput` (capital M) so eslint-react-hooks
// recognises it as a component when it sees the useEffect call —
// rules-of-hooks requires a component or hook name.
vi.mock("@/components/PasswordInput", async () => {
  const React = await import("react");
  function MockPasswordInput({ value, onChange, onValidityChange, ariaLabel }) {
    React.useEffect(() => {
      if (typeof onValidityChange === "function") {
        onValidityChange((value || "").length >= 12);
      }
    }, [value, onValidityChange]);
    return (
      <input
        aria-label={ariaLabel}
        value={value}
        onChange={onChange}
        data-testid="password-input-mock"
      />
    );
  }
  return { default: MockPasswordInput };
});

// Mock validators — simple email check + the constant settings imports
// transitively through PasswordInput in non-mocked paths.
vi.mock("@/lib/validators", () => ({
  validateEmail: (e) => typeof e === "string" && /.+@.+\..+/.test(e),
  PASSWORD_MIN_LENGTH: 12,
  passwordRules: [
    { id: "len", label: "לפחות 12 תווים", check: (p) => (p || "").length >= 12 },
  ],
  passwordValid: (p) => (p || "").length >= 12,
}));

// Mock passwordMessages — settings imports firstFailureMessage in its
// catch block. The unit tests don't drive 422 paths so a no-op mock
// is sufficient.
// MEH-628: PasswordChangeCard now calls useTranslations("auth.passwordValidation"),
// so the security-tab tests need a next-intl mock that resolves to the bare key
// (matches Header.test.jsx / ProducerCard.test.jsx / JwtExpiryReauth.test.jsx pattern).
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
}));

// MEH-628: lib now requires a translator `t` as second arg; mock accepts
// (failures, t) / (key, t) and returns a passthrough string regardless.
vi.mock("@/lib/passwordMessages", () => ({
  firstFailureMessage: (_failures, _t) => "test-failure",
  failureMessage: (_key, _t) => "test-failure",
}));

const consumer = {
  id: "u1",
  email: "dana@example.com",
  name: "דנה כהן",
  role: "consumer",
  producer_id: null,
  is_oauth: false,
};

const oauthUser = { ...consumer, is_oauth: true, google_id: "g1" };

const producerUser = {
  ...consumer,
  id: "u2",
  email: "havat@example.com",
  name: "בעלת חוות השקמה",
  role: "producer",
  producer_id: "p1",
};

describe("SettingsPage", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockUpdateProfile.mockClear();
    mockChangePassword.mockClear();
    mockLogout.mockClear();
    mockDeleteAccount.mockClear();
    paramsRef.current = new URLSearchParams("");
    userRef.current = consumer;
  });

  it("renders the three tabs for producers and only two for consumers", () => {
    userRef.current = consumer;
    const { rerender } = render(<SettingsPage />);
    expect(screen.getByRole("tab", { name: /פרופיל/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /אבטחה/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /העסק שלי/ })).not.toBeInTheDocument();

    userRef.current = producerUser;
    rerender(<SettingsPage />);
    expect(screen.getByRole("tab", { name: /העסק שלי/ })).toBeInTheDocument();
  });

  it("defaults to the profile tab", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("tab", { name: /פרופיל/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("שם מלא *")).toBeInTheDocument();
  });

  it("respects ?tab=security in the URL", () => {
    paramsRef.current = new URLSearchParams("tab=security");
    render(<SettingsPage />);
    expect(screen.getByRole("tab", { name: /אבטחה/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  // ----- Profile tab -----

  it("profile: save is disabled until form is dirty + valid", () => {
    render(<SettingsPage />);
    const save = screen.getByRole("button", { name: /שמרי/ });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("שם מלא *"), {
      target: { value: "דנה שלום" },
    });
    expect(save).not.toBeDisabled();
  });

  it("profile: save calls updateProfile with only changed fields", async () => {
    render(<SettingsPage />);
    fireEvent.change(screen.getByLabelText("שם מלא *"), {
      target: { value: "דנה שלום" },
    });
    fireEvent.click(screen.getByRole("button", { name: /שמרי/ }));
    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({ name: "דנה שלום" });
    });
  });

  // ----- Security tab -----

  it("security: password card is HIDDEN for OAuth users", () => {
    userRef.current = oauthUser;
    paramsRef.current = new URLSearchParams("tab=security");
    render(<SettingsPage />);
    expect(screen.queryByText("שינוי סיסמה")).not.toBeInTheDocument();
    expect(screen.getByText(/OAuth/)).toBeInTheDocument();
  });

  it("security: password card is SHOWN for password users", () => {
    paramsRef.current = new URLSearchParams("tab=security");
    render(<SettingsPage />);
    expect(screen.getByText("שינוי סיסמה")).toBeInTheDocument();
  });

  it("security: change-password calls changePassword and clears the form", async () => {
    paramsRef.current = new URLSearchParams("tab=security");
    render(<SettingsPage />);
    fireEvent.change(screen.getByLabelText("סיסמה נוכחית"), {
      target: { value: "old-pass" },
    });
    fireEvent.change(screen.getByLabelText("סיסמה חדשה"), {
      target: { value: "new-pass-123" },
    });
    fireEvent.change(screen.getByLabelText("אישור סיסמה חדשה"), {
      target: { value: "new-pass-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /עדכני סיסמה/ }));
    await waitFor(() =>
      expect(mockChangePassword).toHaveBeenCalledWith("old-pass", "new-pass-123"),
    );
  });

  it("security: logout button calls logout + routes home", () => {
    paramsRef.current = new URLSearchParams("tab=security");
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "התנתקי" }));
    expect(mockLogout).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("security: delete-account requires 'מחק' confirm", async () => {
    paramsRef.current = new URLSearchParams("tab=security");
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "מחקי חשבון" }));
    const confirmBtn = screen.getByRole("button", { name: /מחקי לצמיתות/ });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("מחק"), {
      target: { value: "מחק" },
    });
    expect(confirmBtn).not.toBeDisabled();

    fireEvent.click(confirmBtn);
    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalled());
  });

  // ----- Business tab -----

  it("business: renders status + availability + stat cards for producers", async () => {
    userRef.current = producerUser;
    paramsRef.current = new URLSearchParams("tab=business");
    render(<SettingsPage />);
    await waitFor(() => screen.getByText("חוות השקמה"));
    expect(screen.getByText(/סטטוס: מאושר/)).toBeInTheDocument();
    expect(screen.getByText(/זמינות: עמוס כרגע/)).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument(); // favorites
    expect(screen.getByText("42")).toBeInTheDocument(); // views
    expect(screen.getByText("3")).toBeInTheDocument(); // whatsapp
    expect(screen.getByRole("link", { name: /ניהול מלא/ })).toHaveAttribute(
      "href",
      "/producer/dashboard",
    );
  });
});
