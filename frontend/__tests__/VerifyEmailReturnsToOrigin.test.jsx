/**
 * MEH-3661 — a customer who signed up by email from a business page comes back
 * to that page after the verification link, not to "/".
 *
 * Discriminates: with the old VerifyEmailClient every consumer case below lands
 * on "/" and the login CTA is a bare "/login" — whatever is stored.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import VerifyEmailClient from "@/app/[locale]/verify-email/VerifyEmailClient";
import { rememberReturnPath, RETURN_TTL_MS } from "@/lib/post-auth-return";

const authRef = { current: { user: null, loading: false } };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authRef.current }));
vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("token=tok-123") }));
const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock("@/lib/api", () => ({
  default: { get: (...a) => apiGet(...a), post: (...a) => apiPost(...a) },
}));
vi.mock("@phosphor-icons/react", () => ({
  EnvelopeSimple: () => null,
  CheckCircle: () => null,
  LinkBreak: () => null,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

const PAST_REDIRECT_MS = 2200;
const ORIGIN = "/meshek-hadugma?tab=products";
const assign = vi.fn();
let realLocation;

const withSession = (me) =>
  apiGet.mockImplementation((url) =>
    url === "/auth/verify-email"
      ? Promise.resolve({ data: { detail: "ok", access_token: "acc-1" } })
      : Promise.resolve({ data: me }),
  );

beforeEach(() => {
  localStorage.clear();
  apiGet.mockReset().mockResolvedValue({ data: { ok: true } });
  apiPost.mockReset().mockResolvedValue({});
  assign.mockReset();
  realLocation = window.location;
  Object.defineProperty(window, "location", { configurable: true, value: { assign } });
});
afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, "location", { configurable: true, value: realLocation });
});

describe("verify-email returns a customer to where she signed up (MEH-3661)", () => {
  it("link opens a session: lands on the stored page and forgets it", async () => {
    rememberReturnPath(ORIGIN);
    authRef.current = { user: null, loading: false };
    withSession({ id: "u2", producer_id: null });
    render(<VerifyEmailClient />);

    await waitFor(() => expect(assign).toHaveBeenCalledWith(ORIGIN));
    expect(localStorage.getItem("post_auth_return")).toBeNull();
  });

  it("already logged in: redirects to the stored page", async () => {
    rememberReturnPath(ORIGIN);
    authRef.current = { user: { id: "u2", producer_id: null }, loading: false };
    render(<VerifyEmailClient />);

    expect(await screen.findByTestId("verify-email-continue")).toHaveAttribute("href", ORIGIN);
    await waitFor(() => expect(assign).toHaveBeenCalledWith(ORIGIN), { timeout: PAST_REDIRECT_MS });
  });

  it("logged out, no session: «כניסה להמשך» carries the page to /login", async () => {
    rememberReturnPath(ORIGIN);
    authRef.current = { user: null, loading: false };
    render(<VerifyEmailClient />);

    const cta = await screen.findByTestId("verify-email-login");
    expect(cta).toHaveAttribute("href", `/login?redirect=${encodeURIComponent(ORIGIN)}`);
  });

  it("business owner still goes to the dashboard, even with a stored page", async () => {
    rememberReturnPath(ORIGIN);
    authRef.current = { user: null, loading: false };
    withSession({ id: "u1", producer_id: "p1" });
    render(<VerifyEmailClient />);

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/producer/dashboard"));
  });

  it("a stored page older than 24 h is ignored", async () => {
    rememberReturnPath(ORIGIN);
    const stored = JSON.parse(localStorage.getItem("post_auth_return"));
    localStorage.setItem(
      "post_auth_return",
      JSON.stringify({ ...stored, at: stored.at - RETURN_TTL_MS - 1 }),
    );
    authRef.current = { user: null, loading: false };
    withSession({ id: "u2", producer_id: null });
    render(<VerifyEmailClient />);

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });

  it("a hand-planted external address is never followed", async () => {
    localStorage.setItem("post_auth_return", JSON.stringify({ path: "//evil.example", at: Date.now() }));
    authRef.current = { user: null, loading: false };
    withSession({ id: "u2", producer_id: null });
    render(<VerifyEmailClient />);

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });
});
