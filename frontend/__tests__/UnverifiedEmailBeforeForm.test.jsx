/**
 * MEH-2918 — a business whose email is not verified is told BEFORE it fills a
 * publish form, not only after «לפרסם» returns the 403
 * (auth.py:require_verified_producer). Cells: unverified → one notice up
 * front · verified / unknown → none · approval-pending rescue → the pending
 * gate only (no form, so no email line).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
vi.mock("@/lib/api", () => ({
  default: { get: (...a) => get(...a), post: vi.fn(() => new Promise(() => {})), put: vi.fn() },
}));
vi.mock("@/components/CitySearch", () => ({
  default: ({ id, value, onChange }) => <input id={id} value={value || ""} onChange={(e) => onChange(e.target.value)} />,
}));
vi.mock("@/components/AddressSearch", () => ({
  default: ({ id, value, onChange }) => <input id={id} value={value || ""} onChange={(e) => onChange(e.target.value)} />,
}));

const { default: EventForm } = await import("@/components/EventForm");
const { default: ExperienceForm } = await import("@/components/ExperienceForm");
const { default: RescueTab } = await import("@/components/dashboard/RescueTab");

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
});

describe.each([
  ["EventForm", (p) => <EventForm mode="create" {...p} />],
  ["ExperienceForm", (p) => <ExperienceForm mode="create" {...p} />],
])("%s — verified-email notice before the form (MEH-2918)", (_name, make) => {
  it("unverified: exactly one notice on first render, before any submit", () => {
    wrap(make({ emailUnverified: true }));
    expect(notices()).toHaveLength(1);
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
  it("pending + unverified: the pending gate only, no email line", async () => {
    authState.user = { id: "u1", email_verified: false };
    rescueStatus("pending");
    wrap(<RescueTab />);
    await screen.findByTestId("rescue-pending-banner");
    await waitFor(() => expect(screen.queryByTestId("rescue-publish-tomorrow")).toBeNull());
    expect(notices()).toHaveLength(0);
  });
});
