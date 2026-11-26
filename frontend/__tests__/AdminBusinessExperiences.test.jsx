/**
 * MEH-3876 — an admin adds and edits a business's experiences from its admin
 * edit page, with the «בית העסק אישר בכתב» box on every save.
 *
 * Two subjects: ExperienceForm in admin mode (where it saves, the consent
 * box), and AdminBusinessExperiencesPanel's states — no owner account ·
 * 0 / 1 / many experiences × form closed / open.
 *
 * REUSES: __tests__/AdminBusinessEvents.test.jsx (MEH-3873, the events twin).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ExperienceForm from "@/components/ExperienceForm";
import AdminBusinessExperiencesPanel from "@/components/admin/AdminBusinessExperiencesPanel";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: {} })), post: vi.fn(), put: vi.fn() },
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
vi.mock("@/lib/use-israel-today", () => ({ default: () => "2026-11-26" }));

const T = he.experiences.new;
const A = he.admin.business_experiences;
const M = he.dashboard.producer.manage_experiences;

/** A complete row: the client gate lets it through as it is. */
const ROW = {
  id: "ex-1",
  title: "סדנת ריבות מהשדה",
  description: "סדנה מעשית של שעתיים: מכינות ריבה מפירות שנקטפו באותו בוקר.",
  event_date: "2099-01-10",
  city: "גבעת עדה",
  location_type: "public",
  status: "approved",
  is_active: true,
  registration_method: "site_form",
};

function wrap(node) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {node}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiState.rows = [];
});

describe("ExperienceForm in admin mode", () => {
  it("reads the business's phone from the admin route, not the admin's own account", async () => {
    wrap(<ExperienceForm adminProducerId="p1" />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/admin/producers/p1"));
    expect(api.get).not.toHaveBeenCalledWith("/producers/me");
  });

  it("refuses to save until the consent box is ticked", () => {
    wrap(<ExperienceForm mode="edit" initial={ROW} adminProducerId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: T.save_cta }));
    expect(api.put).not.toHaveBeenCalled();
    expect(screen.getByText(he.admin.business_events.consent_required)).toBeTruthy();
  });

  it("an edit with consent goes to PUT /admin/experiences/{id} with owner_consent", async () => {
    api.put.mockResolvedValue({ data: { id: "ex-1" } });
    wrap(<ExperienceForm mode="edit" initial={ROW} adminProducerId="p1" />);
    fireEvent.click(screen.getByTestId("experience-owner-consent"));
    fireEvent.click(screen.getByRole("button", { name: T.save_cta }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        "/admin/experiences/ex-1",
        expect.objectContaining({ title: ROW.title, owner_consent: true }),
      ),
    );
  });

  it("a new one with consent posts to the business's admin route", async () => {
    api.post.mockResolvedValue({ data: { id: "ex-new" } });
    wrap(<ExperienceForm initial={{ ...ROW, id: undefined }} adminProducerId="p1" />);
    fireEvent.click(screen.getByTestId("experience-owner-consent"));
    fireEvent.click(screen.getByRole("button", { name: T.submit_cta }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/admin/producers/p1/experiences",
        expect.objectContaining({ owner_consent: true }),
      ),
    );
    expect(api.post).not.toHaveBeenCalledWith("/experiences", expect.anything());
  });

  it("the owner's form has no consent box and still saves to PUT /experiences/{id}", async () => {
    api.put.mockResolvedValue({ data: {} });
    wrap(<ExperienceForm mode="edit" initial={ROW} />);
    expect(screen.queryByTestId("experience-owner-consent")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: T.save_cta }));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const [url, body] = api.put.mock.calls[0];
    expect(url).toBe("/experiences/ex-1");
    expect(body).not.toHaveProperty("owner_consent");
  });
});

