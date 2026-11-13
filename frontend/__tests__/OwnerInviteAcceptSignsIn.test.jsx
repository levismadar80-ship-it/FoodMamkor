/**
 * MEH-2974 — accepting an owner invite signs the new owner in.
 *
 * The accept endpoint answers with her access token. The page has to store it
 * BEFORE it refreshes the auth context and opens the dashboard: refreshUser
 * returns early on an empty token, and the dashboard guard then sends a fresh
 * owner to /login — or, in a browser where another account is signed in, opens
 * the dashboard as that other account.
 *
 * Found by the fresh reviewer on the PR: the E2E stops at "is asked for a
 * code", so nothing exercised the step after a successful accept.
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

// What the token in storage was at the moment the auth context was refreshed.
let tokenSeenByRefresh;
const refreshUser = vi.fn(async () => {
  tokenSeenByRefresh = window.localStorage.getItem("token");
});
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: null, loading: false, refreshUser }),
}));

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

// The live strength checklist is not the subject here; a plain field keeps
// the debounced /auth/check-password call out of the test.
vi.mock("@/components/PasswordInput", () => ({
  default: ({ value, onChange }) => (
    <input data-testid="pw" type="password" value={value} onChange={onChange} />
  ),
}));

const TOKEN = "t".repeat(43);
const INVITE = {
  producer_name: "מאפיית הגבעה",
  email: "owner@example.com",
  requires_farmer_declaration: false,
  will_publish: false,
  preview: null,
};

function wrap(ui) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  tokenSeenByRefresh = undefined;
  window.localStorage.clear();
  window.sessionStorage.clear();
  api.get.mockResolvedValue({ data: INVITE });
  api.post.mockImplementation((url) =>
    url === "/auth/owner-invite/accept"
      ? Promise.resolve({ data: { access_token: "new-owner-token", token_type: "bearer" } })
      : Promise.resolve({ data: {} }),
  );
});

async function fillAndSubmit() {
  // No tokenFromPath: the page reads the stashed token, as it does after the
  // address has been swapped to /owner-invite.
  window.sessionStorage.setItem("mehamakor.ownerInviteToken", TOKEN);
  wrap(<OwnerInviteClient />);
  fireEvent.click(await screen.findByTestId("owner-invite-send-code"));
  fireEvent.change(await screen.findByTestId("owner-invite-code"), { target: { value: "123456" } });
  fireEvent.change(screen.getByTestId("pw"), { target: { value: "Abcdefgh1234!" } });
  fireEvent.click(screen.getByTestId("owner-invite-terms"));
  fireEvent.click(screen.getByTestId("owner-invite-declaration"));
  fireEvent.submit(screen.getByTestId("owner-invite-form"));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/producer/dashboard"));
}

describe("owner invite — a successful accept signs the owner in", () => {
  it("stores the access token before refreshing the auth context", async () => {
    await fillAndSubmit();
    expect(window.localStorage.getItem("token")).toBe("new-owner-token");
    expect(tokenSeenByRefresh).toBe("new-owner-token");
  });

  it("replaces another account's token that was already in this browser", async () => {
    window.localStorage.setItem("token", "someone-else");
    await fillAndSubmit();
    expect(tokenSeenByRefresh).toBe("new-owner-token");
  });
});

// MEH-3025 — she presses «שליחת קוד אימות», switches to her mail app, and the
// phone reloads the page when she comes back. The code in her inbox is still
// valid on the server; the page has to remember it asked for one, or the
// submit button stays disabled with nothing saying why.
describe("owner invite — a reload after the code was sent keeps the code usable", () => {
  const ADDRESS = "Hers@Example.com";

  async function sendCodeThenReload() {
    window.sessionStorage.setItem("mehamakor.ownerInviteToken", TOKEN);
    // The link carries no address (the usual case: we reached her on WhatsApp).
    api.get.mockResolvedValue({ data: { ...INVITE, email: null } });
    const first = wrap(<OwnerInviteClient />);
    fireEvent.change(await screen.findByTestId("owner-invite-email"), { target: { value: ADDRESS } });
    fireEvent.click(screen.getByTestId("owner-invite-send-code"));
    await screen.findByTestId("owner-invite-code-sent");
    first.unmount();
    wrap(<OwnerInviteClient />);
    await screen.findByTestId("owner-invite-form");
  }

  it("restores her address and enables submit once the code is typed", async () => {
    await sendCodeThenReload();
    expect(screen.getByTestId("owner-invite-email").value).toBe(ADDRESS);
    expect(screen.getByTestId("owner-invite-code-sent")).toBeTruthy();
    fireEvent.change(screen.getByTestId("owner-invite-code"), { target: { value: "123456" } });
    fireEvent.change(screen.getByTestId("pw"), { target: { value: "Abcdefgh1234!" } });
    expect(screen.getByTestId("owner-invite-submit").disabled).toBe(false);
    // One send only: the reload must not ask the server for a second code.
    const sends = api.post.mock.calls.filter(([url]) => url === "/auth/owner-invite/email-code");
    expect(sends).toHaveLength(1);
  });

  it("still retracts the code when she changes the address after the reload", async () => {
    await sendCodeThenReload();
    fireEvent.change(screen.getByTestId("owner-invite-email"), { target: { value: "other@example.com" } });
    fireEvent.change(screen.getByTestId("owner-invite-code"), { target: { value: "123456" } });
    fireEvent.change(screen.getByTestId("pw"), { target: { value: "Abcdefgh1234!" } });
    expect(screen.getByTestId("owner-invite-submit").disabled).toBe(true);
  });

  it("forgets the sent code for a different invite link", async () => {
    await sendCodeThenReload();
    window.sessionStorage.setItem("mehamakor.ownerInviteToken", "u".repeat(43));
    document.body.innerHTML = "";
    wrap(<OwnerInviteClient />);
    await screen.findByTestId("owner-invite-form");
    expect(screen.queryByTestId("owner-invite-code-sent")).toBeNull();
  });

  const NOTE_KEY = "mehamakor.ownerInviteCodeSent";

  it("leaves nothing behind once she is signed in", async () => {
    window.sessionStorage.setItem("mehamakor.ownerInviteToken", TOKEN);
    wrap(<OwnerInviteClient />);
    fireEvent.click(await screen.findByTestId("owner-invite-send-code"));
    // The note exists while the code is pending — otherwise the assertion
    // after the accept would pass on a page that never wrote one.
    await waitFor(() => expect(window.sessionStorage.getItem(NOTE_KEY)).not.toBeNull());
    // The code itself is never written anywhere.
    expect(window.sessionStorage.getItem(NOTE_KEY)).not.toContain("123456");
    fireEvent.change(await screen.findByTestId("owner-invite-code"), { target: { value: "123456" } });
    fireEvent.change(screen.getByTestId("pw"), { target: { value: "Abcdefgh1234!" } });
    fireEvent.click(screen.getByTestId("owner-invite-terms"));
    fireEvent.click(screen.getByTestId("owner-invite-declaration"));
    fireEvent.submit(screen.getByTestId("owner-invite-form"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/producer/dashboard"));
    expect(window.sessionStorage.getItem(NOTE_KEY)).toBeNull();
    expect(JSON.stringify(window.sessionStorage)).not.toContain("123456");
  });

  it("drops the note when the link turns out to be dead", async () => {
    await sendCodeThenReload();
    expect(window.sessionStorage.getItem(NOTE_KEY)).not.toBeNull();
    api.get.mockRejectedValue({ response: { status: 404 } });
    document.body.innerHTML = "";
    wrap(<OwnerInviteClient />);
    await waitFor(() => expect(window.sessionStorage.getItem("mehamakor.ownerInviteToken")).toBeNull());
    expect(window.sessionStorage.getItem(NOTE_KEY)).toBeNull();
  });

  it("forgets a code the server has already retired (10 minutes)", async () => {
    await sendCodeThenReload();
    const note = JSON.parse(window.sessionStorage.getItem(NOTE_KEY));
    window.sessionStorage.setItem(NOTE_KEY, JSON.stringify({ ...note, sentAt: Date.now() - 10 * 60 * 1000 }));
    document.body.innerHTML = "";
    wrap(<OwnerInviteClient />);
    await screen.findByTestId("owner-invite-form");
    expect(screen.queryByTestId("owner-invite-code-sent")).toBeNull();
  });

  it("restores the address she typed over the one the link carried", async () => {
    window.sessionStorage.setItem("mehamakor.ownerInviteToken", TOKEN);
    // INVITE carries owner@example.com; she sends the code somewhere else.
    const first = wrap(<OwnerInviteClient />);
    fireEvent.change(await screen.findByTestId("owner-invite-email"), { target: { value: ADDRESS } });
    fireEvent.click(screen.getByTestId("owner-invite-send-code"));
    await screen.findByTestId("owner-invite-code-sent");
    first.unmount();
    wrap(<OwnerInviteClient />);
    await screen.findByTestId("owner-invite-form");
    expect(screen.getByTestId("owner-invite-email").value).toBe(ADDRESS);
  });
});
