import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";
import UnsubscribeClient from "@/app/[locale]/unsubscribe/weekly/UnsubscribeClient";

// MEH-3079: the «להפסקת הסיכום השבועי» landing. Three states — no token
// (error, nothing posted) · valid token (success, posted once with the token)
// · rejected token (error) — rendered with the REAL he.json strings.

const post = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ default: { post: (...a) => post(...a) } }));
vi.mock("@/i18n/navigation", () => ({
  // eslint-disable-next-line jsx-a11y/anchor-has-content
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));

const t = he.weekly_summary_unsubscribe;

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

  it("he and en carry the same keys", () => {
    expect(Object.keys(en.weekly_summary_unsubscribe).sort()).toEqual(Object.keys(t).sort());
  });
});
