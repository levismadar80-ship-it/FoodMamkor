/**
 * MEH-2452 — the admin form's city was a free-text <input>, so a spelling
 * that is not the site's own (the city filter matches exactly) left the
 * business invisible under that city. It is now the same CitySearch combobox
 * the registration and the owner's locations editor use.
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

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { role: "admin" }, loading: false }),
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

const cityField = () => screen.getByRole("combobox", { name: FORM.fields.city });
const submit = (label) => fireEvent.submit(screen.getByRole("button", { name: label }).closest("form"));

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] }); // /categories and /cities
});

describe("ProducerForm — city is picked from the city list (MEH-2452)", () => {
  it("the city field is a combobox, and picking from the list is what gets saved", async () => {
    api.post.mockResolvedValue({ data: { id: "new-1" } });
    wrap(<ProducerForm />);
    await screen.findByText(FORM.sections.basic);

    fireEvent.change(cityField(), { target: { value: "זכר" } });
    fireEvent.mouseDown(await screen.findByRole("option", { name: "זכרון יעקב" }));
    expect(cityField()).toHaveValue("זכרון יעקב");

    submit(FORM.submit_create);
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post.mock.calls[0][1].city).toBe("זכרון יעקב");
  });

  it("editing a business shows the city already saved", async () => {
    wrap(<ProducerForm producerId="p-1" initial={{ name: "קיים", city: "חדרה" }} />);
    await screen.findByText(FORM.sections.basic);
    expect(cityField()).toHaveValue("חדרה");
  });
});