describe("AdminBusinessExperiencesPanel", () => {
  it("no owner account: the explanation, and no add button", () => {
    wrap(<AdminBusinessExperiencesPanel producerId="p1" hasOwner={false} />);
    expect(screen.getByTestId("admin-business-experiences-no-owner").textContent).toBe(A.no_owner);
    expect(screen.queryByTestId("admin-business-experience-add")).toBeNull();
  });

  it("owner flag not hydrated (null): fails closed, no add button", () => {
    wrap(<AdminBusinessExperiencesPanel producerId="p1" hasOwner={null} />);
    expect(screen.queryByTestId("admin-business-experience-add")).toBeNull();
    expect(screen.getByTestId("admin-business-experiences-no-owner")).toBeTruthy();
  });

  it("0 experiences, closed: the empty line and «הוספת חוויה»", () => {
    wrap(<AdminBusinessExperiencesPanel producerId="p1" hasOwner />);
    expect(screen.getByTestId("admin-business-experiences-empty").textContent).toBe(A.empty);
    expect(screen.getByTestId("admin-business-experience-add").textContent).toBe(A.add);
    expect(screen.queryByTestId("admin-business-experiences-list")).toBeNull();
  });

  it("0 experiences, open: the form with the consent box, cancel closes it", () => {
    wrap(<AdminBusinessExperiencesPanel producerId="p1" hasOwner />);
    fireEvent.click(screen.getByTestId("admin-business-experience-add"));
    expect(screen.getByTestId("experience-owner-consent")).toBeTruthy();
    expect(screen.queryByTestId("admin-business-experience-add")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: T.cancel }));
    expect(screen.queryByTestId("experience-owner-consent")).toBeNull();
    expect(screen.getByTestId("admin-business-experience-add")).toBeTruthy();
  });

  it("1 experience, closed: one row with its status, no empty line", () => {
    apiState.rows = [{ ...ROW, status: "pending" }];
    wrap(<AdminBusinessExperiencesPanel producerId="p1" hasOwner />);
    const items = screen.getByTestId("admin-business-experiences-list").querySelectorAll("li");
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain(ROW.title);
    expect(items[0].textContent).toContain(M.status_pending);
    expect(screen.queryByTestId("admin-business-experiences-empty")).toBeNull();
  });

  it("1 experience, open for edit: the form holds the row, the row buttons are disabled", () => {
    apiState.rows = [ROW];
    wrap(<AdminBusinessExperiencesPanel producerId="p1" hasOwner />);
    fireEvent.click(screen.getByTestId("admin-business-experience-edit"));
    expect(document.getElementById("experience-title").value).toBe(ROW.title);
    expect(screen.getByRole("button", { name: T.save_cta })).toBeTruthy();
    expect(screen.getByTestId("admin-business-experience-copy").disabled).toBe(true);
  });

  it("many experiences, closed: one row each, cancelled and past marked", () => {
    apiState.rows = [
      ROW,
      { ...ROW, id: "ex-2", title: "סדנה שבוטלה", is_active: false },
      { ...ROW, id: "ex-3", title: "סדנה שעברה", event_date: "2026-01-01" },
    ];
    wrap(<AdminBusinessExperiencesPanel producerId="p1" hasOwner />);
    const items = screen.getByTestId("admin-business-experiences-list").querySelectorAll("li");
    expect(items).toHaveLength(3);
    expect(items[1].textContent).toContain(M.badge_inactive);
    expect(items[2].textContent).toContain(M.badge_past);
    expect(items[0].textContent).not.toContain(M.badge_past);
  });

  it("many experiences, open for «שכפול»: the copy keeps the title and clears the date", () => {
    apiState.rows = [ROW, { ...ROW, id: "ex-2", title: "סדנה שנייה" }];
    wrap(<AdminBusinessExperiencesPanel producerId="p1" hasOwner />);
    fireEvent.click(screen.getAllByTestId("admin-business-experience-copy")[1]);
    expect(document.getElementById("experience-title").value).toBe("סדנה שנייה");
    expect(document.getElementById("experience-date").value).toBe("");
    expect(screen.getByRole("button", { name: T.submit_cta })).toBeTruthy();
  });

  it("a listed row can be edited even when the owner flag is not hydrated", () => {
    apiState.rows = [ROW];
    wrap(<AdminBusinessExperiencesPanel producerId="p1" hasOwner={null} />);
    fireEvent.click(screen.getByTestId("admin-business-experience-edit"));
    expect(screen.getByTestId("experience-owner-consent")).toBeTruthy();
  });
});
