import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import ConfirmClient from "@/app/[locale]/freshness/confirm/ConfirmClient";

// Page freshness: the «כן, הכול נכון» landing from the monthly owner email.
// Unlike the unsubscribe page it must NOT post on mount (a mail scanner that
// runs JavaScript would confirm a page nobody looked at): the owner presses
// the button. States — ask · done · dead (no token, 404, 422) · retry.

const post = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ default: { post: (...a) => post(...a) } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));

const t = he.page_freshness;
const tErr = he.error;

function renderPage(token) {
  return render(
    <NextIntlClientProvider locale="he" messages={he}>
      <ConfirmClient token={token} />
    </NextIntlClientProvider>,
  );
}

describe("page freshness confirm page", () => {
  beforeEach(() => {
    post.mockReset();
    window.history.replaceState(null, "", "/");
  });

  it("opening the link posts nothing — only the button confirms", async () => {
    renderPage("tok-1");
    expect(screen.getByRole("heading", { name: t.ask_title })).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: t.cta_update }).getAttribute("href")).toBe("/producer/dashboard");
  });

  it("pressing «כן, הכול נכון» posts the token once and thanks her", async () => {
    post.mockResolvedValue({ data: {} });
    renderPage("tok-2");
    fireEvent.click(screen.getByRole("button", { name: t.cta_yes }));
    await waitFor(() => expect(screen.getByRole("heading", { name: t.done_title })).toBeTruthy());
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/page-freshness/confirm", { token: "tok-2" });
  });

  it.each([404, 422])("a dead link (%i) → the dead-link state with the dashboard link", async (status) => {
    post.mockRejectedValue({ response: { status } });
    renderPage("old");
    fireEvent.click(screen.getByRole("button", { name: t.cta_yes }));
    await waitFor(() => expect(screen.getByRole("heading", { name: t.dead_title })).toBeTruthy());
    expect(screen.getByRole("link", { name: t.cta_update }).getAttribute("href")).toBe("/producer/dashboard");
  });

  it("no token → the dead-link state, nothing posted", () => {
    renderPage("");
    expect(screen.getByRole("heading", { name: t.dead_title })).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("a server error → retry, which posts again", async () => {
    post.mockRejectedValueOnce({ response: { status: 500 } }).mockResolvedValueOnce({ data: {} });
    renderPage("tok-3");
    fireEvent.click(screen.getByRole("button", { name: t.cta_yes }));
    await waitFor(() => expect(screen.getByRole("heading", { name: tErr.generic })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: tErr.retry }));
    await waitFor(() => expect(screen.getByRole("heading", { name: t.done_title })).toBeTruthy());
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("drops the token from the address bar", () => {
    window.history.replaceState(null, "", "/he/freshness/confirm?token=secret");
    renderPage("secret");
    expect(window.location.search).toBe("");
  });
});
