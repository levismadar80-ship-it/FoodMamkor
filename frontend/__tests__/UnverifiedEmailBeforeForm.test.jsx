/**
 * MEH-2918 — a business whose email is not verified is told BEFORE it fills a
 * publish form, not only after «לפרסם» returns the 403
 * (auth.py:require_verified_producer). Cells: unverified → one notice up
 * front (not an alert) · verified / field missing → none · approval-pending
 * rescue → the pending gate only · a publish 403 → still ONE mention, and the
 * notice re-mounts as an alert so the press visibly answers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

const GATE = he.auth.verify.publish_gate;

const authState = { user: null };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: authState.user, loading: false }),
  useOptionalAuth: () => ({ user: authState.user, loading: false }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>
  ),
  useRouter: () => ({ push: vi.fn() }),
}));
const get = vi.fn();
const post = vi.fn(() => new Promise(() => {}));
vi.mock("@/lib/api", () => ({
  default: { get: (...a) => get(...a), post: (...a) => post(...a), put: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/CitySearch", () => ({
  default: ({ id, value, onChange }) => <input id={id} value={value || ""} onChange={(e) => onChange(e.target.value)} />,
}));
vi.mock("@/components/AddressSearch", () => ({
  default: ({ id, value, onChange }) => <input id={id} value={value || ""} onChange={(e) => onChange(e.target.value)} />,
}));

const { default: EventForm } = await import("@/components/EventForm");
const { default: ExperienceForm } = await import("@/components/ExperienceForm");
const { default: RescueTab } = await import("@/components/dashboard/RescueTab");
const { default: NewEventPage } = await import("@/app/[locale]/producer/dashboard/events/new/page");
const { default: NewExperiencePage } = await import("@/app/[locale]/producer/dashboard/experiences/new/page");

// The 403 the server sends for an unverified email (auth.py:require_verified_producer).
const EMAIL_403 = Object.assign(new Error("403"), {
  response: { status: 403, data: { detail: { code: "email_unverified", message: "יש לאמת את כתובת האימייל תחילה" } } },
});
// Every element whose OWN text carries the gate sentence, in any wording.
const gateMentions = () =>
  [...document.querySelectorAll("body *")].filter((el) =>
    [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.includes("יש לאמת את כתובת האימייל תחילה")),
  );

const wrap = (node) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {node}
    </NextIntlClientProvider>,
  );

const notices = () => screen.queryAllByText(GATE);

function rescueStatus(status) {
  get.mockImplementation((url) => {
    if (url === "/producers/me") return Promise.resolve({ data: { name: "מאפיית בדיקה", status } });
    if (url === "/producers/me/locations") return Promise.resolve({ data: [{ id: "l", location_precision: "exact" }] });
    if (String(url).includes("typical-items")) return Promise.resolve({ data: { items: [] } });
    return Promise.resolve({ data: [] });
  });
}

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ data: [] });
  authState.user = null;
  post.mockReset();
  post.mockImplementation(() => new Promise(() => {}));
});

describe.each([
  ["events/new", () => <NewEventPage />],
  ["experiences/new", () => <NewExperiencePage />],
])("%s page passes the user's state to the form (MEH-2918)", (_name, make) => {
  it("unverified producer: the notice is on the page before any submit", async () => {
    authState.user = { id: "u1", role: "producer", email_verified: false };
    wrap(make());
    await waitFor(() => expect(notices()).toHaveLength(1));
  });
  it("verified producer: no notice", async () => {
    authState.user = { id: "u1", role: "producer", email_verified: true };
    wrap(make());
    await new Promise((r) => setTimeout(r, 0));
    expect(notices()).toHaveLength(0);
  });
  it("user without the field (unknown): no notice", async () => {
    authState.user = { id: "u1", role: "producer" };
    wrap(make());
    await new Promise((r) => setTimeout(r, 0));
    expect(notices()).toHaveLength(0);
  });
});

describe.each([
  ["EventForm", (p) => <EventForm mode="create" {...p} />],
  ["ExperienceForm", (p) => <ExperienceForm mode="create" {...p} />],
])("%s — verified-email notice before the form (MEH-2918)", (_name, make) => {
  it("unverified: exactly one notice on first render, before any submit", () => {
    wrap(make({ emailUnverified: true }));
    expect(notices()).toHaveLength(1);
    // A standing condition: read in order, not announced over the page.
    expect(screen.getByTestId("unverified-email-notice").getAttribute("role")).toBeNull();
  });
  it("verified: no notice", () => {
    wrap(make({ emailUnverified: false }));
    expect(notices()).toHaveLength(0);
  });
});

describe("RescueTab — verified-email notice (MEH-2918)", () => {
  it("approved + unverified: one notice inside the publish form", async () => {
    authState.user = { id: "u1", email_verified: false };
    rescueStatus("approved");
    wrap(<RescueTab />);
    await screen.findByTestId("rescue-publish-tomorrow");
    expect(notices()).toHaveLength(1);
  });
  it("approved + verified: no notice", async () => {
    authState.user = { id: "u1", email_verified: true };
    rescueStatus("approved");
    wrap(<RescueTab />);
    await screen.findByTestId("rescue-publish-tomorrow");
    expect(notices()).toHaveLength(0);
  });
  it("approved + unverified, publish 403s: still one mention, not the 403 text a second time", async () => {
    authState.user = { id: "u1", email_verified: false };
    rescueStatus("approved");
    post.mockImplementation(() => Promise.reject(EMAIL_403));
    wrap(<RescueTab />);
    fireEvent.click(await screen.findByTestId("rescue-publish-tomorrow"));
    await waitFor(() => expect(post).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(gateMentions()).toHaveLength(1);
    // …and the press answered: the notice is re-mounted as an alert.
    expect(screen.getByTestId("unverified-email-notice").getAttribute("role")).toBe("alert");
  });
  it("stale verified flag, publish 403s: the notice appears once", async () => {
    authState.user = { id: "u1", email_verified: true };
    rescueStatus("approved");
    post.mockImplementation(() => Promise.reject(EMAIL_403));
    wrap(<RescueTab />);
    fireEvent.click(await screen.findByTestId("rescue-publish-tomorrow"));
    await waitFor(() => expect(notices()).toHaveLength(1));
    expect(gateMentions()).toHaveLength(1);
  });
  it("pending + unverified: the pending gate only, no email line", async () => {
    authState.user = { id: "u1", email_verified: false };
    rescueStatus("pending");
    wrap(<RescueTab />);
    await screen.findByTestId("rescue-pending-banner");
    await waitFor(() => expect(screen.queryByTestId("rescue-publish-tomorrow")).toBeNull());
    expect(notices()).toHaveLength(0);
  });
});
