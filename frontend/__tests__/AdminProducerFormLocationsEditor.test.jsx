/**
 * MEH-3333 — the admin edit page manages a business's locations (pickup
 * points included) with the owner's LocationsEditor, against
 * /admin/producers/{id}/locations. The create form has no id yet, so it keeps
 * the pointer text and mounts no editor.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProducerForm from "@/components/admin/ProducerForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { role: "admin" }, loading: false }),
}));

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const FORM = he.admin.producers.form;

function wrap(ui) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const getPaths = () => api.get.mock.calls.map((c) => c[0]);

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
});

describe("Admin ProducerForm — locations editor (MEH-3333)", () => {
  it("edit mode mounts the editor against the admin path, not the owner's", async () => {
    wrap(<ProducerForm producerId="p-42" initial={{ name: "סנדרה", city: "פרדס חנה-כרכור" }} />);
    await screen.findByTestId("admin-locations-editor");

    expect(screen.getByTestId("admin-locations-editor")).toBeInTheDocument();
    await waitFor(() => expect(getPaths()).toContain("/admin/producers/p-42/locations"));
    expect(getPaths()).not.toContain("/producers/me/locations");
    // The pointer text is replaced by the editor itself.
    expect(screen.queryByText(FORM.fields.pickup_managed_in_locations)).toBeNull();
  });

  it("create mode keeps the pointer text and mounts no editor", async () => {
    wrap(<ProducerForm />);
    await screen.findByText(FORM.sections.delivery_pickup);

    expect(screen.getByText(FORM.fields.pickup_managed_in_locations)).toBeInTheDocument();
    expect(screen.queryByTestId("admin-locations-editor")).toBeNull();
    expect(getPaths().some((p) => String(p).includes("/locations"))).toBe(false);
  });
});

// MEH-3333 review findings — the two ways the admin form used to undo the
// editor's work.
describe("Admin ProducerForm — the editor and the form do not overwrite each other (MEH-3333)", () => {
  const LOC = {
    id: "loc-1",
    kind: "branch",
    label: null,
    city: "תל אביב",
    lat: 32.08,
    lng: 34.78,
    is_primary: true,
    location_precision: "exact",
  };

  it("the editor is not inside the business <form> (a location save cannot submit it)", async () => {
    wrap(<ProducerForm producerId="p-42" initial={{ name: "סנדרה", city: "תל אביב", locations: [LOC] }} />);
    await screen.findByText(FORM.sections.basic);
    const editor = screen.getByTestId("admin-locations-editor");
    expect(editor.closest("form")).toBeNull();
  });

  it("an untouched save sends no city / lat / lng (the primary row is left alone)", async () => {
    api.put.mockResolvedValue({ data: {} });
    wrap(<ProducerForm producerId="p-42" initial={{ name: "סנדרה", city: "תל אביב", locations: [LOC] }} />);
    await screen.findByText(FORM.sections.basic);
    fireEvent.submit(screen.getByRole("button", { name: FORM.submit_update }).closest("form"));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const body = api.put.mock.calls.find((c) => c[0] === "/admin/producers/p-42")[1];
    expect(body).not.toHaveProperty("lat");
    expect(body).not.toHaveProperty("lng");
    expect(body).not.toHaveProperty("city");
    // Control: unrelated fields still travel.
    expect(body.name).toBe("סנדרה");
  });

  it("a changed pin still sends lat + lng together", async () => {
    api.put.mockResolvedValue({ data: {} });
    wrap(<ProducerForm producerId="p-42" initial={{ name: "סנדרה", city: "תל אביב", locations: [LOC] }} />);
    await screen.findByText(FORM.sections.basic);
    const lat = screen.getByLabelText(FORM.fields.lat);
    fireEvent.change(lat, { target: { value: "32.5" } });
    fireEvent.submit(screen.getByRole("button", { name: FORM.submit_update }).closest("form"));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const body = api.put.mock.calls.find((c) => c[0] === "/admin/producers/p-42")[1];
    expect(body.lat).toBe(32.5);
    expect(body.lng).toBe(34.78);
  });
});
