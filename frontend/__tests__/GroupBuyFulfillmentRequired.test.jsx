import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// MEH-2453 (MEH-2435 chunk 5) — "מתי ואיך מקבלים" is required on the create
// form. MEH-2651 split it into two boxes, pickup and delivery; at least one is
// required, and a filled one needs real words. A participant from another city reads it before she joins; without it
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
  const pickup = screen.getByLabelText(`${F}.pickup_label`);
  const delivery = screen.getByLabelText(`${F}.delivery_label`);
  // The submit handler builds an ISO deadline, so the date must be a real one.
  fireEvent.change(screen.getByLabelText(new RegExp(`${F}.deadline_label`)), {
    target: { value: "2099-01-01T12:00" },
  });
  return { pickup, delivery, form: pickup.closest("form") };
}

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ data: { id: "new" } });
});

describe("pickup and delivery on the create form", () => {
  it("shows two boxes under one marked group, with the helper tied to both", async () => {
    const { pickup, delivery } = await openForm();
    const group = screen.getByTestId("gb-fulfillment-fields");
    expect(group.tagName).toBe("FIELDSET");
    expect(group.querySelector("legend").textContent).toContain(`${F}.fulfillment_legend`);
    expect(group.querySelector("legend").textContent).toContain("*");
    const helper = screen.getByText(`${F}.fulfillment_helper`);
    for (const box of [pickup, delivery]) {
      // Either may be blank on its own — the pair is what is required.
      expect(box).not.toBeRequired();
      // Same cap as the server (GroupBuyCreate max_length=1000).
      expect(box).toHaveAttribute("maxLength", "1000");
      expect(box.getAttribute("aria-describedby")).toContain(helper.id);
    }
    expect(pickup).toHaveAttribute("placeholder", `${F}.pickup_placeholder`);
    expect(delivery).toHaveAttribute("placeholder", `${F}.delivery_placeholder`);
  });

  it("shows no error before a submit", async () => {
    const { pickup, delivery } = await openForm();
    expect(screen.queryByText(`${F}.fulfillment_required`)).toBeNull();
    expect(pickup).not.toHaveAttribute("aria-invalid");
    expect(delivery).not.toHaveAttribute("aria-invalid");
  });

  for (const [label, value] of [
    ["empty", ""],
    ["spaces", "   "],
    ["newlines", " \n \n"],
  ]) {
    it(`both boxes ${label}: nothing is sent, both are marked, focus goes to pickup`, async () => {
      const { pickup, delivery, form } = await openForm();
      fireEvent.change(pickup, { target: { value } });
      fireEvent.change(delivery, { target: { value } });
      fireEvent.submit(form);
      const err = await screen.findByText(`${F}.fulfillment_required`);
      expect(post).not.toHaveBeenCalled();
      for (const box of [pickup, delivery]) {
        expect(box).toHaveAttribute("aria-invalid", "true");
        expect(box.getAttribute("aria-describedby")).toContain(err.id);
      }
      expect(document.activeElement).toBe(pickup);
    });
  }

  // Not blank, still no answer: the server's 3-letter floor (MEH-555).
  for (const [label, value] of [
    ["punctuation", ". - ?"],
    ["two-letter", "כן"],
  ]) {
    it(`a ${label} delivery next to a real pickup marks only delivery`, async () => {
      const { pickup, delivery, form } = await openForm();
      fireEvent.change(pickup, { target: { value: "מהמשק ביום שישי" } });
      fireEvent.change(delivery, { target: { value } });
      fireEvent.submit(form);
      await screen.findByText(`${F}.fulfillment_required`);
      expect(post).not.toHaveBeenCalled();
      expect(delivery).toHaveAttribute("aria-invalid", "true");
      expect(pickup).not.toHaveAttribute("aria-invalid");
      expect(document.activeElement).toBe(delivery);
    });

    it(`a ${label} pickup alone does not send`, async () => {
      const { pickup, form } = await openForm();
      fireEvent.change(pickup, { target: { value } });
      fireEvent.submit(form);
      await screen.findByText(`${F}.fulfillment_required`);
      expect(post).not.toHaveBeenCalled();
      expect(pickup).toHaveAttribute("aria-invalid", "true");
    });
  }

  it("typing clears the error", async () => {
    const { pickup, delivery, form } = await openForm();
    fireEvent.submit(form);
    await screen.findByText(`${F}.fulfillment_required`);
    fireEvent.change(delivery, { target: { value: "א" } });
    expect(screen.queryByText(`${F}.fulfillment_required`)).toBeNull();
    expect(pickup).not.toHaveAttribute("aria-invalid");
    expect(delivery).not.toHaveAttribute("aria-invalid");
  });

  for (const [label, p, d, want] of [
    ["pickup only", "  מהמשק ביום שישי \n", "", { pickup_note: "מהמשק ביום שישי", delivery_note: null }],
    ["delivery only", "", " לזכרון יעקב ביום ראשון ", { pickup_note: null, delivery_note: "לזכרון יעקב ביום ראשון" }],
    ["both", "מהמשק", "לחדרה ולפרדס חנה", { pickup_note: "מהמשק", delivery_note: "לחדרה ולפרדס חנה" }],
  ]) {
    it(`${label}: sent trimmed, the blank one as null, no fulfillment_note`, async () => {
      const { pickup, delivery, form } = await openForm();
      fireEvent.change(pickup, { target: { value: p } });
      fireEvent.change(delivery, { target: { value: d } });
      fireEvent.submit(form);
      await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
      const [url, body] = post.mock.calls[0];
      expect(url).toBe("/group-buys");
      expect(body.pickup_note).toBe(want.pickup_note);
      expect(body.delivery_note).toBe(want.delivery_note);
      expect(body).not.toHaveProperty("fulfillment_note");
    });
  }
});
