/**
 * MEH-2768 — /registration/[token]. Cancelling takes one explicit tap (a mail
 * scanner pre-fetching the link must not cancel anyone); an unknown token,
 * an already-cancelled sign-up and a failed cancel each get their own line.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import CancelRegistrationClient from "@/app/[locale]/registration/[token]/CancelRegistrationClient";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));

const X = he.registration.cancel;
const INFO = { kind: "experience", item_id: "x1", title: "סדנת מחמצת", event_date: "2099-12-20", status: "registered" };

function page() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem" onError={() => {}}>
      <CancelRegistrationClient token="tok_abc" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("cancel page", () => {
  it("loads the sign-up, does NOT cancel on load, cancels on the tap", async () => {
    api.get.mockResolvedValue({ data: INFO });
    api.post.mockResolvedValue({ data: { ...INFO, status: "cancelled" } });
    page();
    await waitFor(() => expect(screen.getByRole("heading").textContent).toBe('ביטול הרשמה ל-"סדנת מחמצת"'));
    expect(api.get).toHaveBeenCalledWith("/registrations/tok_abc");
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("registration-cancel-confirm"));
    await waitFor(() => expect(screen.getByTestId("registration-cancel-done").textContent).toBe(X.done));
    expect(api.post).toHaveBeenCalledWith("/registrations/tok_abc/cancel");
    expect(screen.queryByTestId("registration-cancel-confirm")).toBeNull();
    expect(screen.getByText(X.back_experience).getAttribute("href")).toBe("/experiences/x1");
    // the layout owns the one <main> landmark
    expect(document.querySelector("main")).toBeNull();
  });

  it("already cancelled → «ההרשמה בוטלה.», no button", async () => {
    api.get.mockResolvedValue({ data: { ...INFO, kind: "event", status: "cancelled" } });
    page();
    await waitFor(() => expect(screen.getByTestId("registration-cancel-done")).toBeInTheDocument());
    expect(screen.queryByTestId("registration-cancel-confirm")).toBeNull();
    expect(screen.getByText(X.back_event).getAttribute("href")).toBe("/events/x1");
  });

  it("unknown token → the not-found line", async () => {
    api.get.mockRejectedValue({ response: { status: 404 } });
    page();
    await waitFor(() => expect(screen.getByTestId("registration-cancel-missing").textContent).toBe(X.not_found));
  });

  it("a failed cancel keeps the button and says so", async () => {
    api.get.mockResolvedValue({ data: INFO });
    api.post.mockRejectedValue(new Error("500"));
    page();
    await waitFor(() => screen.getByTestId("registration-cancel-confirm"));
    fireEvent.click(screen.getByTestId("registration-cancel-confirm"));
    await waitFor(() => expect(screen.getByText(X.generic)).toBeInTheDocument());
    expect(screen.getByTestId("registration-cancel-confirm")).toBeInTheDocument();
  });
});
