/**
 * MEH-2432 — an empty "contact name" or "top product" must reach the server
 * as null, not "". The backend name fields reject an empty string (schemas.py
 * _sanitized_person_name → «שם לא יכול להיות ריק»), so "" turned every admin
 * create or edit that left them blank into a 422.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProducerForm from "@/components/admin/ProducerForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
}));

const adminAuth = { user: { role: "admin" }, loading: false };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => adminAuth,
}));

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn(), success: vi.fn() } }));

const FORM = he.admin.producers.form;

function wrap(ui) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const submit = (label) => fireEvent.submit(screen.getByRole("button", { name: label }).closest("form"));

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] }); // GET /categories
});

describe("ProducerForm — empty optional names are sent as null (MEH-2432)", () => {
  it("create with both left blank: contact_name and top_product_name are null", async () => {
    api.post.mockResolvedValue({ data: { id: "new-1" } });
    wrap(<ProducerForm />);
    await screen.findByText(FORM.sections.basic);

    submit(FORM.submit_create);
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const payload = api.post.mock.calls[0][1];
    expect(payload.contact_name).toBeNull();
    expect(payload.top_product_name).toBeNull();
  });

  it("edit with whitespace-only values: both are sent as null", async () => {
    api.put.mockResolvedValue({ data: {} });
    wrap(<ProducerForm producerId="p-1" initial={{ name: "קיים", contact_name: "   ", top_product_name: " " }} />);
    await screen.findByText(FORM.sections.basic);

    submit(FORM.submit_update);
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const payload = api.put.mock.calls[0][1];
    expect(payload.contact_name).toBeNull();
    expect(payload.top_product_name).toBeNull();
  });

  it("filled values are kept, trimmed", async () => {
    api.put.mockResolvedValue({ data: {} });
    wrap(<ProducerForm producerId="p-1" initial={{ name: "קיים", contact_name: " גל ", top_product_name: "לחם מחמצת" }} />);
    await screen.findByText(FORM.sections.basic);

    submit(FORM.submit_update);
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const payload = api.put.mock.calls[0][1];
    expect(payload.contact_name).toBe("גל");
    expect(payload.top_product_name).toBe("לחם מחמצת");
  });
});
