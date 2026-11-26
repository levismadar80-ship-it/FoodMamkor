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
import { SWRConfig } from "swr";
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

// MEH-2015: the asterisk moved out of the i18n value into a marker span the
// label ALSO contains, so an exact textContent match no longer works — match
// on the (now unstarred) value as a prefix instead.
const NAME_LABEL = new RegExp(he.admin.producers.form.fields.name);

function renderForm() {
  return render(
    // MEH-3818: the categories come through the shared read cache; a fresh
    // cache per render, so one test's list never answers the next.
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <ProducerForm />
      </NextIntlClientProvider>
    </SWRConfig>,
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

  // MEH-1297: category cap-3 + primary badge in the admin form.
  // MEH-2925: the cap is 5 (was 3).
  it("caps categories at 5: a 6th checkbox is disabled once 5 are checked", async () => {
    api.get.mockResolvedValue({
      data: [
        { id: 1, name: "חלב וגבינות" },
        { id: 2, name: "לחמים ואפייה" },
        { id: 3, name: "בשר" },
        { id: 5, name: "דגים" },
        { id: 6, name: "דבש" },
        { id: 4, name: "שמנים" },
      ],
    });
    renderForm();

    const box = async (name) =>
      (await screen.findByText(name)).closest("label").querySelector("input");

    fireEvent.click(await box("חלב וגבינות"));
    fireEvent.click(await box("לחמים ואפייה"));
    fireEvent.click(await box("בשר"));
    expect(await box("שמנים")).not.toBeDisabled();
    fireEvent.click(await box("דגים"));
    fireEvent.click(await box("דבש"));

    // The 6th (unchecked) category is now disabled; the checked ones are not.
    expect(await box("שמנים")).toBeDisabled();
    expect(await box("בשר")).not.toBeDisabled();
    // First-selected carries the "ראשית" badge.
    expect(screen.getByTestId("admin-primary-badge")).toHaveTextContent(
      he.admin.producers.form.primary_badge,
    );
  });
});
