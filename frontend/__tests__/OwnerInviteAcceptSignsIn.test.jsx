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
