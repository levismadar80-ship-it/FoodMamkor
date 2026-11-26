/**
 * MEH-3895 — the business's own prepay link (option A of
 * docs/research/rescue-prepay-2026-11.md).
 *
 * Cells covered (rule 5 matrix): link / no link × advance / deposit / on
 * pickup × reserved / handed, on the bag confirmation; the shared lib rule;
 * the dashboard field shown only for «מראש» / «מקדמה».
 * Copy is read from the real messages/he.json (renderHe).
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import { renderHe as render } from "./helpers/render-with-he";
import he from "../messages/he.json";
import { israelToday } from "@/lib/israel-date";
import { prepayLink, linkHost, serializePaymentInfo, paymentStateFrom, groupBuyAwaitsPayment } from "@/lib/payment-info";

vi.mock("@/lib/api", () => ({ default: { put: vi.fn(() => Promise.resolve({})) } }));

const { default: RescueConfirmation } = await import("@/components/rescue/RescueConfirmation");
const { default: GroupBuyMemberPanel } = await import("@/components/group-buy/GroupBuyMemberPanel");
const { default: PaymentInfoEditor } = await import(
  "@/app/[locale]/producer/dashboard/edit/PaymentInfoEditor"
);

const BIT = "https://www.bitpay.co.il/app/me/ABCD-1234";
const HOUR = 3_600_000;
const p = he.prepay;

const order = (over = {}) => ({
  id: "ord1",
  offer_id: "o1",
  date: israelToday(),
  qty: 1,
  pickup_code: "0431",
  status: "reserved",
  handed_at: null,
  price_agorot: 1500,
  pickup_start: new Date(Date.now() + HOUR).toISOString(),
  pickup_end: new Date(Date.now() + 2 * HOUR).toISOString(),
  cancel_until: new Date(Date.now() + HOUR / 2).toISOString(),
  ...over,
});

describe("lib rule", () => {
  it("shows the link only when paying before pickup", () => {
    expect(prepayLink({ timing: "advance", link: BIT })).toBe(BIT);
    expect(prepayLink({ timing: "deposit", link: BIT })).toBe(BIT);
    expect(prepayLink({ timing: "on_pickup", link: BIT })).toBeNull();
    expect(prepayLink({ timing: "advance" })).toBeNull();
    expect(prepayLink(null)).toBeNull();
    expect(linkHost(BIT)).toBe("bitpay.co.il");
    expect(linkHost("not a url")).toBeNull();
  });

  it("a row with no link keeps its old shape", () => {
    const state = paymentStateFrom({ methods: ["cash"], timing: null, note: null });
    expect(serializePaymentInfo(state)).toEqual({ methods: ["cash"], timing: null, note: null });
    expect(serializePaymentInfo({ ...state, timing: "advance", link: ` ${BIT} ` })).toEqual({
      methods: ["cash"], timing: "advance", note: null, link: BIT,
    });
    // On «באיסוף» the link is not sent, as the API would drop it.
    expect(serializePaymentInfo({ ...state, timing: "on_pickup", link: BIT })).toEqual({
      methods: ["cash"], timing: "on_pickup", note: null,
    });
  });

  it("group buy: the button only once the group is funded", () => {
    expect(groupBuyAwaitsPayment("open")).toBe(false); // may still fail: «לא משלמים עכשיו»
    expect(groupBuyAwaitsPayment("funded")).toBe(true); // also after the deadline: pickup follows
    expect(groupBuyAwaitsPayment("fulfilled")).toBe(false);
    expect(groupBuyAwaitsPayment("cancelled")).toBe(false);
  });
});

describe("bag confirmation", () => {
  it("advance: the price says «מראש» and the button opens the link in a new tab", () => {
    render(<RescueConfirmation order={order()} prepay={{ link: BIT, timing: "advance" }} />);
    expect(screen.getByTestId("rescue-confirmation-price").textContent).toBe(
      he.rescue.confirm.pay_ahead.replace("{price}", "15"),
    );
    const a = screen.getByTestId("rescue-prepay-link");
    expect(a.getAttribute("href")).toBe(BIT);
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toContain("noopener");
    expect(a.textContent).toBe(p.cta);
    expect(screen.getByTestId("rescue-prepay-ask").textContent).toBe(p.ask_advance);
    expect(screen.getByTestId("rescue-prepay-via").textContent).toBe(p.via.replace("{host}", "bitpay.co.il"));
    // The code ties her payment to this reservation (and to a refund email).
    expect(screen.getByTestId("rescue-prepay-note").textContent).toBe(p.note.replace("{code}", "0431"));
  });

  it("deposit: the line gives the bag's price and the rest at the counter, the ask says «מקדמה»", () => {
    render(<RescueConfirmation order={order()} prepay={{ link: BIT, timing: "deposit" }} />);
    expect(screen.getByTestId("rescue-confirmation-price").textContent).toBe(
      he.rescue.confirm.pay_deposit.replace("{price}", "15"),
    );
    expect(screen.getByTestId("rescue-prepay-ask").textContent).toBe(p.ask_deposit);
  });

  it("no link: nothing new on the screen", () => {
    render(<RescueConfirmation order={order()} prepay={{ link: null, timing: null }} />);
    expect(screen.queryByTestId("rescue-prepay")).toBeNull();
    expect(screen.getByTestId("rescue-confirmation-price").textContent).toBe(
      he.rescue.confirm.pay.replace("{price}", "15"),
    );
  });

  it("a handed bag has nothing left to pay", () => {
    render(<RescueConfirmation order={order({ status: "handed" })} prepay={{ link: BIT, timing: "advance" }} />);
    expect(screen.queryByTestId("rescue-prepay")).toBeNull();
  });
});

describe("group buy member card", () => {
  const gb = (status) => ({
    id: "gb1", status, deadline: "2099-01-01T00:00:00", unit: "שק", price_per_unit_group: 45,
    producer_name: "מאפייה", units_left: null, pickup_starts_at: null, pickup_ends_at: null,
    user_committed: true, user_commit: { quantity: 1, pickup_code: "1969" },
  });
  const panel = (status, prepay) => render(
    <GroupBuyMemberPanel gb={gb(status)} joinable full={false} cancelling={false} onCancel={() => {}} onChanged={() => {}} prepay={prepay} />,
  );

  it("open: «לא משלמים עכשיו», no button (the page passes no link before funded)", () => {
    panel("open", null);
    expect(screen.getByTestId("group-buy-member-pay").textContent).toBe(he.group_buys.detail.pay_line);
    expect(screen.queryByTestId("group-buy-prepay")).toBeNull();
  });

  it("funded with a link: the button replaces «לא משלמים עכשיו» and asks for the code in the note", () => {
    panel("funded", { link: BIT, timing: "advance" });
    expect(screen.queryByTestId("group-buy-member-pay")).toBeNull();
    expect(screen.getByTestId("group-buy-prepay-link").getAttribute("href")).toBe(BIT);
    expect(screen.getByTestId("group-buy-prepay-note").textContent).toBe(p.note.replace("{code}", "1969"));
  });

  it("funded, the business gave no link: the old pay line stays", () => {
    panel("funded", { link: null, timing: null });
    expect(screen.getByTestId("group-buy-member-pay")).toBeTruthy();
  });
});

describe("dashboard field", () => {
  it("appears for «מראש» and is not sent once «באיסוף» is picked", () => {
    const profile = { payment_info: { methods: ["bit"], timing: null, note: null } };
    render(<PaymentInfoEditor profile={profile} onSave={() => {}} />);
    expect(screen.queryByTestId("payment-link")).toBeNull();
    fireEvent.click(screen.getByTestId("payment-timing-advance"));
    expect(screen.getByTestId("payment-link")).toBeTruthy();
    fireEvent.change(screen.getByTestId("payment-link"), { target: { value: BIT } });
    fireEvent.click(screen.getByTestId("payment-timing-on_pickup"));
    expect(screen.queryByTestId("payment-link")).toBeNull();
  });
});
