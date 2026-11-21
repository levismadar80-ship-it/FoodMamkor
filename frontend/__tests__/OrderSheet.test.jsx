// MEH-3216 stage 5c — the order sheet and its helpers.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import he from "@/messages/he.json";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));

import api from "@/lib/api";
import OrderSheet from "@/components/public/OrderSheet";
import { cancelDeadline, fulfilmentsOffered, orderBody, slotsFor } from "@/lib/order-sheet";

const PRODUCER = "7e57a6f0-0000-4000-8000-000000000007";
const BREAD = "0a000000-0000-4000-8000-00000000000a";
const WINE = "0b000000-0000-4000-8000-00000000000b";
const ORDER = "0c000000-0000-4000-8000-00000000000c";
const TOKEN = "t".repeat(43);

const product = (id, over = {}) => ({
  id,
  name: "חלה",
  image_url: null,
  price_min_agorot: 2800,
  price_max_agorot: 2800,
  price_unit: "unit",
  price_is_estimate: false,
  in_stock: true,
  contains_alcohol: false,
  ...over,
});
const slot = (start, end, over = {}) => ({ start, end, fulfilment: "pickup", alcohol_ok: true, ...over });
const MENU = {
  producer_id: PRODUCER,
  min_order_agorot: null,
  cancel_cutoff_hours: 12,
  lead_time_hours: 0,
  business_id_number: "512345678",
  products: [product(BREAD), product(WINE, { name: "יין", contains_alcohol: true })],
  slots: [
    slot("2026-11-20T10:00:00Z", "2026-11-20T11:00:00Z"),
    slot("2026-11-20T08:00:00Z", "2026-11-20T09:00:00Z"),
    slot("2026-11-20T22:00:00Z", "2026-11-20T23:00:00Z", { alcohol_ok: false }),
    slot("2026-11-21T08:00:00Z", "2026-11-21T09:00:00Z", { fulfilment: "delivery" }),
  ],
};
const QUOTE = { subtotal_agorot: 5600, delivery_fee_agorot: 0, total_agorot: 5600, has_estimate: false };

describe("order-sheet helpers", () => {
  it("offers only the ways that have a slot, and orders slots by time", () => {
    expect(fulfilmentsOffered(MENU, false)).toEqual(["pickup", "delivery"]);
    expect(fulfilmentsOffered({ ...MENU, slots: MENU.slots.slice(0, 1) }, false)).toEqual(["pickup"]);
    expect(slotsFor(MENU, "pickup", false).map((s) => s.start)).toEqual([
      "2026-11-20T08:00:00Z",
      "2026-11-20T10:00:00Z",
      "2026-11-20T22:00:00Z",
    ]);
  });

  it("hides the night slots from an order with alcohol", () => {
    expect(slotsFor(MENU, "pickup", true)).toHaveLength(2);
  });

  it("puts the cancel deadline the business's cutoff before the slot", () => {
    expect(cancelDeadline("2026-11-20T10:00:00Z", 12)).toBe("2026-11-19T22:00:00.000Z");
    expect(cancelDeadline("nope", 12)).toBeNull();
  });

  it("sends the city and address only for a delivery, and no empty note", () => {
    const base = {
      producerId: PRODUCER, picks: { [BREAD]: 2 }, slotStart: "s", name: " דנה ", phone: "050", code: "123456",
      city: "חיפה", address: "הרצל 1", note: "  ", ageDeclared: false, key: "k",
    };
    const pickup = orderBody({ ...base, fulfilment: "pickup" });
    expect(pickup).not.toHaveProperty("delivery_city");
    expect(pickup).not.toHaveProperty("note");
    expect(pickup.customer_name).toBe("דנה");
    expect(pickup.items).toEqual([{ product_id: BREAD, qty: 2 }]);
    expect(orderBody({ ...base, fulfilment: "delivery" })).toMatchObject({ delivery_city: "חיפה", delivery_address: "הרצל 1" });
  });
});

