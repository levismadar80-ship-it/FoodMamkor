import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// MEH-2453 (MEH-2435 chunk 5) — "מתי ואיך מקבלים" is required on the create
// form. A participant from another city reads it before she joins; without it
// she cannot tell whether the product reaches her. The server refuses a blank
// note too (GroupBuyCreate._require_fulfillment_note); this is the client half,
// so the owner sees the reason next to the field instead of a raw 422.

vi.mock("next-intl", () => ({
  useTranslations: (ns) => {
    const t = (key) => `${ns}.${key}`;
    t.rich = (key) => `${ns}.${key}`;
    t.raw = (key) => `${ns}.${key}`;
    return t;
  },
  useLocale: () => "he",
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>
  ),
}));
const stableUser = { id: "u1", role: "producer" };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: stableUser, loading: false }) }));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const post = vi.fn();
vi.mock("@/lib/api", () => ({
  default: {
    get: (url) =>
      Promise.resolve({
        data:
          url === "/producers/me/dashboard"
            ? { producer: { id: "p1", city: "חדרה", status: "approved" } }
            : [],
      }),
    post: (...a) => post(...a),
    patch: vi.fn(),
  },
}));

import ProducerGroupBuysPage from "@/app/[locale]/producer/dashboard/group-buys/page";

const F = "group_buys.dashboard.form";

async function openForm() {
  render(<ProducerGroupBuysPage />);
  fireEvent.click(await screen.findByRole("button", { name: "group_buys.dashboard.empty_cta" }));
  const note = screen.getByLabelText(new RegExp(`${F}.fulfillment_label`));
  // The submit handler builds an ISO deadline, so the date must be a real one.
  fireEvent.change(screen.getByLabelText(new RegExp(`${F}.deadline_label`)), {
    target: { value: "2099-01-01T12:00" },
  });
  return { note, form: note.closest("form") };
}

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ data: { id: "new" } });
});

describe("the fulfillment note on the create form", () => {
  it("is a required field with the helper text tied to it", async () => {
    const { note } = await openForm();
    expect(note).toBeRequired();
    // Same cap as the server (GroupBuyCreate max_length=1000).
    expect(note).toHaveAttribute("maxLength", "1000");
    const helper = screen.getByText(`${F}.fulfillment_helper`);
    expect(note.getAttribute("aria-describedby")).toContain(helper.id);
    // The label carries the same visual marker as every other required field.
    expect(screen.getByText(`${F}.fulfillment_label`).closest("label").textContent).toContain("*");
  });

  it("shows no error before a submit", async () => {
    const { note } = await openForm();
    expect(screen.queryByText(`${F}.fulfillment_required`)).toBeNull();
    expect(note).not.toHaveAttribute("aria-invalid");
  });

  // Native `required` accepts whitespace, so these are the cases only the
  // JS check catches. Empty is included for the case where the browser gate
  // is bypassed (the test's fireEvent.submit, or an old browser).
  for (const [label, value] of [
    ["empty", ""],
    ["spaces", "   "],
    ["newlines", " \n \n"],
    // Not blank, still no answer: the server's 3-letter floor (MEH-555).
    ["punctuation", ". - ?"],
    ["two-letter", "כן"],
  ]) {
    it(`a ${label} note does not send and says why next to the field`, async () => {
      const { note, form } = await openForm();
      fireEvent.change(note, { target: { value } });
      fireEvent.submit(form);
      const err = await screen.findByText(`${F}.fulfillment_required`);
      expect(post).not.toHaveBeenCalled();
      expect(note).toHaveAttribute("aria-invalid", "true");
      expect(note.getAttribute("aria-describedby")).toContain(err.id);
      expect(document.activeElement).toBe(note);
    });
  }

  it("typing clears the error", async () => {
    const { note, form } = await openForm();
    fireEvent.submit(form);
    await screen.findByText(`${F}.fulfillment_required`);
    fireEvent.change(note, { target: { value: "א" } });
    expect(screen.queryByText(`${F}.fulfillment_required`)).toBeNull();
    expect(note).not.toHaveAttribute("aria-invalid");
  });

  it("a filled note is sent trimmed", async () => {
    const { note, form } = await openForm();
    fireEvent.change(note, { target: { value: "  משלוח לחדרה ולפרדס חנה \n" } });
    fireEvent.submit(form);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [url, body] = post.mock.calls[0];
    expect(url).toBe("/group-buys");
    expect(body.fulfillment_note).toBe("משלוח לחדרה ולפרדס חנה");
  });
});
