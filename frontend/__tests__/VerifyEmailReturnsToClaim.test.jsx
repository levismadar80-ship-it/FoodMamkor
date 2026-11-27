/**
 * MEH-3975 — an owner who signed up by email from the claim page comes back to
 * the claim after the verification link, from any browser. The link carries
 * `claim=<12-char code>`; the page stashes it in this tab and sends her to
 * /claim (the claim page reads it from there).
 *
 * Discriminates: with the old VerifyEmailClient every case below lands on "/"
 * (or a bare "/login") and nothing is stashed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import VerifyEmailClient from "@/app/[locale]/verify-email/VerifyEmailClient";
import { readClaimToken } from "@/lib/claim-token";
import { claimCodeForSignup, takeClaimLanding } from "@/lib/claim-return";

const CODE = "Pk8VP2JpqGI3";
const params = { current: `token=tok-123&claim=${CODE}` };
const authRef = { current: { user: null, loading: false } };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authRef.current }));
vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(params.current) }));
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
  sessionStorage.clear();
  params.current = `token=tok-123&claim=${CODE}`;
  apiGet.mockReset().mockResolvedValue({ data: { ok: true } });
  apiPost.mockReset().mockResolvedValue({});
  assign.mockReset();
  realLocation = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign, href: `https://mehamakor.co.il/verify-email?${params.current}` },
  });
});
afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: realLocation });
});

describe("verify-email returns an owner to the claim (MEH-3975)", () => {
  it("link opens a session: stashes the code and lands on /claim", async () => {
    authRef.current = { user: null, loading: false };
    withSession({ id: "u3", producer_id: null });
    render(<VerifyEmailClient />);

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/claim"));
    expect(readClaimToken()).toBe(CODE);
  });

  it("logged out in another browser: «כניסה להמשך» carries /claim to /login", async () => {
    authRef.current = { user: null, loading: false };
    render(<VerifyEmailClient />);

    const cta = await screen.findByTestId("verify-email-login");
    expect(cta).toHaveAttribute("href", `/login?redirect=${encodeURIComponent("/claim")}`);
    expect(readClaimToken()).toBe(CODE);
  });

  it("an owner who already has a business still goes to the dashboard", async () => {
    authRef.current = { user: null, loading: false };
    withSession({ id: "u1", producer_id: "p1" });
    render(<VerifyEmailClient />);

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/producer/dashboard"));
  });

  it("a malformed claim value is ignored: lands on / and stashes nothing", async () => {
    params.current = "token=tok-123&claim=..%2F%2Fevil";
    authRef.current = { user: null, loading: false };
    withSession({ id: "u3", producer_id: null });
    render(<VerifyEmailClient />);

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
    expect(readClaimToken()).toBeNull();
  });
});

describe("claimCodeForSignup (MEH-3975)", () => {
  it("sends the stashed short code when /register came from /claim", () => {
    sessionStorage.setItem("mehamakor.claimToken", CODE);
    expect(claimCodeForSignup("/claim")).toBe(CODE);
    expect(claimCodeForSignup("/en/claim")).toBe(CODE);
  });

  it("sends nothing for another redirect, or for an old JWT link", () => {
    sessionStorage.setItem("mehamakor.claimToken", CODE);
    expect(claimCodeForSignup("/meshek-hadugma")).toBeNull();
    sessionStorage.setItem("mehamakor.claimToken", "eyJhbGciOiJIUzI1NiJ9.e30.sig");
    expect(claimCodeForSignup("/claim")).toBeNull();
  });
});

describe("takeClaimLanding (MEH-3975)", () => {
  const at = (href) => {
    window.location.href = href;
    return vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  };
  afterEach(() => vi.restoreAllMocks());

  it("strips claim from the address and keeps every other parameter", () => {
    const spy = at(`https://mehamakor.co.il/verify-email?token=tok-123&claim=${CODE}`);
    expect(takeClaimLanding(CODE)).toBe("/claim");
    expect(spy.mock.calls[0].slice(1)).toEqual(["", "/verify-email?token=tok-123"]);
  });

  it("keeps the English prefix", () => {
    at(`https://mehamakor.co.il/en/verify-email?token=t&claim=${CODE}`);
    expect(takeClaimLanding(CODE)).toBe("/en/claim");
  });

  it("storage refused: the code travels in the address instead", () => {
    at(`https://mehamakor.co.il/verify-email?token=t&claim=${CODE}`);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(takeClaimLanding(CODE)).toBe(`/c/${CODE}`);
  });

  it("no claim parameter: nothing to do", () => {
    const spy = at("https://mehamakor.co.il/verify-email?token=t");
    expect(takeClaimLanding(null)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
