/**
 * MEH-2048 — the admin ProducerForm no longer offers a `pickup_points`
 * checkbox. Since MEH-2046 every consumer surface derives pickup from
 * ProducerLocation rows and admin.py drops the field on write (MEH-2060), so
 * the checkbox could only claim pickup nothing would show. A hint pointing at
 * the locations editor stands where it was.
 *
 * Same harness as AdminProducerForm.test.jsx (real component under
 * NextIntlClientProvider + he.json). Against the pre-fix form the first test
 * fails — the checkbox is there and the hint is not.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProducerForm from "@/components/admin/ProducerForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const FIELDS = he.admin.producers.form.fields;

function renderForm() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProducerForm />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] }); // GET /categories
});

describe("Admin ProducerForm — pickup is managed in locations (MEH-2048)", () => {
  it("renders the locations hint and NO pickup_points checkbox", async () => {
    renderForm();
    await screen.findByText(he.admin.producers.form.sections.delivery_pickup);

    expect(screen.getByText(FIELDS.pickup_managed_in_locations)).toBeInTheDocument();
    expect(screen.queryByLabelText(FIELDS.pickup_points)).toBeNull();
  });

  it("keeps the has_delivery checkbox (control — the section itself is intact)", async () => {
    renderForm();
    const delivery = await screen.findByLabelText(FIELDS.has_delivery);
    expect(delivery).toHaveAttribute("type", "checkbox");
  });
});
