/**
 * MEH-3884 — «this business already has a page» under the phone field of the
 * sign-up form (Farmerim, 26/11).
 *
 * States: no valid phone and not signed in (no request) / 0 matches (nothing)
 * / 1 match with an account (masked email + login + contact) / 1 match with no
 * account (no email, no login) / signed in with no phone (asks on her account)
 * / a failed or malformed answer (nothing). Many matches are reduced to one by
 * the server, so the component has no "many" state. Never blocks the form.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import RegisterIdentityCheck from "@/components/RegisterIdentityCheck";

const apiPost = vi.fn();
vi.mock("@/lib/api", () => ({ default: { post: (...a) => apiPost(...a) } }));
vi.mock("next-intl", () => ({
  useTranslations: (ns) => {
    const t = (key) => `${ns}.${key}`;
    // t.rich: render the key and hand the email to the <addr> tag, as next-intl does.
    t.rich = (key, vals) => (
      <>
        {`${ns}.${key} `}
        {vals.addr ? vals.addr(vals.email) : vals.email}
      </>
    );
    return t;
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

const ROOT = "auth.register";
const PAST_DEBOUNCE_MS = 700;
const PHONE = "052-555-1234";

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  apiPost.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("RegisterIdentityCheck (MEH-3884)", () => {
  it("no valid phone and signed out: never asks", async () => {
    render(<RegisterIdentityCheck phone="052" />);
    await settle();
    expect(apiPost).not.toHaveBeenCalled();
    expect(screen.queryByTestId("register-identity-check")).toBeNull();
  });

  it("0 matches: asks once with the phone only, renders nothing", async () => {
    apiPost.mockResolvedValue({ data: { match: null } });
    render(<RegisterIdentityCheck phone={` ${PHONE} `} />);
    expect(apiPost).not.toHaveBeenCalled();
    await settle();
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(apiPost).toHaveBeenCalledWith("/producer-identity-check", { phone: PHONE });
    expect(screen.queryByTestId("register-identity-check")).toBeNull();
  });

  it("a page with an account: masked email, login and contact links", async () => {
    apiPost.mockResolvedValue({ data: { match: { owner_email: "o***@farmerim.com" } } });
    render(<RegisterIdentityCheck phone={PHONE} />);
    await settle();
    expect(screen.getByTestId("register-identity-check")).toHaveTextContent(`${ROOT}.producer.identity_check.title`);
    expect(screen.getByTestId("register-identity-check-body")).toHaveTextContent("o***@farmerim.com");
    expect(screen.getByTestId("register-identity-check-login")).toHaveAttribute("href", "/login");
    expect(screen.getByTestId("register-identity-check-contact")).toHaveAttribute("href", "/contact");
  });

  it("a page with no account: no email, no login, contact only", async () => {
    apiPost.mockResolvedValue({ data: { match: { owner_email: null } } });
    render(<RegisterIdentityCheck phone={PHONE} />);
    await settle();
    expect(screen.getByTestId("register-identity-check-body")).toHaveTextContent(`${ROOT}.producer.identity_check.body_unowned`);
    expect(screen.queryByTestId("register-identity-check-login")).toBeNull();
    expect(screen.getByTestId("register-identity-check-contact")).toBeInTheDocument();
  });

  it("signed in with no phone yet: asks on her own account", async () => {
    apiPost.mockResolvedValue({ data: { match: { owner_email: null } } });
    render(<RegisterIdentityCheck phone="" signedIn />);
    await settle();
    expect(apiPost).toHaveBeenCalledWith("/producer-identity-check", { phone: null });
    expect(screen.getByTestId("register-identity-check")).toBeInTheDocument();
  });

  it("a failed or malformed answer renders nothing", async () => {
    apiPost.mockRejectedValueOnce(new Error("429"));
    const { rerender } = render(<RegisterIdentityCheck phone={PHONE} />);
    await settle();
    expect(screen.queryByTestId("register-identity-check")).toBeNull();
    apiPost.mockResolvedValue({ data: { match: { owner_email: 7 } } });
    rerender(<RegisterIdentityCheck phone="052-555-9999" />);
    await settle();
    expect(screen.queryByTestId("register-identity-check")).toBeNull();
  });

  it("an answer for an older phone is not shown beside a newer one", async () => {
    apiPost.mockResolvedValue({ data: { match: { owner_email: "o***@farmerim.com" } } });
    const { rerender } = render(<RegisterIdentityCheck phone={PHONE} />);
    await settle();
    expect(screen.getByTestId("register-identity-check")).toBeInTheDocument();
    apiPost.mockResolvedValue({ data: { match: null } });
    rerender(<RegisterIdentityCheck phone="052-555-9999" />);
    expect(screen.queryByTestId("register-identity-check")).toBeNull();
  });
});
