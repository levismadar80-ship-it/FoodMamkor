/**
 * MEH-3873 — an admin adds and edits a business's events from its admin edit
 * page, with the «בית העסק אישר בכתב» box on every save.
 *
 * Two subjects: EventForm in admin mode (where it saves, the consent box), and
 * AdminBusinessEventsPanel's states — 0 / 1 / many events × form closed / open.
 *
 * REUSES: __tests__/EventFormSubmitValidation.test.jsx (EventForm harness).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import EventForm from "@/components/EventForm";
import AdminBusinessEventsPanel from "@/components/admin/AdminBusinessEventsPanel";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })), post: vi.fn(), put: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/CitySearch", () => ({
  default: ({ id, value, onChange }) => (
    <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("@/components/AddressSearch", () => ({
  default: ({ id, value, onChange }) => (
    <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
const apiState = vi.hoisted(() => ({ rows: /** @type {any[]} */ ([]), mutate: vi.fn() }));
vi.mock("@/lib/use-api", () => ({
  useUserApi: () => ({ data: apiState.rows, error: null, isLoading: false, mutate: apiState.mutate }),
}));
vi.mock("@/lib/use-israel-today", () => ({ default: () => "2026-11-25" }));

const T = he.sweep_tail.event_new;
const A = he.admin.business_events;

function wrap(node) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {node}
    </NextIntlClientProvider>,
  );
}

function fillValid() {
  fireEvent.change(document.getElementById("title"), { target: { value: "קטיף פטל" } });
  fireEvent.change(document.getElementById("event_date"), { target: { value: "2099-01-01" } });
  fireEvent.change(document.getElementById("category"), { target: { value: "קטיף" } });
  fireEvent.change(document.getElementById("city"), { target: { value: "גבעת עדה" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  apiState.rows = [];
});

describe("EventForm in admin mode", () => {
  it("reads the business's saved locations from the admin route", async () => {
    wrap(<EventForm adminProducerId="p1" />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/admin/producers/p1/locations"));
    expect(api.get).not.toHaveBeenCalledWith("/producers/me/locations");
  });

  it("refuses to save until the consent box is ticked", () => {
    wrap(<EventForm adminProducerId="p1" />);
    fillValid();
    fireEvent.click(screen.getByText(T.submit));
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByText(A.consent_required)).toBeTruthy();
  });

  it("with consent, posts to the business's admin route with owner_consent", async () => {
    api.post.mockResolvedValue({ data: { id: "e-new" } });
    wrap(<EventForm adminProducerId="p1" />);
    fillValid();
    fireEvent.click(screen.getByTestId("event-owner-consent"));
    fireEvent.click(screen.getByText(T.submit));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/admin/producers/p1/events",
        expect.objectContaining({ title: "קטיף פטל", owner_consent: true }),
      ),
    );
  });

  it("an edit goes to PUT /admin/events/{id}", async () => {
    api.put.mockResolvedValue({ data: { id: "e1" } });
    const initial = {
      id: "e1", title: "יום שוק", event_date: "2099-02-01", category: "שוק", city: "גבעת עדה",
      registration_method: "site_form",
    };
    wrap(<EventForm mode="edit" initial={initial} adminProducerId="p1" />);
    fireEvent.click(screen.getByTestId("event-owner-consent"));
    fireEvent.click(screen.getByText(T.save));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/admin/events/e1", expect.objectContaining({ owner_consent: true })),
    );
  });

  it("the owner's form has no consent box and still posts to /events", async () => {
    api.post.mockResolvedValue({ data: { id: 3 } });
    wrap(<EventForm />);
    expect(screen.queryByTestId("event-owner-consent")).toBeNull();
    fillValid();
    fireEvent.click(screen.getByText(T.submit));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/events", expect.not.objectContaining({ owner_consent: true })));
  });
});