const SEND_56 = "שליחת הבקשה · 56 ₪";
const NOT_A_PARTY = "מהמקור לא המוכרת ולא צד לעסקה.";
/** MEH-3658: ways and slots are buttons now, picked by their value. */
const pick = (testId, value) => fireEvent.click(screen.getByTestId(testId).querySelector(`[data-value="${value}"]`));

function renderSheet(picks = { [BREAD]: 2 }, producer = { id: PRODUCER, payment_info: { methods: ["bit", "cash"] } }, onStale = () => {}) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      <OrderSheet producer={producer} menu={MENU} picks={picks} onStale={onStale} onClose={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("OrderSheet", () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
    push.mockReset();
  });

  it("shows the server's total and the disclosure lines before sending", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: QUOTE });
    renderSheet();
    await waitFor(() => expect(screen.getByTestId("order-sheet-send").textContent).toBe(SEND_56));
    expect(api.post).toHaveBeenCalledWith("/product-orders/quote", {
      producer_id: PRODUCER,
      items: [{ product_id: BREAD, qty: 2 }],
      fulfilment: "pickup",
    });
    // No slot picked yet, so no cancel deadline: the payment sentence alone.
    expect(screen.getByTestId("order-sheet-terms").textContent).toBe("משלמים ישירות לבית העסק (ביט, מזומן), לא באתר.");
    expect(screen.getByTestId("order-sheet-seller").textContent).toContain(NOT_A_PARTY);
    expect(screen.queryByTestId("order-sheet-age")).toBeNull();
  });

  it("names the seller before the order: name, «מספר עוסק», and the city only when there is one", () => {
    vi.mocked(api.post).mockResolvedValue({ data: QUOTE });
    const { unmount } = renderSheet({ [BREAD]: 1 }, { id: PRODUCER, name: "המאפייה של רותי", city: "רחובות" });
    expect(screen.getByTestId("order-sheet-seller").textContent).toBe(`המוכר: המאפייה של רותי · מס׳ עוסק / ת״ז 512345678 · רחובות. ${NOT_A_PARTY}`);
    unmount();
    renderSheet({ [BREAD]: 1 }, { id: PRODUCER, name: "המאפייה של רותי", city: " " });
    expect(screen.getByTestId("order-sheet-seller").textContent).toBe(`המוכר: המאפייה של רותי · מס׳ עוסק / ת״ז 512345678. ${NOT_A_PARTY}`);
  });

  it("asks for the age declaration when a line is alcohol", () => {
    vi.mocked(api.post).mockResolvedValue({ data: QUOTE });
    renderSheet({ [WINE]: 1 });
    expect(screen.getByTestId("order-sheet-age")).toBeTruthy();
  });

  it("sends the request and lands on the status page with its token in the hash", async () => {
    vi.mocked(api.post).mockImplementation(async (url) => {
      if (url === "/product-orders/quote") return { data: QUOTE };
      if (url === "/product-orders/phone-code") return { data: {} };
      return { data: { id: ORDER, status_token: TOKEN } };
    });
    renderSheet();
    pick("order-sheet-slot", "2026-11-20T08:00:00Z");
    fireEvent.change(screen.getByTestId("order-sheet-name"), { target: { value: "דנה לוי" } });
    fireEvent.change(screen.getByTestId("order-sheet-phone"), { target: { value: "0501234567" } });
    fireEvent.click(screen.getByTestId("order-sheet-send-code"));
    fireEvent.change(await screen.findByTestId("order-sheet-code"), { target: { value: "123456" } });
    fireEvent.submit(screen.getByTestId("order-sheet"));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/order/${ORDER}#t=${TOKEN}`));
    const sent = vi.mocked(api.post).mock.calls.find(([url]) => url === "/product-orders")[1];
    expect(sent).toMatchObject({ slot_start: "2026-11-20T08:00:00Z", code: "123456", customer_name: "דנה לוי" });
    expect(sent).not.toHaveProperty("total_agorot");
  });

  it("never shows a pickup total for a delivery, and sends only after the matching total", async () => {
    vi.mocked(api.post).mockImplementation(async (url, body) =>
      body.fulfilment === "delivery"
        ? { data: { ...QUOTE, delivery_fee_agorot: 3000, total_agorot: 8600 } }
        : { data: QUOTE },
    );
    renderSheet();
    pick("order-sheet-slot", "2026-11-20T08:00:00Z");
    await waitFor(() => expect(screen.getByTestId("order-sheet-send").textContent).toBe(SEND_56));
    expect(screen.getByTestId("order-sheet-send").disabled).toBe(false);
    pick("order-sheet-fulfilment", "delivery");
    // No city yet: no total at all, and no sending.
    expect(screen.queryByTestId("order-sheet-totals")).toBeNull();
    expect(screen.getByTestId("order-sheet-send").textContent).toBe("שליחת הבקשה");
    expect(screen.getByTestId("order-sheet-send").disabled).toBe(true);
    fireEvent.change(screen.getByTestId("order-sheet-city"), { target: { value: "חיפה" } });
    await waitFor(() => expect(screen.getByTestId("order-sheet-send").textContent).toBe("שליחת הבקשה · 86 ₪"));
    expect(screen.getByText("משלוח: 30 ₪")).toBeTruthy();
    expect(api.post).toHaveBeenLastCalledWith("/product-orders/quote", expect.objectContaining({ delivery_city: "חיפה" }));
    expect(screen.getByTestId("order-sheet-send").disabled).toBe(false);
  });

  it("reads the menu again when the server says a pick is gone", async () => {
    const onStale = vi.fn();
    vi.mocked(api.post).mockRejectedValue({ response: { status: 409, data: { detail: "אחד המוצרים כבר לא זמין להזמנה. צריך לעדכן את ההזמנה" } } });
    renderSheet(undefined, undefined, onStale);
    expect(await screen.findByText("אחד המוצרים כבר לא זמין להזמנה. צריך לעדכן את ההזמנה")).toBeTruthy();
    expect(onStale).toHaveBeenCalled();
  });

  it("shows the server's Hebrew refusal and stays open", async () => {
    vi.mocked(api.post).mockImplementation(async (url) => {
      if (url === "/product-orders/quote") return { data: QUOTE };
      throw { response: { status: 409, data: { detail: "המועד שנבחר כבר לא זמין. צריך לבחור מועד אחר" } } };
    });
    renderSheet();
    fireEvent.submit(screen.getByTestId("order-sheet"));
    expect(await screen.findByText("המועד שנבחר כבר לא זמין. צריך לבחור מועד אחר")).toBeTruthy();
    // The quote lands after the refusal (it waits 400 ms); it must not wipe it.
    await waitFor(() => expect(screen.getByTestId("order-sheet-send").textContent).toBe(SEND_56));
    expect(screen.getByText("המועד שנבחר כבר לא זמין. צריך לבחור מועד אחר")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  // MEH-3658 — the lighter sheet. State × count: ways 1 / 2, slots 1 / 2–4 / 5+
  // × more closed / open, note closed / open.
  it("shows no way switch when one way is offered, and the delivery one when two are", () => {
    vi.mocked(api.post).mockResolvedValue({ data: QUOTE });
    const { unmount } = render(
      <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
        <OrderSheet producer={{ id: PRODUCER }} menu={{ ...MENU, slots: MENU.slots.slice(0, 2) }} picks={{ [BREAD]: 1 }} onClose={() => {}} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId("order-sheet-fulfilment")).toBeNull();
    unmount();
    renderSheet();
    const radios = screen.getByTestId("order-sheet-fulfilment").querySelectorAll("[role=radio]");
    expect([...radios].map((b) => [b.textContent, b.getAttribute("aria-checked")])).toEqual([["איסוף עצמי", "true"], ["משלוח", "false"]]);
  });

  it("picks the only slot for her, and waits for a tap when there are several", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: QUOTE });
    const { unmount } = render(
      <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
        <OrderSheet producer={{ id: PRODUCER }} menu={{ ...MENU, slots: MENU.slots.slice(0, 1) }} picks={{ [BREAD]: 1 }} onClose={() => {}} />
      </NextIntlClientProvider>,
    );
    const only = screen.getByTestId("order-sheet-slot").querySelectorAll("[role=radio]");
    expect(only).toHaveLength(1);
    expect(only[0].getAttribute("aria-checked")).toBe("true");
    await waitFor(() => expect(screen.getByTestId("order-sheet-send").disabled).toBe(false));
    // The deadline follows the picked slot: the cancel sentence joins the line.
    expect(screen.getByTestId("order-sheet-terms").textContent).toMatch(/^אפשר לבטל או לשנות עד /);
    unmount();
    renderSheet();
    await waitFor(() => expect(screen.getByTestId("order-sheet-send").textContent).toBe(SEND_56));
    expect(screen.getByTestId("order-sheet-send").disabled).toBe(true);
    expect(screen.getByTestId("order-sheet-slot").querySelector("[aria-checked=true]")).toBeNull();
    pick("order-sheet-slot", "2026-11-20T10:00:00Z");
    expect(screen.getByTestId("order-sheet-send").disabled).toBe(false);
  });

  it("shows four slots and «מועדים נוספים» for the rest", () => {
    vi.mocked(api.post).mockResolvedValue({ data: QUOTE });
    const many = Array.from({ length: 6 }, (_, i) => slot(`2026-11-2${i}T08:00:00Z`, `2026-11-2${i}T09:00:00Z`));
    const { unmount } = render(
      <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
        <OrderSheet producer={{ id: PRODUCER }} menu={{ ...MENU, slots: many }} picks={{ [BREAD]: 1 }} onClose={() => {}} />
      </NextIntlClientProvider>,
    );
    const radios = () => screen.getByTestId("order-sheet-slot").querySelectorAll("[role=radio]");
    expect(radios()).toHaveLength(4);
    fireEvent.click(screen.getByTestId("order-sheet-more-slots"));
    expect(radios()).toHaveLength(6);
    expect(screen.queryByTestId("order-sheet-more-slots")).toBeNull();
    unmount();
    // Three slots (pickup in MENU): all shown, no «more».
    renderSheet();
    expect(radios()).toHaveLength(3);
    expect(screen.queryByTestId("order-sheet-more-slots")).toBeNull();
  });

  it("keeps the note behind «+ הוספת הערה» until she opens it, and sends what she wrote", async () => {
    vi.mocked(api.post).mockImplementation(async (url) => {
      if (url === "/product-orders/quote") return { data: QUOTE };
      return { data: { id: ORDER, status_token: TOKEN } };
    });
    renderSheet();
    expect(screen.queryByTestId("order-sheet-note")).toBeNull();
    expect(screen.getByTestId("order-sheet-add-note").textContent).toBe("+ הוספת הערה");
    fireEvent.click(screen.getByTestId("order-sheet-add-note"));
    expect(screen.queryByTestId("order-sheet-add-note")).toBeNull();
    fireEvent.change(screen.getByTestId("order-sheet-note"), { target: { value: "בלי שומשום" } });
    fireEvent.submit(screen.getByTestId("order-sheet"));
    await waitFor(() => expect(push).toHaveBeenCalled());
    const sent = vi.mocked(api.post).mock.calls.find(([url]) => url === "/product-orders")[1];
    expect(sent.note).toBe("בלי שומשום");
  });

  it("puts a short phone label with its help line, and the estimate on the button", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { ...QUOTE, has_estimate: true } });
    renderSheet();
    expect(screen.getByText("טלפון נייד")).toBeTruthy();
    expect(screen.getByTestId("order-sheet-phone-help").textContent).toBe("נשלח אליו קוד ועדכונים על ההזמנה בוואטסאפ");
    await waitFor(() => expect(screen.getByTestId("order-sheet-send").textContent).toBe("שליחת הבקשה · בערך 56 ₪"));
  });
});
