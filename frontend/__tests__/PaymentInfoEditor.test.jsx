/**
 * MEH-3035 chunk 2 — PaymentInfoEditor («איך משלמים לך?»).
 *
 * Methods are five tiles (toggle buttons) plus a «בחירת הכל» switch; timing is
 * one-of-three toggle buttons that can be cleared; the note is one optional
 * line capped at 80. The PUT body is the exact shape _payment_info_validator
 * accepts, and an all-empty card sends null (= the business says nothing).
 *
 * REUSES: __tests__/OrderWindowEditorRanges.test.jsx (next-intl + api mock).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PaymentInfoEditor from "@/app/[locale]/producer/dashboard/edit/PaymentInfoEditor";
import api from "@/lib/api";

vi.mock("next-intl", () => {
  const t = (key) => key;
  return { useTranslations: () => t };
});

vi.mock("@/lib/api", () => ({
  default: { put: vi.fn(() => Promise.resolve({ data: {} })) },
}));

const renderEditor = (payment_info, onSave = () => {}, reportDirty = () => {}) =>
  render(<PaymentInfoEditor profile={{ payment_info }} onSave={onSave} reportDirty={reportDirty} />);

const tile = (m) => screen.getByTestId(`payment-method-${m}`);
const timing = (k) => screen.getByTestId(`payment-timing-${k}`);
const save = () => fireEvent.click(screen.getByTestId("payment-info-save"));

describe("PaymentInfoEditor (MEH-3035)", () => {
  beforeEach(() => api.put.mockClear());

  it("renders the five methods in the approved order, none pressed when empty", () => {
    renderEditor(null);
    const ids = screen.getAllByTestId(/^payment-method-/).map((el) => el.dataset.testid);
    expect(ids).toEqual([
      "payment-method-bit",
      "payment-method-paybox",
      "payment-method-bank_transfer",
      "payment-method-cash",
      "payment-method-credit_card",
    ]);
    for (const el of screen.getAllByTestId(/^payment-method-/)) {
      expect(el.getAttribute("aria-pressed")).toBe("false");
    }
    expect(screen.getByTestId("payment-select-all").getAttribute("aria-checked")).toBe("false");
  });

  it("prefills a stored value", () => {
    renderEditor({ methods: ["bit", "cash"], timing: "deposit", note: "מקדמה של 30%" });
    expect(tile("bit").getAttribute("aria-pressed")).toBe("true");
    expect(tile("cash").getAttribute("aria-pressed")).toBe("true");
    expect(tile("paybox").getAttribute("aria-pressed")).toBe("false");
    expect(timing("deposit").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("payment-note").value).toBe("מקדמה של 30%");
  });

  it("save is disabled until something changes", () => {
    renderEditor(null);
    expect(screen.getByTestId("payment-info-save").disabled).toBe(true);
    fireEvent.click(tile("bit"));
    expect(screen.getByTestId("payment-info-save").disabled).toBe(false);
  });

  it("«בחירת הכל» selects all five, and again clears them", () => {
    renderEditor(null);
    const sw = screen.getByTestId("payment-select-all");
    fireEvent.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(screen.getAllByTestId(/^payment-method-/).every((el) => el.getAttribute("aria-pressed") === "true")).toBe(true);
    fireEvent.click(sw);
    expect(screen.getAllByTestId(/^payment-method-/).every((el) => el.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("the switch turns on by itself when the fifth tile is picked by hand", () => {
    renderEditor({ methods: ["bit", "paybox", "bank_transfer", "cash"], timing: null, note: null });
    expect(screen.getByTestId("payment-select-all").getAttribute("aria-checked")).toBe("false");
    fireEvent.click(tile("credit_card"));
    expect(screen.getByTestId("payment-select-all").getAttribute("aria-checked")).toBe("true");
  });

  it("timing is one-of-three and a second tap clears it", () => {
    renderEditor(null);
    fireEvent.click(timing("advance"));
    fireEvent.click(timing("on_pickup"));
    expect(timing("advance").getAttribute("aria-pressed")).toBe("false");
    expect(timing("on_pickup").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(timing("on_pickup"));
    expect(timing("on_pickup").getAttribute("aria-pressed")).toBe("false");
  });

  it("sends the validator's shape, methods in list order, note trimmed", async () => {
    const onSave = vi.fn();
    renderEditor(null, onSave);
    fireEvent.click(tile("cash"));
    fireEvent.click(tile("bit"));
    fireEvent.click(timing("advance"));
    fireEvent.change(screen.getByTestId("payment-note"), { target: { value: "  רק בהעברה מראש  " } });
    save();
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const body = { payment_info: { methods: ["bit", "cash"], timing: "advance", note: "רק בהעברה מראש" } };
    expect(api.put).toHaveBeenCalledWith("/producers/me", body);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(body));
    expect(await screen.findByRole("status")).toBeTruthy();
  });

  it("clearing everything sends null", async () => {
    renderEditor({ methods: ["bit"], timing: null, note: null });
    fireEvent.click(tile("bit"));
    save();
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/producers/me", { payment_info: null }));
  });

  it("the note input is capped at 80 characters", () => {
    renderEditor(null);
    expect(screen.getByTestId("payment-note").getAttribute("maxlength")).toBe("80");
  });

  it("reports dirty under its own key and shows the API's Hebrew error", async () => {
    const reportDirty = vi.fn();
    api.put.mockImplementationOnce(() =>
      Promise.reject({ response: { data: { detail: "ההערה על התשלום ארוכה מדי" } } }),
    );
    renderEditor(null, () => {}, reportDirty);
    fireEvent.click(tile("bit"));
    expect(reportDirty).toHaveBeenLastCalledWith("paymentInfo", true);
    save();
    expect((await screen.findByRole("alert")).textContent).toContain("ההערה על התשלום ארוכה מדי");
  });

  it("revert restores the stored value", () => {
    renderEditor({ methods: ["bit"], timing: null, note: null });
    fireEvent.click(tile("cash"));
    fireEvent.click(screen.getByTestId("payment-info-revert"));
    expect(tile("cash").getAttribute("aria-pressed")).toBe("false");
    expect(tile("bit").getAttribute("aria-pressed")).toBe("true");
  });
});
