import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";
import UnsubscribeClient from "@/app/[locale]/unsubscribe/weekly/UnsubscribeClient";

// MEH-3079: the «להפסקת הסיכום השבועי» landing. States — no token (invalid,
// nothing posted) · valid token (success, posted once with the token) ·
// rejected token 400 (invalid link) · 429 / 5xx / network (try again, with a
// retry that re-posts) — rendered with the REAL he.json strings. Also: the
// token is dropped from the address bar once read.

const post = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ default: { post: (...a) => post(...a) } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));

const t = he.weekly_summary_unsubscribe;
const tErr = he.error;

function renderPage(token) {
  return render(
    <NextIntlClientProvider locale="he" messages={he}>
      <UnsubscribeClient token={token} />
    </NextIntlClientProvider>,
  );
}

describe("weekly summary unsubscribe page", () => {
  // Braces matter: a function returned from beforeEach is run as its teardown.
  beforeEach(() => {
    post.mockReset();
    window.history.replaceState(null, "", "/");
  });

  it("no token → the error state, and nothing is posted", () => {
    renderPage("");
    expect(screen.getByRole("heading", { name: t.error_title })).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("valid token → posts it once and shows the confirmation with a link to insights", async () => {
    post.mockResolvedValue({ data: {} });
    renderPage("tok-123");
    await waitFor(() => expect(screen.getByRole("heading", { name: t.success_title })).toBeTruthy());
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/weekly-summary/unsubscribe", { token: "tok-123" });
    expect(screen.getByText(t.success_body)).toBeTruthy();
    expect(screen.getByRole("link", { name: t.cta_insights }).getAttribute("href")).toBe(
      "/producer/dashboard/insights",
    );
  });

  it("rejected token → the error state with a link home", async () => {
    post.mockRejectedValue({ response: { status: 400 } });
    renderPage("bad");
    await waitFor(() => expect(screen.getByRole("heading", { name: t.error_title })).toBeTruthy());
    expect(screen.getByRole("link", { name: t.cta_home }).getAttribute("href")).toBe("/");
  });

  it("429 → the try-again state (not the invalid-link copy), and retry re-posts", async () => {
    post.mockRejectedValueOnce({ response: { status: 429 } });
    renderPage("tok-429");
    await waitFor(() => expect(screen.getByRole("heading", { name: tErr.generic })).toBeTruthy());
    expect(screen.queryByRole("heading", { name: t.error_title })).toBeNull();
    post.mockResolvedValueOnce({ data: {} });
    fireEvent.click(screen.getByRole("button", { name: tErr.retry }));
    await waitFor(() => expect(screen.getByRole("heading", { name: t.success_title })).toBeTruthy());
    expect(post).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["5xx", { response: { status: 503 } }],
    ["network", new Error("Network Error")],
  ])("%s → the try-again state", async (_name, err) => {
    post.mockRejectedValue(err);
    renderPage("tok-x");
    await waitFor(() => expect(screen.getByRole("heading", { name: tErr.generic })).toBeTruthy());
  });

  it("drops ?token= from the address bar, keeping the localized path", async () => {
    window.history.replaceState(null, "", "/en/unsubscribe/weekly?token=tok-url&utm=x");
    post.mockResolvedValue({ data: {} });
    renderPage("tok-url");
    await waitFor(() => expect(screen.getByRole("heading", { name: t.success_title })).toBeTruthy());
    expect(window.location.pathname).toBe("/en/unsubscribe/weekly");
    expect(window.location.search).toBe("?utm=x");
    expect(window.location.href).not.toContain("tok-url");
  });

  it("he and en carry the same keys", () => {
    expect(Object.keys(en.weekly_summary_unsubscribe).sort()).toEqual(Object.keys(t).sort());
  });
});
