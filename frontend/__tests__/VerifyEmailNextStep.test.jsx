/**
 * MEH-2492 — after the email link, the page says what to do next.
 *
 * Registration never logs the owner in (MEH-328), and the link is often opened
 * in another browser, so a logged-out visitor is the common case. Before this
 * card the success state auto-sent everyone to "/" — the owner landed on the
 * home page logged out with no hint to log in (Sapir's prod run, 28.10).
 *
 * Discriminates: with the old component, the logged-out case renders no
 * `verify-email-login` link and calls the redirect after 2 s — both asserted
 * below. The logged-in producer case went to "/", not the dashboard.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import VerifyEmailClient from "@/app/[locale]/verify-email/VerifyEmailClient";

const authRef = { current: { user: null, loading: false } };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => authRef.current,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("token=tok-123"),
}));

const apiGet = vi.fn();
vi.mock("@/lib/api", () => ({
  default: { get: (...a) => apiGet(...a) },
}));

vi.mock("@phosphor-icons/react", () => ({
  Envelope: () => null,
  CheckCircle: () => null,
  XCircle: () => null,
}));

// Longer than the component's REDIRECT_DELAY_MS (1500).
const PAST_REDIRECT_MS = 2200;
const assign = vi.fn();
let realLocation;

beforeEach(() => {
  apiGet.mockReset().mockResolvedValue({ data: { ok: true } });
  assign.mockReset();
  realLocation = window.location;
  Object.defineProperty(window, "location", { configurable: true, value: { assign } });
});

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: realLocation });
});

describe("verify-email next step (MEH-2492)", () => {
  it("logged out: shows the login CTA and does NOT redirect", async () => {
    authRef.current = { user: null, loading: false };
    render(<VerifyEmailClient />);

    const cta = await screen.findByTestId("verify-email-login");
    expect(cta).toHaveAttribute("href", "/login");
    expect(cta).toHaveTextContent("auth.verifyEmail.success_login_cta");
    expect(screen.getByText("auth.verifyEmail.success_login_subtitle")).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/auth/verify-email", { params: { token: "tok-123" } });

    await new Promise((r) => setTimeout(r, PAST_REDIRECT_MS));
    expect(assign).not.toHaveBeenCalled();
  });

  it("logged-in producer: lands in the dashboard", async () => {
    authRef.current = { user: { id: "u1", producer_id: "p1" }, loading: false };
    render(<VerifyEmailClient />);

    const cta = await screen.findByTestId("verify-email-continue");
    expect(cta).toHaveAttribute("href", "/producer/dashboard");
    expect(screen.queryByTestId("verify-email-login")).toBeNull();
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/producer/dashboard"), {
      timeout: PAST_REDIRECT_MS,
    });
  });

  it("logged-in consumer: goes home", async () => {
    authRef.current = { user: { id: "u2", producer_id: null }, loading: false };
    render(<VerifyEmailClient />);

    await screen.findByTestId("verify-email-continue");
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"), { timeout: PAST_REDIRECT_MS });
  });

  it("auth still resolving: neither CTA, no redirect", async () => {
    authRef.current = { user: null, loading: true };
    render(<VerifyEmailClient />);

    await screen.findByTestId("verify-email-success");
    expect(screen.queryByTestId("verify-email-login")).toBeNull();
    expect(screen.queryByTestId("verify-email-continue")).toBeNull();
    await new Promise((r) => setTimeout(r, PAST_REDIRECT_MS));
    expect(assign).not.toHaveBeenCalled();
  });
});
