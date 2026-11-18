import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import ConfirmClient from "@/app/[locale]/newsletter/confirm/ConfirmClient";

// MEH-3300 (D13): the double opt-in landing. The load-bearing rule: opening
// the link confirms NOTHING (mail scanners open links); only the button click
// POSTs. States: no token · idle → click → success · 400 → invalid · 503 →
// retry that re-posts. Real he.json strings (approved 11, 12; string 8 in the
// footer).

const post = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ default: { post: (...a) => post(...a) } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));

const t = he.newsletter_confirm;

function renderPage(token) {
  return render(
    <NextIntlClientProvider locale="he" messages={he}>
      <ConfirmClient token={token} />
    </NextIntlClientProvider>,
  );
}

describe("newsletter confirm page (MEH-3300)", () => {
  beforeEach(() => {
    post.mockReset();
    window.history.replaceState(null, "", "/newsletter/confirm?token=abc");
  });

  it("opening the page posts nothing; the button is the approved string 11", () => {
    renderPage("abc");
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByTestId("newsletter-confirm-button").textContent).toBe("אישור הרשמה");
    expect(window.location.search).toBe("");
  });

  it("click posts the token once and shows approved string 12", async () => {
    post.mockResolvedValue({ data: {} });
    renderPage("abc");
    fireEvent.click(screen.getByTestId("newsletter-confirm-button"));
    await screen.findByTestId("newsletter-confirm-success");
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/newsletter/confirm", { token: "abc" });
    expect(`${t.success_title} ${t.success_body}`).toBe(
      "ההרשמה אושרה. נכתוב כשיש משהו ששווה לספר.",
    );
    expect(screen.getByText(t.success_title)).toBeTruthy();
  });

  it("a refused token (400) lands on the invalid-link state", async () => {
    post.mockRejectedValue({ response: { status: 400 } });
    renderPage("abc");
    fireEvent.click(screen.getByTestId("newsletter-confirm-button"));
    await screen.findByTestId("newsletter-confirm-invalid");
  });

  it("a 503 offers a retry that posts again", async () => {
    post.mockRejectedValueOnce({ response: { status: 503 } }).mockResolvedValue({ data: {} });
    renderPage("abc");
    fireEvent.click(screen.getByTestId("newsletter-confirm-button"));
    fireEvent.click(await screen.findByTestId("newsletter-confirm-retry"));
    await screen.findByTestId("newsletter-confirm-success");
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  });

  it("no token goes straight to invalid and posts nothing", () => {
    renderPage("");
    expect(screen.getByTestId("newsletter-confirm-invalid")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("the footer success line is approved string 8", () => {
    expect(he.nav.footer.newsletter_success).toBe(
      "שלחנו מייל לאישור. ההרשמה תושלם אחרי לחיצה על הקישור שבו.",
    );
  });
});
