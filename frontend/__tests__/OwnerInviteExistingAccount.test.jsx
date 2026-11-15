/**
 * MEH-3256 (grill retro D8) — an owner who already has an account accepts the
 * invite as that account, instead of being told «האימייל הזה כבר רשום».
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import OwnerInviteClient from "@/app/[locale]/owner-invite/OwnerInviteClient";

const replace = vi.fn();
const push = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ replace, push }),
}));

let authUser = null;
let authLoading = false;
const logout = vi.fn(() => {
  authUser = null;
});
let tokenSeenByRefresh;
const refreshUser = vi.fn(async () => {
  tokenSeenByRefresh = window.localStorage.getItem("token");
});
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: authUser, loading: authLoading, refreshUser, logout }),
}));

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("@/components/PasswordInput", () => ({
  default: ({ value, onChange }) => <input data-testid="pw" value={value} onChange={onChange} />,
}));

const TOKEN = "t".repeat(43);
const INVITE = {
  producer_name: "מאפיית הגבעה",
  email: null,
  requires_farmer_declaration: false,
  will_publish: false,
  preview: null,
};
const CONSUMER = { id: "u1", email: "hers@example.com", role: "consumer", producer_id: null };

function wrap(ui) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authUser = null;
  authLoading = false;
  tokenSeenByRefresh = undefined;
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.sessionStorage.setItem("mehamakor.ownerInviteToken", TOKEN);
  api.get.mockResolvedValue({ data: INVITE });
  api.post.mockImplementation((url) =>
    url === "/auth/owner-invite/accept-existing"
      ? Promise.resolve({ data: { access_token: "owner-session", token_type: "bearer" } })
      : Promise.resolve({ data: {} }),
  );
});

async function acceptAsSignedIn() {
  fireEvent.click(await screen.findByTestId("owner-invite-existing-send-code"));
  await screen.findByTestId("owner-invite-existing-code-sent");
  fireEvent.change(screen.getByTestId("owner-invite-existing-code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByTestId("owner-invite-terms"));
  fireEvent.click(screen.getByTestId("owner-invite-declaration"));
  fireEvent.submit(screen.getByTestId("owner-invite-existing-form"));
}

describe("owner invite — signed in", () => {
  it("shows the existing-account form, not the new-account one", async () => {
    authUser = CONSUMER;
    wrap(<OwnerInviteClient />);
    expect(await screen.findByTestId("owner-invite-existing-account")).toHaveTextContent("hers@example.com");
    // Isolated inside the Hebrew sentence, so the words around it stay put.
    expect(screen.getByTestId("owner-invite-existing-account").textContent).toContain(
      "\u2068hers@example.com\u2069",
    );
    expect(screen.queryByTestId("owner-invite-form")).toBeNull();
    expect(screen.queryByTestId("owner-invite-email")).toBeNull();
  });

  it("asks for the code with the token only — no address is sent", async () => {
    authUser = CONSUMER;
    wrap(<OwnerInviteClient />);
    fireEvent.click(await screen.findByTestId("owner-invite-existing-send-code"));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/auth/owner-invite/email-code-existing", { token: TOKEN }),
    );
  });

  it("accepts, stores the new session before refreshing, and opens the dashboard", async () => {
    authUser = CONSUMER;
    window.localStorage.setItem("token", "old-consumer-session");
    wrap(<OwnerInviteClient />);
    await acceptAsSignedIn();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/producer/dashboard"));
    expect(api.post).toHaveBeenCalledWith("/auth/owner-invite/accept-existing", {
      token: TOKEN,
      code: "123456",
      terms_accepted: true,
      declaration_accepted: true,
    });
    expect(tokenSeenByRefresh).toBe("owner-session");
    expect(window.sessionStorage.getItem("mehamakor.ownerInviteToken")).toBeNull();
  });

  it("shows the server's reason when the account cannot take the business", async () => {
    authUser = { ...CONSUMER, producer_id: "p9", role: "producer" };
    api.post.mockImplementation((url) =>
      url === "/auth/owner-invite/accept-existing"
        ? Promise.reject({ response: { status: 409, data: { detail: "לחשבון הזה כבר יש בית עסק." } } })
        : Promise.resolve({ data: {} }),
    );
    wrap(<OwnerInviteClient />);
    await acceptAsSignedIn();
    expect(await screen.findByTestId("owner-invite-existing-error")).toHaveTextContent("לחשבון הזה כבר יש בית עסק.");
    expect(push).not.toHaveBeenCalled();
  });

  it("a dead link at accept time shows the invalid view", async () => {
    authUser = CONSUMER;
    api.post.mockImplementation((url) =>
      url === "/auth/owner-invite/accept-existing"
        ? Promise.reject({ response: { status: 404, data: { detail: "x" } } })
        : Promise.resolve({ data: {} }),
    );
    wrap(<OwnerInviteClient />);
    await acceptAsSignedIn();
    expect(await screen.findByTestId("owner-invite-invalid")).toBeInTheDocument();
  });

  it("does not submit before a code was asked for", async () => {
    authUser = CONSUMER;
    wrap(<OwnerInviteClient />);
    expect(await screen.findByTestId("owner-invite-existing-submit")).toBeDisabled();
  });
});

describe("owner invite — signed in, more cases", () => {
  it("shows the loader, and neither form, while the session is loading", async () => {
    authLoading = true;
    wrap(<OwnerInviteClient />);
    expect(await screen.findByTestId("owner-invite-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("owner-invite-form")).toBeNull();
    expect(screen.queryByTestId("owner-invite-existing-form")).toBeNull();
  });

  it("sends the grower line when the page needs it", async () => {
    authUser = CONSUMER;
    api.get.mockResolvedValue({ data: { ...INVITE, requires_farmer_declaration: true } });
    wrap(<OwnerInviteClient />);
    fireEvent.click(await screen.findByTestId("owner-invite-farmer"));
    await acceptAsSignedIn();
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/auth/owner-invite/accept-existing",
        expect.objectContaining({ farmer_declaration_accepted: true, declaration_accepted: true }),
      ),
    );
  });

  it("shows a refusal at the code step", async () => {
    authUser = CONSUMER;
    api.post.mockRejectedValue({ response: { status: 403, data: { detail: "חשבון ניהול לא יכול להיות בעלים" } } });
    wrap(<OwnerInviteClient />);
    fireEvent.click(await screen.findByTestId("owner-invite-existing-send-code"));
    expect(await screen.findByTestId("owner-invite-existing-error")).toHaveTextContent("חשבון ניהול");
    expect(screen.queryByTestId("owner-invite-existing-code-sent")).toBeNull();
  });

  it("names the button «שליחת קוד חדש» after a send", async () => {
    authUser = CONSUMER;
    wrap(<OwnerInviteClient />);
    const button = await screen.findByTestId("owner-invite-existing-send-code");
    fireEvent.click(button);
    await screen.findByTestId("owner-invite-existing-code-sent");
    expect(button).toHaveTextContent(he.owner_invite.existing.resend);
  });

  it("offers to sign out of the wrong account", async () => {
    authUser = CONSUMER;
    wrap(<OwnerInviteClient />);
    fireEvent.click(await screen.findByTestId("owner-invite-existing-sign-out"));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});

describe("owner invite — signed out", () => {
  it("offers a sign-in link that comes back here, without the token", async () => {
    window.history.replaceState({}, "", "/owner-invite");
    wrap(<OwnerInviteClient />);
    const link = await screen.findByTestId("owner-invite-login-link");
    expect(link.getAttribute("href")).toBe(`/login?redirect=${encodeURIComponent("/owner-invite")}`);
    expect(link.getAttribute("href")).not.toContain(TOKEN);
    expect(screen.getByTestId("owner-invite-form")).toBeInTheDocument();
  });

  it("keeps the /en prefix on the sign-in link", async () => {
    window.history.replaceState({}, "", "/en/owner-invite");
    wrap(<OwnerInviteClient />);
    const link = await screen.findByTestId("owner-invite-login-link");
    expect(link.getAttribute("href")).toBe(`/en/login?redirect=${encodeURIComponent("/en/owner-invite")}`);
  });

});
