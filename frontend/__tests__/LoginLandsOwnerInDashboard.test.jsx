import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoginClient from "@/app/[locale]/login/LoginClient";

/**
 * MEH-2481 — after a password login, a business owner (a user carrying
 * `producer_id`) lands in `/producer/dashboard`, not on "/". Measured on
 * staging 28/10: a fresh owner was dropped on the homepage with no path to
 * the three required items.
 *
 * Discrimination: against the pre-change code (always `redirectTo`, i.e. "/")
 * the owner case fails. The consumer case and the explicit ?redirect= case
 * pass in both worlds and are the controls — the second is also MEH-1428's
 * contract, which this change must not loosen.
 */

const paramsRef = { current: new URLSearchParams("") };
const push = vi.fn();
const replace = vi.fn();
const loginMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => paramsRef.current,
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: null, loading: false, login: loginMock }),
}));
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "", NEXT_PUBLIC_APPLE_CLIENT_ID: "" },
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@phosphor-icons/react", () => ({
  CaretDown: () => <span />,
  ArrowRight: () => null,
  EnvelopeSimple: () => null,
  Eye: () => null,
  EyeSlash: () => null,
  Lock: () => null,
}));
vi.mock("@/components/GoogleAuthButton", () => ({ default: () => null }));
vi.mock("@/components/AppleAuthButton", () => ({ default: () => null }));
vi.mock("@/components/ButtonSpinner", () => ({ default: () => null }));

async function submitAs(me) {
  loginMock.mockResolvedValue(me);
  render(<LoginClient />);
  fireEvent.change(screen.getByTestId("login-email"), { target: { value: "owner@example.com" } });
  fireEvent.change(screen.getByTestId("login-password"), { target: { value: "Zx7Yp9Mq2Lr4" } });
  fireEvent.submit(screen.getByTestId("login-password").closest("form"));
  await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
  return push.mock.calls[0][0];
}

beforeEach(() => {
  paramsRef.current = new URLSearchParams("");
  push.mockClear();
  replace.mockClear();
  loginMock.mockReset();
});

describe("/login landing after a password login (MEH-2481)", () => {
  it("a business owner lands in the dashboard", async () => {
    expect(await submitAs({ id: "u1", role: "producer", producer_id: "p1" })).toBe(
      "/producer/dashboard",
    );
  });

  it("control: a consumer keeps the MEH-810 default", async () => {
    expect(await submitAs({ id: "u2", role: "consumer", producer_id: null })).toBe("/");
  });

  it("control: an explicit ?redirect= wins for an owner too (MEH-1428)", async () => {
    paramsRef.current = new URLSearchParams({ redirect: "/meshek?rt=tok#reviews" });
    expect(await submitAs({ id: "u1", role: "producer", producer_id: "p1" })).toBe(
      "/meshek?rt=tok#reviews",
    );
  });
});
