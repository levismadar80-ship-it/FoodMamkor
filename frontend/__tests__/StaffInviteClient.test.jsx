/**
 * MEH-3526 — the order-staff invite page.
 *
 * The token leaves the address on first load (it is a credential); a guest is
 * sent to /login and /register with the TOKEN-LESS address to come back to;
 * a signed-in person accepts with the stashed token and lands on the orders.
 * A refusal shows the server's own Hebrew reason.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import StaffInviteClient from "@/app/[locale]/staff-invite/StaffInviteClient";
import { readStaffInviteToken, redactClaimPath, stashStaffInviteToken } from "@/lib/claim-token";

const replace = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
  useRouter: () => ({ replace, push: vi.fn() }),
  getPathname: ({ href, locale }) => (locale === "he" ? href : `/${locale}${href}`),
}));
const auth = { user: null };
const refreshUser = vi.fn(async () => {});
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: auth.user, loading: false, refreshUser }),
}));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));

const TOKEN = "s".repeat(43);
const renderPage = (props = {}) =>
  render(
    <NextIntlClientProvider locale="he" messages={he}>
      <StaffInviteClient {...props} />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  window.sessionStorage.clear();
  replace.mockClear();
  refreshUser.mockClear();
  api.post.mockReset();
  auth.user = null;
});

describe("MEH-3526 /staff-invite", () => {
  it("moves the token out of the address into this tab", () => {
    renderPage({ tokenFromPath: TOKEN });
    expect(readStaffInviteToken()).toBe(TOKEN);
    expect(replace).toHaveBeenCalledWith("/staff-invite");
  });

  it("with no token in the tab, says the link is not valid", async () => {
    renderPage();
    expect(await screen.findByTestId("staff-invite-invalid")).toBeInTheDocument();
  });

  it("a guest is sent to sign in and back to the token-less address", async () => {
    stashStaffInviteToken(TOKEN);
    renderPage();
    const login = await screen.findByTestId("staff-invite-login");
    expect(login.getAttribute("href")).toBe("/login?redirect=%2Fstaff-invite");
    expect(screen.getByTestId("staff-invite-register").getAttribute("href")).toBe("/register?redirect=%2Fstaff-invite");
    expect(login.getAttribute("href")).not.toContain(TOKEN);
  });

  it("signed in: accepting posts the token, clears it and opens the orders", async () => {
    stashStaffInviteToken(TOKEN);
    auth.user = { role: "consumer" };
    api.post.mockResolvedValue({ data: { producer_id: "p-1", name: "x" } });
    renderPage();
    fireEvent.click(await screen.findByTestId("staff-invite-accept"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/producer/dashboard/orders"));
    expect(api.post).toHaveBeenCalledWith("/staff-invites/accept", { token: TOKEN });
    expect(refreshUser).toHaveBeenCalled();
    expect(readStaffInviteToken()).toBeNull();
  });

  it("a refusal shows the server's reason and keeps the token", async () => {
    stashStaffInviteToken(TOKEN);
    auth.user = { role: "consumer" };
    api.post.mockRejectedValue({ response: { status: 403, data: { detail: "ההזמנה נשלחה לכתובת מייל אחרת." } } });
    renderPage();
    fireEvent.click(await screen.findByTestId("staff-invite-accept"));
    expect(await screen.findByTestId("staff-invite-error")).toHaveTextContent("ההזמנה נשלחה לכתובת מייל אחרת.");
    expect(replace).not.toHaveBeenCalled();
    expect(readStaffInviteToken()).toBe(TOKEN);
  });

  it("telemetry never carries the token, plain or encoded", () => {
    expect(redactClaimPath(`https://x.co/staff-invite/${TOKEN}?a=1`)).toBe("https://x.co/staff-invite/[token]?a=1");
    expect(redactClaimPath(`/login?redirect=%2Fen%2Fstaff-invite%2F${TOKEN}`)).toBe("/login?redirect=%2Fen%2Fstaff-invite%2F[token]");
    // The route's own files keep their names (the 40-character floor).
    expect(redactClaimPath("/staff-invite/StaffInviteClient.jsx")).toBe("/staff-invite/StaffInviteClient.jsx");
  });
});
