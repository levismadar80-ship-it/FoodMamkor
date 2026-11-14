/**
 * MEH-3122 — «שלחו לי קישור חדש» on a claim link that is no longer active.
 * Cells: no link at all (contact only) · dead link (both actions) · sending ·
 * sent (confirmation, button gone) · failed (error, can retry).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ClaimClient from "@/app/[locale]/claim/ClaimClient";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  getPathname: ({ href }) => href,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: null, loading: false, logout: vi.fn(), refreshUser: vi.fn() }),
}));
vi.mock("@/components/GoogleAuthButton", () => ({ default: () => null }));
vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));

const C = he.claim.invalid;
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwLTEifQ.sig";
const NEW_LINK = "/producer-claim/new-link-request";
const notFound = () => Object.assign(new Error("404"), { response: { status: 404, data: { detail: "x" } } });

const wrap = (ui) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );

/** Preview answers 404; the new-link request answers with `answer()`. */
const server = (answer) =>
  api.post.mockImplementation((url) => (url === NEW_LINK ? answer() : Promise.reject(notFound())));

const deadLink = async () => {
  window.sessionStorage.setItem("mehamakor.claimToken", TOKEN);
  wrap(<ClaimClient />);
  return screen.findByTestId("claim-new-link");
};

beforeEach(() => {
  api.post.mockReset();
  window.sessionStorage.clear();
});

describe("claim: ask for a new link", () => {
  it("approved copy, word for word (Sapir 14/11)", () => {
    expect(C.new_link).toBe("שלחו לי קישור חדש");
    expect(C.new_link_sent).toBe("קיבלנו. נשלח אליך קישור חדש.");
  });

  it("a bare /claim with no link has only «צרו קשר»: there is no business to ask for", () => {
    wrap(<ClaimClient />);
    expect(screen.getByTestId("claim-invalid")).toBeTruthy();
    expect(screen.queryByTestId("claim-new-link")).toBeNull();
    expect(screen.getByRole("link", { name: C.contact })).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("a link the server refused shows the button first and «צרו קשר» beside it", async () => {
    server(() => Promise.resolve({ data: { ok: true } }));
    const button = await deadLink();
    expect(button.textContent).toBe(C.new_link);
    expect(screen.getByRole("link", { name: C.contact }).getAttribute("href")).toBe("/contact?topic=business");
    expect(screen.queryByTestId("claim-new-link-sent")).toBeNull();
  });

  it("pressing it sends the refused link in the BODY, then shows the confirmation and drops the button", async () => {
    server(() => Promise.resolve({ data: { ok: true } }));
    fireEvent.click(await deadLink());
    expect((await screen.findByTestId("claim-new-link-sent")).textContent).toBe(C.new_link_sent);
    expect(api.post).toHaveBeenCalledWith(NEW_LINK, { token: TOKEN });
    expect(screen.queryByTestId("claim-new-link")).toBeNull();
    expect(screen.getByRole("link", { name: C.contact })).toBeTruthy();
    // The dead link stays out of storage, as before this change.
    expect(window.sessionStorage.getItem("mehamakor.claimToken")).toBeNull();
  });

  it("a double tap sends one request", async () => {
    let release;
    server(() => new Promise((resolve) => (release = resolve)));
    const button = await deadLink();
    fireEvent.click(button);
    fireEvent.click(button);
    release({ data: { ok: true } });
    await screen.findByTestId("claim-new-link-sent");
    expect(api.post.mock.calls.filter(([url]) => url === NEW_LINK)).toHaveLength(1);
  });

  it("a failed request shows the error, keeps the button, and a retry can succeed", async () => {
    let fail = true;
    server(() => (fail ? Promise.reject(new Error("network")) : Promise.resolve({ data: { ok: true } })));
    const button = await deadLink();
    fireEvent.click(button);
    expect(await screen.findByTestId("claim-new-link-error")).toBeTruthy();
    expect(screen.getByTestId("claim-new-link")).toBeTruthy();
    expect(screen.queryByTestId("claim-new-link-sent")).toBeNull();
    fail = false;
    fireEvent.click(screen.getByTestId("claim-new-link"));
    await screen.findByTestId("claim-new-link-sent");
    await waitFor(() => expect(screen.queryByTestId("claim-new-link-error")).toBeNull());
  });

  it("the link is never put in an address the page builds", async () => {
    server(() => Promise.resolve({ data: { ok: true } }));
    fireEvent.click(await deadLink());
    await screen.findByTestId("claim-new-link-sent");
    for (const a of document.querySelectorAll("a")) expect(a.getAttribute("href")).not.toContain(TOKEN);
  });
});
