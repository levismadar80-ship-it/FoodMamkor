/**
 * MEH-2324 — the owner-claim page, one test per state of the spec (D10):
 * loading · invalid/expired · already claimed · load error · logged out ·
 * logged in and eligible · admin · already has a business · submit error.
 *
 * Plus the two contracts that are not states:
 *   - the token leaves the address bar on the first render and never appears
 *     in a link the page builds;
 *   - the claim POST carries both declarations, and the grower line folds into
 *     declaration_accepted exactly as registration does.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ClaimClient from "@/app/[locale]/claim/ClaimClient";

const replace = vi.fn();
const push = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  getPathname: ({ href, locale }) => (locale === "he" ? href : `/${locale}${href}`),
  useRouter: () => ({ replace, push }),
}));

let auth;
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => auth,
}));

vi.mock("@/components/GoogleAuthButton", () => ({
  default: () => <div data-testid="google-button" />,
}));

vi.mock("@/lib/api", () => ({
  default: { post: vi.fn() },
}));

const C = he.claim;
const R = he.auth.register.producer;
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwLTEifQ.sig";
const PREVIEW = {
  name: "מאפיית הגבעה",
  city: "קריית טבעון",
  short_description: "לחם מחמצת שנאפה כל בוקר",
  image: null,
  category_names: ["מאפים"],
};

const refreshUser = vi.fn().mockResolvedValue(undefined);
const logout = vi.fn();
const asUser = (user) => {
  auth = { user, loading: false, logout, refreshUser };
};
const OWNER = { id: "u-1", email: "owner@example.com", role: "user", producer_id: null, is_producer: false };

function wrap(ui) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const previewOk = (data = PREVIEW) =>
  api.post.mockImplementation((url) =>
    url === "/producer-claim/preview" ? Promise.resolve({ data }) : Promise.reject(new Error(url)),
  );
const httpError = (status, detail) => Object.assign(new Error(String(status)), { response: { status, data: { detail } } });

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  asUser(null);
});

describe("token handling", () => {
  it("stashes the token from the path and swaps the address to /claim, before any request", () => {
    wrap(<ClaimClient tokenFromPath={TOKEN} />);
    expect(window.sessionStorage.getItem("mehamakor.claimToken")).toBe(TOKEN);
    expect(replace).toHaveBeenCalledWith("/claim");
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByTestId("claim-loading")).toHaveTextContent(C.loading);
  });

  it("/claim with nothing stored shows the invalid-link state, without calling the server", () => {
    wrap(<ClaimClient />);
    expect(screen.getByTestId("claim-invalid")).toHaveTextContent(C.invalid.title);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("/claim reads the stored token and sends it in the preview BODY", async () => {
    window.sessionStorage.setItem("mehamakor.claimToken", TOKEN);
    previewOk();
    wrap(<ClaimClient />);
    expect(await screen.findByTestId("claim-name")).toHaveTextContent(PREVIEW.name);
    expect(api.post).toHaveBeenCalledWith("/producer-claim/preview", { token: TOKEN });
  });
});

describe("states from the preview", () => {
  beforeEach(() => window.sessionStorage.setItem("mehamakor.claimToken", TOKEN));

  it("404 → invalid link, and the dead token is dropped", async () => {
    api.post.mockRejectedValue(httpError(404, "x"));
    wrap(<ClaimClient />);
    expect(await screen.findByTestId("claim-invalid")).toHaveTextContent(C.invalid.body);
    expect(window.sessionStorage.getItem("mehamakor.claimToken")).toBeNull();
  });

  it("409 → already claimed; a guest is offered to sign in", async () => {
    api.post.mockRejectedValue(httpError(409, "x"));
    wrap(<ClaimClient />);
    const box = await screen.findByTestId("claim-claimed");
    expect(box).toHaveTextContent(C.claimed.title);
    expect(screen.getByRole("link", { name: C.claimed.login })).toBeInTheDocument();
  });

  it("409 for a signed-in visitor hides the sign-in link", async () => {
    asUser(OWNER);
    api.post.mockRejectedValue(httpError(409, "x"));
    wrap(<ClaimClient />);
    await screen.findByTestId("claim-claimed");
    expect(screen.queryByRole("link", { name: C.claimed.login })).not.toBeInTheDocument();
  });

  it.each([
    ["a server error", () => api.post.mockRejectedValueOnce(httpError(500))],
    ["a malformed response", () => api.post.mockResolvedValueOnce({ data: { name: "" } })],
  ])("%s → load error with a retry that asks again", async (_label, arrange) => {
    arrange();
    wrap(<ClaimClient />);
    expect(await screen.findByTestId("claim-load-error")).toHaveTextContent(he.error.generic);
    previewOk();
    fireEvent.click(screen.getByTestId("claim-retry"));
    expect(await screen.findByTestId("claim-name")).toHaveTextContent(PREVIEW.name);
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it("shows the draft's public fields and the explainer", async () => {
    previewOk();
    wrap(<ClaimClient />);
    await screen.findByTestId("claim-preview");
    expect(screen.getByText(C.kicker)).toBeInTheDocument();
    expect(screen.getByText(PREVIEW.city)).toBeInTheDocument();
    expect(screen.getByText(PREVIEW.short_description)).toBeInTheDocument();
    expect(screen.getByTestId("claim-explainer")).toHaveTextContent(C.explainer);
  });
});

describe("who is looking", () => {
  beforeEach(() => {
    window.sessionStorage.setItem("mehamakor.claimToken", TOKEN);
    previewOk();
  });

  it("guest: Google, email sign-up and sign-in, all returning to /claim with no token", async () => {
    wrap(<ClaimClient />);
    await screen.findByTestId("claim-logged-out");
    expect(screen.getByTestId("google-button")).toBeInTheDocument();
    expect(screen.getByText(C.logged_out.email_note)).toBeInTheDocument();
    const signup = screen.getByTestId("claim-email-signup").getAttribute("href");
    const login = screen.getByTestId("claim-login").getAttribute("href");
    expect(signup).toBe("/register?redirect=%2Fclaim");
    expect(login).toBe("/login?redirect=%2Fclaim");
    // No link on the page may carry the credential.
    for (const a of document.querySelectorAll("a")) {
      expect(a.getAttribute("href")).not.toContain(TOKEN);
    }
    expect(screen.queryByTestId("claim-form")).not.toBeInTheDocument();
  });

  it("admin: told to switch account, no form", async () => {
    asUser({ ...OWNER, role: "admin" });
    wrap(<ClaimClient />);
    expect(await screen.findByTestId("claim-admin")).toHaveTextContent(C.admin.body);
    expect(screen.queryByTestId("claim-form")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("claim-switch-account"));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["producer_id", { producer_id: "p-other" }],
    ["is_producer", { is_producer: true }],
  ])("already has a business (%s): no form, a way to the dashboard", async (_label, extra) => {
    asUser({ ...OWNER, ...extra });
    wrap(<ClaimClient />);
    expect(await screen.findByTestId("claim-has-business")).toHaveTextContent(C.has_business.body);
    expect(screen.getByRole("link", { name: C.has_business.dashboard })).toHaveAttribute(
      "href",
      "/producer/dashboard",
    );
    expect(screen.queryByTestId("claim-form")).not.toBeInTheDocument();
  });

  it("eligible: signed-in line, the registration boxes verbatim, no grower box for a bakery", async () => {
    asUser(OWNER);
    wrap(<ClaimClient />);
    await screen.findByTestId("claim-form");
    expect(screen.getByText(R.terms.declaration)).toBeInTheDocument();
    expect(screen.queryByTestId("claim-farmer")).not.toBeInTheDocument();
    expect(screen.getByText(/owner@example\.com/)).toBeInTheDocument();
  });
});

describe("submitting", () => {
  beforeEach(() => {
    window.sessionStorage.setItem("mehamakor.claimToken", TOKEN);
    asUser(OWNER);
  });

  const claimOk = (preview = PREVIEW) =>
    api.post.mockImplementation((url) =>
      url === "/producer-claim/preview"
        ? Promise.resolve({ data: preview })
        : Promise.resolve({ data: { producer_id: "p-1", status: "draft" } }),
    );
  const claimCall = () => api.post.mock.calls.find(([url]) => url === "/producer-claim");

  it("asks for each box in order before anything is sent", async () => {
    claimOk();
    wrap(<ClaimClient />);
    await screen.findByTestId("claim-form");
    fireEvent.click(screen.getByTestId("claim-submit"));
    expect(screen.getByTestId("claim-error")).toHaveTextContent(R.validation.terms_required);
    fireEvent.click(screen.getByTestId("claim-terms"));
    fireEvent.click(screen.getByTestId("claim-submit"));
    expect(screen.getByTestId("claim-error")).toHaveTextContent(R.validation.declaration_required);
    expect(claimCall()).toBeUndefined();
  });

  it("posts the token and both boxes, refreshes the user, lands on the dashboard", async () => {
    claimOk();
    wrap(<ClaimClient />);
    await screen.findByTestId("claim-form");
    fireEvent.click(screen.getByTestId("claim-terms"));
    fireEvent.click(screen.getByTestId("claim-declaration"));
    fireEvent.click(screen.getByTestId("claim-submit"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/producer/dashboard"));
    expect(claimCall()[1]).toEqual({ token: TOKEN, declaration_accepted: true, terms_accepted: true });
    expect(refreshUser).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem("mehamakor.claimToken")).toBeNull();
  });

  // refreshUser hands back the new owner (producer_id set) before the dashboard
  // loads. The page must not flash "this account already has a business".
  it("after a successful claim it never shows the has-business view", async () => {
    claimOk();
    refreshUser.mockImplementationOnce(async () => {
      auth = { ...auth, user: { ...auth.user, role: "producer", producer_id: "p-1", is_producer: true } };
    });
    wrap(<ClaimClient />);
    await screen.findByTestId("claim-form");
    fireEvent.click(screen.getByTestId("claim-terms"));
    fireEvent.click(screen.getByTestId("claim-declaration"));
    fireEvent.click(screen.getByTestId("claim-submit"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/producer/dashboard"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId("claim-has-business")).not.toBeInTheDocument();
  });

  // A 2xx means the server already assigned the draft. Reporting failure would
  // send the owner into a retry that answers 409 "already claimed".
  it("a 2xx with an unexpected body still counts as claimed", async () => {
    api.post.mockImplementation((url) =>
      Promise.resolve({ data: url === "/producer-claim/preview" ? PREVIEW : {} }),
    );
    wrap(<ClaimClient />);
    await screen.findByTestId("claim-form");
    fireEvent.click(screen.getByTestId("claim-terms"));
    fireEvent.click(screen.getByTestId("claim-declaration"));
    fireEvent.click(screen.getByTestId("claim-submit"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/producer/dashboard"));
    expect(refreshUser).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem("mehamakor.claimToken")).toBeNull();
    expect(screen.queryByTestId("claim-error")).not.toBeInTheDocument();
  });

  it("a vegetable farm also needs the grower line, which folds into declaration_accepted", async () => {
    claimOk({ ...PREVIEW, category_names: ["ירקות"] });
    wrap(<ClaimClient />);
    await screen.findByTestId("claim-form");
    expect(screen.getByText(R.terms.farmer_declaration)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("claim-terms"));
    fireEvent.click(screen.getByTestId("claim-declaration"));
    fireEvent.click(screen.getByTestId("claim-submit"));
    expect(screen.getByTestId("claim-error")).toHaveTextContent(R.validation.farmer_required);
    expect(claimCall()).toBeUndefined();
    fireEvent.click(screen.getByTestId("claim-farmer"));
    fireEvent.click(screen.getByTestId("claim-submit"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/producer/dashboard"));
    expect(claimCall()[1]).toEqual({ token: TOKEN, declaration_accepted: true, terms_accepted: true });
  });

  it.each([
    ["the server's own reason", httpError(409, "העמוד הזה כבר שויך לחשבון."), "העמוד הזה כבר שויך לחשבון."],
    ["the generic line when there is none", new Error("network"), he.claim.submit_error],
  ])("a failed claim shows %s and stays on the page", async (_label, error, shown) => {
    api.post.mockImplementation((url) =>
      url === "/producer-claim/preview" ? Promise.resolve({ data: PREVIEW }) : Promise.reject(error),
    );
    wrap(<ClaimClient />);
    await screen.findByTestId("claim-form");
    fireEvent.click(screen.getByTestId("claim-terms"));
    fireEvent.click(screen.getByTestId("claim-declaration"));
    fireEvent.click(screen.getByTestId("claim-submit"));
    expect(await screen.findByTestId("claim-error")).toHaveTextContent(shown);
    expect(push).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("mehamakor.claimToken")).toBe(TOKEN);
  });
});
