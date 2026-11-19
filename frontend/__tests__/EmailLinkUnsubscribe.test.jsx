import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import NewsletterUnsubscribe from "@/app/[locale]/newsletter/unsubscribe/UnsubscribeClient";
import WaitlistUnsubscribe from "@/app/[locale]/delivery-waitlist/unsubscribe/UnsubscribeClient";

// MEH-3464: the newsletter and delivery-waitlist unsubscribe landings now run
// through components/EmailLinkUnsubscribe.jsx (the weekly summary's landing,
// covered in WeeklySummaryUnsubscribe.test.jsx). Each still posts to its own
// endpoint with its own copy, and gains the weekly page's retry state and
// token stripping.

const post = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ default: { post: (...a) => post(...a) } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));

const CASES = [
  ["newsletter", NewsletterUnsubscribe, "/newsletter/unsubscribe", he.newsletter_unsubscribe],
  ["delivery waitlist", WaitlistUnsubscribe, "/delivery-waitlist/unsubscribe", he.delivery_waitlist_unsubscribe],
];

const renderPage = (Page, token) =>
  render(
    <NextIntlClientProvider locale="he" messages={he}>
      <Page token={token} />
    </NextIntlClientProvider>,
  );

describe.each(CASES)("%s unsubscribe landing", (_name, Page, endpoint, t) => {
  beforeEach(() => {
    post.mockReset();
    window.history.replaceState(null, "", "/he/x?token=tok-1&utm=a");
  });

  it("no token → the invalid-link state, nothing posted", () => {
    renderPage(Page, "");
    expect(screen.getByRole("heading", { name: t.error_title })).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("valid token → posts to its own endpoint, success copy, link home, token gone from the URL", async () => {
    post.mockResolvedValue({ data: {} });
    renderPage(Page, "tok-1");
    await waitFor(() => expect(screen.getByRole("heading", { name: t.success_title })).toBeTruthy());
    expect(post).toHaveBeenCalledWith(endpoint, { token: "tok-1" });
    expect(screen.getByRole("link", { name: t.cta_home }).getAttribute("href")).toBe("/");
    expect(window.location.search).toBe("?utm=a");
  });

  it("400 → the invalid-link copy", async () => {
    post.mockRejectedValue({ response: { status: 400 } });
    renderPage(Page, "bad");
    await waitFor(() => expect(screen.getByRole("heading", { name: t.error_title })).toBeTruthy());
  });

  it("503 → try again (not «the link is broken»), and retry re-posts", async () => {
    post.mockRejectedValueOnce({ response: { status: 503 } });
    renderPage(Page, "tok-1");
    await waitFor(() => expect(screen.getByRole("heading", { name: he.error.generic })).toBeTruthy());
    expect(screen.queryByRole("heading", { name: t.error_title })).toBeNull();
    post.mockResolvedValueOnce({ data: {} });
    fireEvent.click(screen.getByRole("button", { name: he.error.retry }));
    await waitFor(() => expect(screen.getByRole("heading", { name: t.success_title })).toBeTruthy());
    expect(post).toHaveBeenCalledTimes(2);
  });
});
