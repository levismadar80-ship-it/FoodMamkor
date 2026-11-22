/**
 * MEH-3675 — a Google sign-in made on the owner-invite page a moment ago
 * replaces the email code (Sapir 22/11: «כן, רק בכניסה טרייה»). An account
 * that was already signed in before the page keeps the code step, and a
 * Google sign-in the server refuses drops back to it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import OwnerInviteClient from "@/app/[locale]/owner-invite/OwnerInviteClient";

const push = vi.fn();
let authUser = null;
const CONSUMER = { id: "u1", email: "hers@example.com", role: "consumer", producer_id: null };

// The real button signs in through /auth/google and then hands the caller
// the credential; the stand-in does the same two things.
vi.mock("@/components/GoogleAuthButton", () => ({
  default: ({ onSuccess }) => (
    <button
      type="button"
      data-testid="google-button"
      onClick={() => {
        authUser = CONSUMER;
        onSuccess?.("fresh-google-credential");
      }}
    />
  ),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ replace: vi.fn(), push }),
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: authUser, loading: false, refreshUser: vi.fn(async () => {}), logout: () => { authUser = null; } }),
}));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/components/PasswordInput", () => ({
  default: ({ value, onChange }) => <input data-testid="pw" value={value} onChange={onChange} />,
}));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-client" } }));

const TOKEN = "t".repeat(43);
const INVITE = { producer_name: "מאפיית הגבעה", email: null, requires_farmer_declaration: false, will_publish: false, preview: null };
const ACCEPT = "/auth/owner-invite/accept-existing";

function wrap() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <OwnerInviteClient />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authUser = null;
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.sessionStorage.setItem("mehamakor.ownerInviteToken", TOKEN);
  api.get.mockResolvedValue({ data: INVITE });
  api.post.mockResolvedValue({ data: { access_token: "owner-session", token_type: "bearer" } });
});

async function signInWithGoogleHere() {
  fireEvent.click(await screen.findByTestId("google-button"));
  await screen.findByTestId("owner-invite-existing-form");
}

describe("owner invite — fresh Google sign-in instead of the code (MEH-3675)", () => {
  it("after Google on this page there is no code step, and the credential is sent instead", async () => {
    wrap();
    await signInWithGoogleHere();
    expect(screen.queryByTestId("owner-invite-existing-send-code")).toBeNull();
    expect(screen.queryByTestId("owner-invite-existing-code")).toBeNull();
    fireEvent.click(screen.getByTestId("owner-invite-consent"));
    fireEvent.submit(screen.getByTestId("owner-invite-existing-form"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/producer/dashboard"));
    const [url, body] = api.post.mock.calls.find(([u]) => u === ACCEPT);
    expect(url).toBe(ACCEPT);
    expect(body.google_id_token).toBe("fresh-google-credential");
    expect(body).not.toHaveProperty("code");
  });

  it("an account signed in before the page still gets the code step", async () => {
    authUser = CONSUMER;
    wrap();
    expect(await screen.findByTestId("owner-invite-existing-send-code")).toBeTruthy();
    expect(screen.getByTestId("owner-invite-existing-code")).toBeTruthy();
    expect(screen.getByTestId("owner-invite-existing-submit").disabled).toBe(true);
  });

  it("a Google sign-in the server refuses drops back to the code step with its reason", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 422, data: { detail: "צריך לבקש קוד אימות ולהזין אותו." } } });
    wrap();
    await signInWithGoogleHere();
    fireEvent.click(screen.getByTestId("owner-invite-consent"));
    fireEvent.submit(screen.getByTestId("owner-invite-existing-form"));
    expect(await screen.findByTestId("owner-invite-existing-send-code")).toBeTruthy();
    expect(screen.getByTestId("owner-invite-existing-error").textContent).toContain("צריך לבקש קוד אימות");
  });

  it("any other refusal keeps the Google sign-in (no code step forced on her)", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 422, data: { detail: "צריך לאשר את הצהרת החקלאית." } } });
    wrap();
    await signInWithGoogleHere();
    fireEvent.click(screen.getByTestId("owner-invite-consent"));
    fireEvent.submit(screen.getByTestId("owner-invite-existing-form"));
    await screen.findByTestId("owner-invite-existing-error");
    expect(screen.queryByTestId("owner-invite-existing-send-code")).toBeNull();
  });

  it("signing out drops the credential: the next account in this tab gets the code step", async () => {
    const { rerender } = wrap();
    await signInWithGoogleHere();
    fireEvent.click(screen.getByTestId("owner-invite-existing-sign-out"));
    authUser = { ...CONSUMER, id: "u2", email: "other@example.com" };
    rerender(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <OwnerInviteClient />
      </NextIntlClientProvider>,
    );
    expect(await screen.findByTestId("owner-invite-existing-send-code")).toBeTruthy();
  });
});

