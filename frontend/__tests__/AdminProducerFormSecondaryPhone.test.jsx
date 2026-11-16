/**
 * MEH-3339 — the admin form's second phone: saved with its label, cleared
 * together, and left out of an untouched edit save (the owner edits it too).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProducerForm from "@/components/admin/ProducerForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({}) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { role: "admin" }, loading: false }) }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const FORM = he.admin.producers.form;
const wrap = (ui) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );
const save = () => fireEvent.submit(screen.getByRole("button", { name: FORM.submit_update }).closest("form"));
const putBody = () => api.put.mock.calls.find((c) => c[0] === "/admin/producers/p-9")[1];
const INITIAL = { name: "סנדרה", city: "פרדס חנה-כרכור", phone: "0522518862" };

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
  api.put.mockResolvedValue({ data: {} });
});

describe("Admin ProducerForm — second phone (MEH-3339)", () => {
  it("saves the number with its label", async () => {
    wrap(<ProducerForm producerId="p-9" initial={INITIAL} />);
    await screen.findByText(FORM.sections.basic);
    fireEvent.change(screen.getByLabelText(FORM.fields.secondary_phone), { target: { value: "0522723011" } });
    fireEvent.change(screen.getByLabelText(FORM.fields.secondary_phone_label), { target: { value: "להזמנות" } });
    save();
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(putBody().secondary_phone).toBe("0522723011");
    expect(putBody().secondary_phone_label).toBe("להזמנות");
    expect(putBody().phone).toBe("0522518862"); // the main number is untouched
  });

  it("clearing the number clears the label in the same save", async () => {
    wrap(<ProducerForm producerId="p-9" initial={{ ...INITIAL, secondary_phone: "0522723011", secondary_phone_label: "להזמנות" }} />);
    await screen.findByText(FORM.sections.basic);
    fireEvent.change(screen.getByLabelText(FORM.fields.secondary_phone), { target: { value: "" } });
    save();
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(putBody().secondary_phone).toBeNull();
    expect(putBody().secondary_phone_label).toBeNull();
  });

  it("an untouched save leaves both out", async () => {
    wrap(<ProducerForm producerId="p-9" initial={{ ...INITIAL, secondary_phone: "0522723011", secondary_phone_label: "להזמנות" }} />);
    await screen.findByText(FORM.sections.basic);
    save();
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(putBody()).not.toHaveProperty("secondary_phone");
    expect(putBody()).not.toHaveProperty("secondary_phone_label");
  });
});
