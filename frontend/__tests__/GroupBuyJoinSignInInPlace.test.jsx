/**
 * MEH-3679 — a guest's «כניסה להצטרפות» on a group buy opens the shared
 * sign-in window (Google inside, MEH-3661) instead of leaving for /login, and
 * a Google sign-in there sends the join by itself, with the quantity chosen.
 *
 * Discriminates: the old page sent a guest to /login with router.push and
 * rendered no window — the first two cases fail against it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { createContext, useContext, useEffect, useState } from "react";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => {
    const t = (key) => key;
    t.rich = (key) => key;
    return t;
  },
}));
vi.mock("@/lib/format-date", () => ({
  formatEventDate: () => "1 בינואר 2099",
  formatDate: () => "1 בינואר 2099",
}));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "cid" } }));
vi.mock("@/lib/analytics", () => ({ trackEvent: () => {} }));

let setUserExternal = () => {};
const AuthCtx = createContext(null);
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: useContext(AuthCtx), loading: false }),
}));
// The real order (auth-context afterLogin): the user is set, React renders,
// and only after an await does GoogleAuthButton call onSuccess. The mock keeps
// that gap so a join gated on "user changed after onSignedIn" would be lost.
vi.mock("@/components/GoogleAuthButton", () => ({
  default: ({ onSuccess }) => (
    <button
      type="button"
      onClick={async () => {
        setUserExternal({ id: 7, name: "דנה", role: "user" });
        await new Promise((resolve) => setTimeout(resolve, 0));
        onSuccess();
      }}
    >
      google-ok
    </button>
  ),
}));

const OPEN_GB = {
  id: "gb-1",
  title: "קבוצת רכישה לדוגמה",
  status: "open",
  deadline: "2099-01-01T00:00:00Z",
  min_participants: 2,
  max_participants: 10,
  commits_count: 0,
  price_per_unit_regular: 100,
  price_per_unit_group: 80,
  user_committed: false,
  user_commit: null,
};
const post = vi.fn(() => Promise.resolve({ data: {} }));
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: OPEN_GB })),
    post: (...a) => post(...a),
    delete: vi.fn(() => Promise.resolve({})),
  },
}));

import GroupBuyDetailClient from "@/app/[locale]/group-buys/[id]/GroupBuyDetailClient";

function Harness() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    setUserExternal = setUser;
  }, []);
  return (
    <AuthCtx.Provider value={user}>
      <GroupBuyDetailClient id="gb-1" />
    </AuthCtx.Provider>
  );
}

beforeEach(() => {
  post.mockClear();
  mockPush.mockReset();
  sessionStorage.clear();
});

describe("Group-buy join — sign in without leaving the page (MEH-3679)", () => {
  it("a guest's join opens the sign-in window and does not navigate", async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "submit_login" }));
    expect(await screen.findByText("login_prompt_title")).toBeInTheDocument();
    expect(screen.getByText("login_prompt_message")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("Google sign-in in the window sends one join, with the chosen quantity", async () => {
    render(<Harness />);
    const qty = await screen.findByRole("spinbutton");
    fireEvent.change(qty, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "submit_login" }));
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "google-ok" }));
    });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/group-buys/gb-1/commit", { quantity: 3 });
    expect(screen.queryByText("login_prompt_title")).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it.each([
    ["«אולי אחר כך»", () => fireEvent.click(screen.getByRole("button", { name: "dismiss_cta" }))],
    ["Escape", () => fireEvent.keyDown(document.activeElement || document.body, { key: "Escape" })],
  ])("closing the window with %s sends nothing", async (_how, close) => {
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "submit_login" }));
    await screen.findByText("login_prompt_title");
    close();
    await waitFor(() => expect(screen.queryByText("login_prompt_title")).toBeNull());
    expect(post).not.toHaveBeenCalled();
  });

  it("a user who appears without the window (e.g. a restored session) joins nothing", async () => {
    render(<Harness />);
    await screen.findByRole("button", { name: "submit_login" });
    await act(async () => {
      setUserExternal({ id: 7, name: "דנה", role: "user" });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(await screen.findByRole("button", { name: "submit_join" })).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});
