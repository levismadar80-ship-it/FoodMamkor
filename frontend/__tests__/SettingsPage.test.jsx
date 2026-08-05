import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SettingsPage from "@/app/[locale]/settings/page";
// The mocked module — imported so the password test can assert the exact
// request PasswordChangeCard issues (vi.mock below replaces the real client).
import api from "@/lib/api";

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
// MEH-729: settings page imports a wider icon set post-redesign; map every
// icon it pulls so the partial mock doesn't throw "No <X> export".
// MEH-1700 Phase 2 — this factory now mirrors page.jsx:6-14 EXACTLY: the same
// seven names, nothing more.
//
// It had drifted in both directions while the suite was skipped, and both
// directions cost something:
//   MISSING — `CheckCircle` (rendered in the post-save status line,
//   page.jsx:394) and `HourglassSimple` (the delete grace state). A name absent
//   from this factory resolves to `undefined`, and rendering `<undefined />`
//   throws during render, which unmounts the whole tree. The symptom is a blank
//   document and a query that fails with "unable to find" — it reads exactly
//   like a missing element, and nothing points at the icon. Same failure mode
//   MEH-1698 hit with `Globe` in Header.test.jsx.
//   EXTRA — Storefront/WhatsappLogo/EnvelopeSimple/Plus/Package/Trash/Pencil/X,
//   left behind by the MEH-1355 business-tab removal. Inert, but they described
//   a page that no longer exists.
vi.mock("@phosphor-icons/react", () => ({
  UserCircle: (props) => <span data-testid="icon-user" {...props} />,
  Lock: (props) => <span data-testid="icon-lock" {...props} />,
  Eye: (props) => <span data-testid="icon-eye" {...props} />,
  EyeSlash: (props) => <span data-testid="icon-eye-slash" {...props} />,
  Camera: (props) => <span data-testid="icon-camera" {...props} />,
  CheckCircle: (props) => <span data-testid="icon-check-circle" {...props} />,
  HourglassSimple: (props) => <span data-testid="icon-hourglass" {...props} />,
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
  // MEH-1700 Phase 2: `id` is forwarded. The real component derives
  // `inputId = id || \`pw-${name}\`` and puts it on the input
  // (PasswordInput.jsx:74, :143), which is what associates /settings's
  // `<label htmlFor="pw-new">` (page.jsx:543) with a control. The mock used to
  // drop the prop, so the label pointed at nothing and any accessible-name
  // query for that field failed — a defect in the MOCK that reads exactly like
  // a missing label in the PAGE. Verified against the real component before
  // changing anything here; the page is correct.
  function MockPasswordInput({ id, name = "password", value, onChange, onValidityChange, ariaLabel }) {
    React.useEffect(() => {
      if (typeof onValidityChange === "function") {
        onValidityChange((value || "").length >= 12);
      }
    }, [value, onValidityChange]);
    return (
      <input
        id={id || `pw-${name}`}
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
// MEH-628: PasswordChangeCard calls useTranslations("auth.passwordValidation"),
// so the security-tab tests need a next-intl mock.
//
// MEH-1700 Phase 2 — the mock is NAMESPACED (`ns.key`), not bare (`key`), and
// that is load-bearing rather than stylistic. The security tab mounts three
// cards side by side and all three name their own title `heading`:
// PasswordChangeCard (`settings.security.password`, page.jsx:437),
// LogoutAllDevicesCard (`settings.security.logout_all`, :614) and
// DangerZoneCard (`settings.security.danger_zone`, :683). Under the bare form
// every one of them rendered the literal string "heading", so a query for the
// password card's title matched three elements and Testing Library threw on
// the ambiguity — a failure that reads like a missing element and is not one.
// The namespaced form is also the repo's own convention (AccountSheet.test.jsx:7-9).
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key) => (ns ? `${ns}.${key}` : key),
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

// MEH-1700 Phase 2 — the strings the namespaced mock above produces, named
// once. Each is `<namespace>.<key>` for a translator the page actually calls,
// so a namespace rename in page.jsx reds this suite instead of silently
// re-pointing it at a string nothing renders.
const NS_COMMON = "settings.common"; //            page.jsx:73
const NS_PROFILE = "settings.profile"; //          page.jsx:187
const NS_PASSWORD = "settings.security.password"; // page.jsx:437
const NS_DANGER = "settings.security.danger_zone"; // page.jsx:683
const NS_RESET = "auth.passwordRecovery.reset"; //   page.jsx:435
const TAB_PROFILE = `${NS_COMMON}.tab_profile`;
const TAB_SECURITY = `${NS_COMMON}.tab_security`;
const SAVE_CTA = `${NS_COMMON}.save_cta`;

const producerUser = {
  ...consumer,
  id: "u2",
  email: "havat@example.com",
  name: "בעלת חוות השקמה",
  role: "producer",
  producer_id: "p1",
};

/**
 * MEH-1700 Phase 2 — restored 2026-08-04, after `describe.skip` since
 * 2026-06-05 (`756a5463`, 59 days). The skip's stated reason was accurate:
 * MEH-475 moved this page to next-intl and the assertions still named the
 * pre-i18n Hebrew literals. It was "tracked as a follow-up" that never came,
 * which is the pattern MEH-1700 exists to end — a skipped suite reports
 * nothing, so nobody learns it has stopped covering anything.
 *
 * Restoring it took two things, and the second is the finding worth reading:
 *
 * 1. The namespaced translator mock above, so the three `heading` keys on the
 *    security tab stop colliding.
 * 2. TWO cases turned out to be stale SPECS, not stale labels — they asserted
 *    behaviour this page no longer has. Relabelling them would have made a
 *    green test out of a false claim:
 *      - "logout button calls logout + routes home" — REMOVED. This page has
 *        no plain logout control and never calls `logout` or `router.push("/")`.
 *        What it has is LogoutAllDevicesCard (page.jsx:611), a different
 *        action (`logoutAllDevices`) with its own confirm step. The plain
 *        logout lives on the nav surfaces and is covered there:
 *        AccountSheet.test.jsx, Header.test.jsx, BottomNav.test.jsx. Nothing
 *        was lost by deleting it here; keeping it would have meant asserting a
 *        control that does not exist on the subject under test.
 *      - "delete-account requires 'מחק' confirm" — REWRITTEN. The gate is no
 *        longer a magic word. DangerZoneCard requires the owner to type their
 *        OWN EMAIL and compares case-insensitively after trim
 *        (page.jsx:689 `emailMatch`), gating submit at :763. The old test
 *        typed into `getByPlaceholderText("מחק")`, an input that is gone.
 *
 * The other eight cases were genuine label staleness and are re-pointed at the
 * keys the page renders. No production behaviour was changed by this file.
 */
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

  // MEH-1355: the business tab was removed — producers and consumers now see
  // the same two tabs (profile, security). The status/support surface moved to
  // /producer/dashboard (ProducerStatusBanners.test.jsx).
  it("renders exactly two tabs (profile, security) for consumers and producers", () => {
    userRef.current = consumer;
    const { rerender } = render(<SettingsPage />);
    expect(screen.getByRole("tab", { name: TAB_PROFILE })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: TAB_SECURITY })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(2);

    userRef.current = producerUser;
    rerender(<SettingsPage />);
    // The point of the case: a producer sees the SAME two tabs, so assert the
    // full set rather than only the absence of the retired "העסק שלי" one. An
    // absence assertion alone would also pass if the tab bar rendered nothing.
    expect(screen.getAllByRole("tab").map((el) => el.textContent)).toEqual([
      TAB_PROFILE,
      TAB_SECURITY,
    ]);
  });

  it("defaults to the profile tab", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("tab", { name: TAB_PROFILE })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: TAB_SECURITY })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByLabelText(`${NS_PROFILE}.field_name_label *`)).toBeInTheDocument();
  });

  it("respects ?tab=security in the URL", () => {
    paramsRef.current = new URLSearchParams("tab=security");
    render(<SettingsPage />);
    expect(screen.getByRole("tab", { name: TAB_SECURITY })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // Must-not-fire half: a tab bar that marked everything selected would pass
    // the line above. This is what makes the pair a test rather than a probe.
    expect(screen.getByRole("tab", { name: TAB_PROFILE })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  // ----- Profile tab -----

  it("profile: save is disabled until form is dirty + valid", () => {
    render(<SettingsPage />);
    const save = screen.getByRole("button", { name: SAVE_CTA });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(`${NS_PROFILE}.field_name_label *`), {
      target: { value: "דנה שלום" },
    });
    expect(save).not.toBeDisabled();
  });

  it("profile: save calls updateProfile with only changed fields", async () => {
    render(<SettingsPage />);
    fireEvent.change(screen.getByLabelText(`${NS_PROFILE}.field_name_label *`), {
      target: { value: "דנה שלום" },
    });
    fireEvent.click(screen.getByRole("button", { name: SAVE_CTA }));
    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({ name: "דנה שלום" });
    });
  });

  // ----- Security tab -----

  // This pair is deliberately symmetric and neither half stands alone. A card
  // that ALWAYS hid the password form would pass the first and fail the second;
  // one that always showed it fails the first. Only both together pin the
  // `isOAuth` branch (page.jsx:429-430, :494).
  it("security: password card is HIDDEN for OAuth users", () => {
    userRef.current = oauthUser;
    paramsRef.current = new URLSearchParams("tab=security");
    render(<SettingsPage />);
    expect(screen.queryByText(`${NS_PASSWORD}.heading`)).not.toBeInTheDocument();
    expect(screen.getByText(`${NS_PASSWORD}.oauth_heading`)).toBeInTheDocument();
  });

  it("security: password card is SHOWN for password users", () => {
    paramsRef.current = new URLSearchParams("tab=security");
    render(<SettingsPage />);
    expect(screen.getByText(`${NS_PASSWORD}.heading`)).toBeInTheDocument();
    expect(screen.queryByText(`${NS_PASSWORD}.oauth_heading`)).not.toBeInTheDocument();
  });

  // MEH-1700 Phase 2 — the THIRD stale spec, and the least visible of them.
  // This case asserted `changePassword(current, next)` from auth-context.
  // PasswordChangeCard does not call it and does not even destructure it
  // (page.jsx:454-461): it PATCHes /users/me/password directly, with snake_case
  // keys. Asserting the auth-context helper here would have been green only
  // because the helper still exists — it has zero callers in the whole app
  // (`lib/auth-context.js:185`, exported at :221), so the old assertion could
  // never have failed for the right reason. Assert the request the page
  // actually issues, including the exact payload shape the backend reads.
  it("security: change-password PATCHes /users/me/password and clears the form", async () => {
    paramsRef.current = new URLSearchParams("tab=security");
    render(<SettingsPage />);
    fireEvent.change(screen.getByLabelText(`${NS_PASSWORD}.current_label`), {
      target: { value: "old-pass" },
    });
    // The new-password field is a PasswordInput whose visible <label> carries a
    // trailing " *" while its inner aria-label does not (page.jsx:543, :550) —
    // the exact-match query below resolves the labelled control unambiguously.
    fireEvent.change(screen.getByLabelText(`${NS_RESET}.password_aria *`), {
      target: { value: "new-pass-123" },
    });
    fireEvent.change(screen.getByLabelText(`${NS_PASSWORD}.confirm_label`), {
      target: { value: "new-pass-123" },
    });
    // The submit gate (page.jsx:452 `canSave`) is the thing that decides
    // whether the click below can do anything at all — assert it flipped, so a
    // regression there reports as "the gate stayed shut" rather than as the
    // much vaguer "changePassword was never called".
    const submit = screen.getByRole("button", { name: `${NS_PASSWORD}.submit_cta` });
    expect(submit).not.toBeDisabled();

    fireEvent.click(submit);
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/users/me/password", {
        current_password: "old-pass",
        new_password: "new-pass-123",
      }),
    );

    // "…and clears the form" — the half the old test named but never asserted.
    await waitFor(() => expect(screen.getByLabelText(`${NS_PASSWORD}.current_label`)).toHaveValue(""));
    expect(screen.getByLabelText(`${NS_RESET}.password_aria *`)).toHaveValue("");
    expect(screen.getByLabelText(`${NS_PASSWORD}.confirm_label`)).toHaveValue("");
  });

  // NOTE — the "logout button calls logout + routes home" case that sat here
  // was REMOVED, not relabelled. See the block comment above `describe`: this
  // page has no plain logout control, so the case asserted a control that does
  // not exist on its own subject. The behaviour is covered where it lives —
  // AccountSheet.test.jsx / Header.test.jsx / BottomNav.test.jsx.

  it("security: delete-account stays gated until the owner's own email is typed", async () => {
    paramsRef.current = new URLSearchParams("tab=security");
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: `${NS_DANGER}.delete_cta` }));

    const confirmBtn = screen.getByRole("button", { name: `${NS_DANGER}.submit_cta` });
    const emailField = screen.getByLabelText(`${NS_DANGER}.confirm_email_label`);
    expect(confirmBtn).toBeDisabled();

    // MUST-NOT-FIRE. The old test went straight from empty to the correct
    // value, so an implementation that enabled submit on ANY non-empty input
    // would have passed it — and that is the whole failure this gate exists to
    // prevent. A wrong address must leave the button disabled.
    fireEvent.change(emailField, { target: { value: "someone-else@example.com" } });
    expect(confirmBtn).toBeDisabled();

    // Case-insensitive, trimmed (page.jsx:689) — assert the real contract, not
    // a byte-identical echo, or a future `.trim()` removal would go unnoticed.
    fireEvent.change(emailField, { target: { value: `  ${consumer.email.toUpperCase()}  ` } });
    expect(confirmBtn).not.toBeDisabled();

    fireEvent.click(confirmBtn);
    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalled());
  });

  // MEH-1355: the "business" tab was removed — its status/support surface is
  // now the canonical /producer/dashboard (covered by ProducerStatusBanners.test.jsx).
  // The old `business:` test (stats grid, ?tab=business) was deleted with it.
});
