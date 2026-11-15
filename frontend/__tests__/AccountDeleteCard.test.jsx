// MEH-3248 (B3 + B7 + D15) — the account-deletion card's states.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const userRef = { current: null };
const mockDelete = vi.fn();
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: userRef.current, deleteAccount: mockDelete }),
}));

const apiGet = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => apiGet(...a) } }));

vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "cid" } }));
const googleCallbacks = [];
vi.mock("@/lib/use-google-sign-in", () => ({
  gsiLang: () => "he",
  useGoogleSignIn: (_id, cb) => googleCallbacks.push(cb),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Key + params, so the test reads which string and which {name}/{provider}.
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key, params) =>
    params ? `${ns}.${key}|${JSON.stringify(params)}` : `${ns}.${key}`,
}));

const { default: AccountDeleteCard } = await import("@/components/AccountDeleteCard");

const NS = "settings.security.danger_zone";
const base = {
  id: "u1",
  email: "dana@example.com",
  role: "consumer",
  producer_id: null,
  is_oauth: false,
  oauth_provider: null,
  is_super_admin: false,
};

function openCard() {
  fireEvent.click(screen.getByRole("button", { name: `${NS}.delete_cta` }));
}
function typeEmail(value = base.email) {
  fireEvent.change(document.getElementById("danger-email"), { target: { value } });
}

beforeEach(() => {
  vi.clearAllMocks();
  googleCallbacks.length = 0;
  mockDelete.mockResolvedValue(undefined);
});

describe("admins get an explanation, never the form (B7)", () => {
  it("an admin reads who can remove the account", () => {
    userRef.current = { ...base, role: "admin" };
    render(<AccountDeleteCard />);
    expect(screen.getByText(`${NS}.admin_blocked`)).toBeTruthy();
    expect(screen.queryByRole("button", { name: `${NS}.delete_cta` })).toBeNull();
  });

  it("the super-admin reads that the account cannot be deleted at all", () => {
    userRef.current = { ...base, role: "admin", is_super_admin: true };
    render(<AccountDeleteCard />);
    expect(screen.getByText(`${NS}.super_admin_blocked`)).toBeTruthy();
    expect(screen.queryByText(`${NS}.admin_blocked`)).toBeNull();
  });
});

describe("a password account sends its password (D15)", () => {
  it("closed: only the button", () => {
    userRef.current = base;
    render(<AccountDeleteCard />);
    expect(document.getElementById("danger-password")).toBeNull();
  });

  it("open: email + password arm the submit, and the body carries the password", async () => {
    userRef.current = base;
    render(<AccountDeleteCard />);
    openCard();
    const submit = screen.getByRole("button", { name: `${NS}.submit_cta` });
    typeEmail();
    expect(submit).toBeDisabled();
    fireEvent.change(document.getElementById("danger-password"), { target: { value: "example-pw-123" } });
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith({ password: "example-pw-123" }));
  });

  it("a server refusal shows its message and keeps the form", async () => {
    userRef.current = base;
    mockDelete.mockRejectedValue({ response: { data: { detail: "הסיסמה הנוכחית שגויה" } } });
    render(<AccountDeleteCard />);
    openCard();
    typeEmail();
    fireEvent.change(document.getElementById("danger-password"), { target: { value: "wrong-1" } });
    fireEvent.click(screen.getByRole("button", { name: `${NS}.submit_cta` }));
    expect(await screen.findByText("הסיסמה הנוכחית שגויה")).toBeTruthy();
    expect(document.getElementById("danger-email")).toBeTruthy();
  });
});

describe("a Google-only account signs in again instead (D15)", () => {
  it("no password field; the prompt appears only once the email matches", () => {
    userRef.current = { ...base, is_oauth: true, oauth_provider: "google" };
    render(<AccountDeleteCard />);
    openCard();
    expect(document.getElementById("danger-password")).toBeNull();
    expect(screen.queryByTestId("delete-reauth")).toBeNull();
    typeEmail();
    expect(screen.getByText(`${NS}.reauth_prompt|{"provider":"Google"}`)).toBeTruthy();
    expect(screen.getByTestId("delete-reauth-google")).toBeTruthy();
  });

  it("the Google credential is what gets sent", async () => {
    userRef.current = { ...base, is_oauth: true, oauth_provider: "google" };
    render(<AccountDeleteCard />);
    openCard();
    typeEmail();
    googleCallbacks.at(-1)({ credential: "fresh-id-token" });
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith({ id_token: "fresh-id-token" }));
  });
});

describe("a business owner is told what goes with the account", () => {
  it("names her business, offers «בהפסקה», and links to the switch", async () => {
    userRef.current = { ...base, producer_id: "p1" };
    apiGet.mockResolvedValue({ data: { name: "חוות השקמה" } });
    render(<AccountDeleteCard />);
    openCard();
    expect(await screen.findByText(`${NS}.business_warning|{"name":"חוות השקמה"}`)).toBeTruthy();
    expect(apiGet).toHaveBeenCalledWith("/producers/me");
    const pause = screen.getByRole("link", { name: `${NS}.pause_cta` });
    expect(pause.getAttribute("href")).toBe("/producer/dashboard#availability-heading");
  });

  it("cannot submit while the business name is unknown", async () => {
    userRef.current = { ...base, producer_id: "p1" };
    apiGet.mockRejectedValue(new Error("down"));
    render(<AccountDeleteCard />);
    openCard();
    typeEmail();
    fireEvent.change(document.getElementById("danger-password"), { target: { value: "example-pw-123" } });
    expect(await screen.findByText("settings.security.common.error_retry")).toBeTruthy();
    expect(screen.getByRole("button", { name: `${NS}.submit_cta` })).toBeDisabled();
    expect(screen.queryByTestId("delete-owner-warning")).toBeNull();
  });

  it("a consumer never fetches a business", () => {
    userRef.current = base;
    render(<AccountDeleteCard />);
    openCard();
    expect(apiGet).not.toHaveBeenCalled();
    expect(screen.queryByTestId("delete-owner-warning")).toBeNull();
  });
});