describe("AdminBusinessEventsPanel", () => {
  const row = (over) => ({ id: "e1", title: "יום שוק", event_date: "2026-12-03", is_active: true, ...over });

  it("0 events, closed: the empty line and the add button, no form", () => {
    wrap(<AdminBusinessEventsPanel producerId="p1" />);
    expect(screen.getByText(A.empty)).toBeTruthy();
    expect(screen.queryByTestId("admin-business-events-list")).toBeNull();
    expect(screen.queryByTestId("event-owner-consent")).toBeNull();
    expect(screen.getByText(A.add)).toBeTruthy();
  });

  it("0 events, open: the add button opens the form, cancel closes it", () => {
    wrap(<AdminBusinessEventsPanel producerId="p1" />);
    fireEvent.click(screen.getByText(A.add));
    expect(screen.getByTestId("event-owner-consent")).toBeTruthy();
    expect(screen.queryByText(A.add)).toBeNull();
    fireEvent.click(screen.getByText(T.cancel));
    expect(screen.queryByTestId("event-owner-consent")).toBeNull();
    expect(screen.getByText(A.add)).toBeTruthy();
  });

  it("1 event, closed: one row with its edit button, no empty line", () => {
    apiState.rows = [row()];
    wrap(<AdminBusinessEventsPanel producerId="p1" />);
    expect(screen.getAllByTestId("admin-business-event-edit")).toHaveLength(1);
    expect(screen.queryByText(A.empty)).toBeNull();
  });

  it("1 event, open: edit opens the form filled with that event", () => {
    apiState.rows = [row()];
    wrap(<AdminBusinessEventsPanel producerId="p1" />);
    fireEvent.click(screen.getByTestId("admin-business-event-edit"));
    expect(/** @type {HTMLInputElement} */ (document.getElementById("title")).value).toBe("יום שוק");
    expect(screen.getByText(T.save)).toBeTruthy();
  });

  it("1 event, duplicate: the form opens as a NEW event with the fields kept and the date empty", async () => {
    api.post.mockResolvedValue({ data: { id: "e-copy" } });
    apiState.rows = [row({ title: "קטיף פטל", category: "קטיף", city: "גבעת עדה" })];
    wrap(<AdminBusinessEventsPanel producerId="p1" />);
    fireEvent.click(screen.getByTestId("admin-business-event-copy"));
    expect(/** @type {HTMLInputElement} */ (document.getElementById("title")).value).toBe("קטיף פטל");
    expect(/** @type {HTMLInputElement} */ (document.getElementById("event_date")).value).toBe("");
    fireEvent.change(document.getElementById("event_date"), { target: { value: "2099-03-01" } });
    fireEvent.click(screen.getByTestId("event-owner-consent"));
    fireEvent.click(screen.getByText(T.submit));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/admin/producers/p1/events",
        expect.objectContaining({ title: "קטיף פטל", event_date: "2099-03-01", owner_consent: true }),
      ),
    );
    expect(api.put).not.toHaveBeenCalled();
  });

  it("many events, closed: a row each, with the cancelled and past badges", () => {
    apiState.rows = [
      row({ id: "a", title: "בקרוב" }),
      row({ id: "b", title: "מבוטל", is_active: false }),
      row({ id: "c", title: "עבר", event_date: "2026-10-01" }),
    ];
    wrap(<AdminBusinessEventsPanel producerId="p1" />);
    expect(screen.getAllByTestId("admin-business-event-edit")).toHaveLength(3);
    expect(screen.getAllByText(A.cancelled)).toHaveLength(1);
    expect(screen.getAllByText(A.past)).toHaveLength(1);
  });

  it("many events, open: editing one disables the other rows' edit buttons", () => {
    apiState.rows = [row({ id: "a", title: "ראשון" }), row({ id: "b", title: "שני" })];
    wrap(<AdminBusinessEventsPanel producerId="p1" />);
    const [first, second] = screen.getAllByTestId("admin-business-event-edit");
    fireEvent.click(second);
    expect(/** @type {HTMLInputElement} */ (document.getElementById("title")).value).toBe("שני");
    expect(/** @type {HTMLButtonElement} */ (first).disabled).toBe(true);
  });
});
