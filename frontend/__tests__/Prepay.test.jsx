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
import { prepayLink, linkHost, serializePaymentInfo, paymentStateFrom } from "@/lib/payment-info";

vi.mock("@/lib/api", () => ({ default: { put: vi.fn(() => Promise.resolve({})) } }));

const { default: RescueConfirmation } = await import("@/components/rescue/RescueConfirmation");
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
  });

  it("deposit: the counter price stays, the ask says «מקדמה»", () => {
    render(<RescueConfirmation order={order()} prepay={{ link: BIT, timing: "deposit" }} />);
    expect(screen.getByTestId("rescue-confirmation-price").textContent).toBe(
      he.rescue.confirm.pay.replace("{price}", "15"),
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
