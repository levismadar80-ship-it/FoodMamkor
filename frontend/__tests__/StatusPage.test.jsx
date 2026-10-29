/**
 * MEH-2567 — one layout for the "something happened" pages. Pins the
 * component's anatomy and that the 404 and newsletter-unsubscribe pages render
 * through it, with no card around them. (Claim + verify-email adoption is
 * pinned in ClaimPage.test.jsx / VerifyEmailNextStep.test.jsx.)
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({ default: { post: vi.fn(() => Promise.reject(new Error("x"))) } }));

import StatusPage from "@/components/StatusPage";
import NotFound from "@/app/[locale]/not-found";
import UnsubscribeClient from "@/app/[locale]/newsletter/unsubscribe/UnsubscribeClient";

const wrap = (ui) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );

const Icon = (props) => <svg data-testid="icon" {...props} />;

function expectNoCard() {
  for (let el = screen.getByTestId("status-page"); el; el = el.parentElement) {
    const cls = (el.className && String(el.className)) || "";
    expect(cls).not.toMatch(/(^|\s)bg-white(\s|$)/);
    expect(cls).not.toMatch(/(^|\s)shadow-/);
  }
}

describe("MEH-2567 · StatusPage", () => {
  it("icon → title (h1) → body → primary link → secondary link", () => {
    render(
      <StatusPage
        icon={Icon}
        eyebrow="404"
        title="כותרת"
        body="שורה"
        primary={{ href: "/", label: "ראשי" }}
        secondary={{ href: "/map", label: "משני" }}
      />,
    );
    expect(screen.getByTestId("icon")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("כותרת");
    expect(screen.getByRole("link", { name: "ראשי" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "משני" })).toHaveAttribute("href", "/map");
    expectNoCard();
  });

  it("an action with onClick renders a button (retry), and no secondary renders nothing", () => {
    const onClick = vi.fn();
    render(<StatusPage title="x" primary={{ label: "שוב", onClick, testid: "retry" }} />);
    fireEvent.click(screen.getByTestId("retry"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("the 404 page renders through it", () => {
    wrap(<NotFound />);
    expect(screen.getByTestId("status-page")).toHaveTextContent(he.errors.not_found.heading);
    expectNoCard();
  });

  it("newsletter unsubscribe (bad link) renders through it, without its old card", () => {
    wrap(<UnsubscribeClient token={null} />);
    expect(screen.getByTestId("status-page")).toHaveTextContent(he.newsletter_unsubscribe.error_title);
    expectNoCard();
  });
});
