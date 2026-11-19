/**
 * MEH-3438 — «שכפול» through the real pages (the hook alone is in
 * MEH3438LessTyping.test.jsx). Cells:
 *   events/new: ?from=<own id> → seeded form + copied-from line, date empty ·
 *               no ?from → the form at once, no skeleton, no line, no request.
 *   experiences list: each row links «שכפול» to new?from=<id>.
 * The forms are stubbed to expose `initial`: what they do with it is their
 * seed() whitelist (EventForm.jsx / ExperienceForm.jsx), unchanged here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

const get = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ default: { get: (...a) => get(...a), put: vi.fn(), delete: vi.fn() } }));
const AUTH = { user: { id: "u1", role: "producer", email_verified: true }, loading: false };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => AUTH }));
const ROUTER = { push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => ROUTER }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ROUTER,
  Link: ({ href, children, ...rest }) => <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>,
}));
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/EventForm", () => ({
  default: ({ initial }) => (
    <form data-testid="event-form" data-title={initial?.title ?? ""} data-date={initial ? initial.event_date : "none"} data-id={String(initial?.id)} />
  ),
}));

const wrap = (el) => render(<NextIntlClientProvider locale="he" messages={he} onError={() => {}}>{el}</NextIntlClientProvider>);

beforeEach(() => {
  get.mockReset();
  window.history.replaceState(null, "", "/");
});
afterEach(cleanup);

describe("events/new with ?from (MEH-3438)", () => {
  it("own id: the form opens seeded, date empty, id dropped, with the copied-from line", async () => {
    window.history.replaceState(null, "", "/?from=e1");
    get.mockImplementation((url) =>
      Promise.resolve({ data: url === "/events/mine" ? [{ id: "e1", title: "סדנת לחם", event_date: "2099-01-01" }] : { status: "approved" } }),
    );
    const { default: NewEventPage } = await import("@/app/[locale]/producer/dashboard/events/new/page");
    wrap(<NewEventPage />);
    const form = await screen.findByTestId("event-form");
    expect(form).toHaveAttribute("data-title", "סדנת לחם");
    expect(form).toHaveAttribute("data-date", "");
    expect(form).toHaveAttribute("data-id", "undefined");
    expect(screen.getByTestId("duplicate-note")).toHaveTextContent("הפרטים הועתקו מ«סדנת לחם». נשאר לבחור תאריך.");
  });

  it("no ?from: the form is there on the first render, with no line and no list request", async () => {
    get.mockResolvedValue({ data: { status: "approved" } });
    const { default: NewEventPage } = await import("@/app/[locale]/producer/dashboard/events/new/page");
    wrap(<NewEventPage />);
    expect(screen.getByTestId("event-form")).toHaveAttribute("data-date", "none");
    expect(screen.queryByTestId("duplicate-note")).toBeNull();
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(get).not.toHaveBeenCalledWith("/events/mine");
  });
});

describe("experiences list «שכפול» (MEH-3438)", () => {
  it("each row links to the create form with ?from=<id>", async () => {
    get.mockResolvedValue({
      data: [{ id: "x1", title: "סיור במטע", event_date: "2099-01-01", status: "approved", is_active: true, city: "חדרה" }],
    });
    const { default: ManageExperiencesPage } = await import("@/app/[locale]/producer/dashboard/experiences/page");
    wrap(<ManageExperiencesPage />);
    const link = await screen.findByTestId("duplicate-x1");
    expect(link).toHaveAttribute("href", "/producer/dashboard/experiences/new?from=x1");
    expect(link).toHaveTextContent(he.dashboard.producer.manage_experiences.action_duplicate);
  });
});
