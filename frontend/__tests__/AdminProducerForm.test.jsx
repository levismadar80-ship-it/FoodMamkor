/**
 * Admin ProducerForm — focus-retention regression test.
 *
 * Before the fix, `Section` and `Field` were declared INSIDE the ProducerForm
 * body, so every render (i.e. every keystroke) gave them a fresh component
 * identity and React remounted the whole subtree — the focused <input> was
 * detached and focus was lost after a single character.
 *
 * This mounts the real component under NextIntlClientProvider + he.json
 * (mirroring the MEH-996 / EditTabCategoriesCard harness) and asserts that the
 * ORIGINAL name-input node keeps focus AND value after typing 5 characters. If
 * the subtree remounts, the retained node reference goes stale and both checks
 * fail.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

const NAME_LABEL = he.admin.producers.form.fields.name; // "שם העסק *"

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

describe("Admin ProducerForm (focus retention)", () => {
  it("keeps the name field focused + valued while typing 5 characters", async () => {
    renderForm();

    const input = await screen.findByLabelText(NAME_LABEL);
    input.focus();
    expect(input).toHaveFocus();

    const chars = [..."מטבחה"]; // 5 chars
    chars.forEach((_, i) => {
      fireEvent.change(input, { target: { value: chars.slice(0, i + 1).join("") } });
    });

    // Same original node — if the subtree had remounted this reference would be
    // detached from the document (no focus) and would not reflect the new value.
    expect(input).toHaveFocus();
    expect(input.value).toBe("מטבחה");
  });

  it("renders the form (basic section heading present)", async () => {
    renderForm();
    expect(
      await screen.findByText(he.admin.producers.form.sections.basic),
    ).toBeInTheDocument();
  });
});
