/**
 * MEH-3213 — after «פרסום» the create page must never send the owner to the
 * public /events/<id> while the business's status is unknown. That page is
 * fetched anonymously and 404s for an event of a business that is not live.
 * Cells: approved → public page · pending → in-page success state ·
 * status fetch failed at load, succeeds at submit → decided by the fresh
 * status · status still unknown at submit → the owner's own events list.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

const push = vi.fn();
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", role: "producer", email_verified: true }, loading: false }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
  useRouter: () => ({ push }),
}));
const get = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => get(...a) } }));
// The form itself is not under test: one button that reports a created event.
vi.mock("@/components/EventForm", () => ({
  default: ({ onSuccess }) => (
    <button type="button" onClick={() => onSuccess({ id: "e1" })}>submit</button>
  ),
}));

const { default: NewEventPage } = await import("@/app/[locale]/producer/dashboard/events/new/page");

const PENDING_TITLE = he.sweep_tail.event_new.pending_success_title;
const ok = (status) => Promise.resolve({ data: { status } });
const fail = () => Promise.reject(new Error("network"));

function renderAndSubmit() {
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <NewEventPage />
    </NextIntlClientProvider>,
  );
  return screen.findByText("submit");
}
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  push.mockReset();
  get.mockReset();
});

describe("NewEventPage — where «פרסום» lands (MEH-3213)", () => {
  it("approved business: the public event page", async () => {
    get.mockImplementation(() => ok("approved"));
    const btn = await renderAndSubmit();
    await settle();
    fireEvent.click(btn);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/events/e1"));
  });

  it("pending business: the in-page success state, no redirect", async () => {
    get.mockImplementation(() => ok("pending"));
    const btn = await renderAndSubmit();
    await settle();
    fireEvent.click(btn);
    expect(await screen.findByText(PENDING_TITLE)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("status fetch failed on load, pending at submit: the success state", async () => {
    get.mockImplementationOnce(fail).mockImplementation(() => ok("pending"));
    const btn = await renderAndSubmit();
    await settle();
    fireEvent.click(btn);
    expect(await screen.findByText(PENDING_TITLE)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("status still unknown at submit: the owner's events list, never the public page", async () => {
    get.mockImplementation(fail);
    const btn = await renderAndSubmit();
    await settle();
    fireEvent.click(btn);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/producer/dashboard/events"));
    expect(push).not.toHaveBeenCalledWith("/events/e1");
  });

  it("clicked before the load-time status lands, then a second click: one redirect", async () => {
    let release;
    get.mockImplementationOnce(() => new Promise((r) => { release = r; }))
      .mockImplementation(() => ok("approved"));
    const btn = await renderAndSubmit();
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/events/e1"));
    release({ data: { status: "approved" } });
    await settle();
    expect(push).toHaveBeenCalledTimes(1);
  });
});
