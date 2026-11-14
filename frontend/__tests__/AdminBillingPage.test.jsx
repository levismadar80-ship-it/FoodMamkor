// MEH-3182 — the admin's read-only billing view. Rendered with the REAL he
// messages, so the plural forms and the amounts are what the admin reads.
// States: error · 0 businesses · 1 · many (5-state rule).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";

// A plain function, not vi.fn: vitest tracks a spy's returned promise, and a
// rejected one then fails the test even though the page catches it.
const { fetchState } = vi.hoisted(() => ({
  fetchState: { calls: [], reply: () => Promise.resolve({ data: null }) },
}));
vi.mock("@/lib/api", () => ({
  default: {
    get: (...args) => (fetchState.calls.push(args), fetchState.reply()),
  },
}));
const get = {
  mock: fetchState,
  mockResolvedValue: (value) => {
    fetchState.reply = () => Promise.resolve(value);
  },
  mockRejectedValue: (error) => {
    fetchState.reply = () => Promise.reject(error);
  },
};
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import AdminBillingPage from "../app/[locale]/admin/billing/page";

const overview = (rows, extra = {}) => ({
  month: "2026-11",
  threshold_agorot: 100000,
  businesses_over_threshold: rows.filter((r) => r.over_threshold).length,
  businesses_over_two_months: rows.filter((r) => r.months_over_in_a_row >= 2)
    .length,
  start_billing_businesses: 10,
  start_billing_months: 2,
  would_pay_total_agorot: rows.reduce((sum, r) => sum + r.would_pay_agorot, 0),
  phase: "launch",
  history: [
    {
      month: "2026-11",
      businesses: rows.length,
      businesses_over_threshold: 0,
      value_agorot: 0,
      would_pay_total_agorot: 0,
    },
  ],
  rows,
  ...extra,
});
let rowNo = 0;
const row = (name, over, extra = {}) => ({
  // The page parses the answer, so the id has to be a real uuid.
  producer_id: `00000000-0000-4000-8000-${String(++rowNo).padStart(12, "0")}`,
  name,
  bookings: 1,
  value_agorot: over ? 120000 : 30000,
  over_threshold: over,
  months_over_in_a_row: over ? 1 : 0,
  would_pay_agorot: over ? 6000 : 0,
  ...extra,
});

const show = () =>
  render(
    <NextIntlClientProvider locale="he" messages={he}>
      <AdminBillingPage />
    </NextIntlClientProvider>,
  );

const past = (label, businesses, over, pay) => ({
  month: label,
  businesses,
  businesses_over_threshold: over,
  value_agorot: pay * 20,
  would_pay_total_agorot: pay,
});

describe("AdminBillingPage (MEH-3182)", () => {
  beforeEach(() => {
    fetchState.calls.length = 0;
    get.mockResolvedValue({ data: null });
  });

  it("asks the admin overview route and nothing else", async () => {
    get.mockResolvedValue({ data: overview([]) });
    show();
    await screen.findByTestId("admin-billing");
    expect(get.mock.calls).toEqual([["/admin/billing/overview"]]);
  });

  it("says in words that billing is off and that it is not time yet", async () => {
    get.mockResolvedValue({ data: overview([]) });
    show();
    const off = await screen.findByTestId("admin-billing-switch");
    expect(off).toHaveTextContent("החיוב כבוי");
    expect(off).toHaveTextContent("אף בית עסק לא משלם לאתר כרגע");
    expect(screen.getByTestId("admin-billing-ready-answer")).toHaveTextContent(
      "עדיין לא",
    );
    // The rule is a full sentence with the goal and the amount spelled out.
    expect(screen.getByTestId("admin-billing-threshold").textContent).toBe(
      "מתחילים לגבות כש-10 בתי עסק מקבלים דרך האתר הזמנות בתשלום של 1,000₪ ומעלה בחודש, חודשיים ברצף.",
    );
    expect(screen.getByTestId("admin-billing-two-months").textContent).toBe(
      "כרגע: 0 מתוך 10 בתי עסק",
    );
  });

  it("every number in the rule comes from the server: other values give another sentence", async () => {
    // Guards the mistake of 14/11: «חודשיים ברצף» was typed into the copy, so
    // changing the rule on the server would have left the screen saying two.
    get.mockResolvedValue({
      data: {
        ...overview([]),
        threshold_agorot: 150000,
        start_billing_businesses: 7,
        start_billing_months: 3,
      },
    });
    show();
    await screen.findByTestId("admin-billing");
    expect(screen.getByTestId("admin-billing-threshold").textContent).toBe(
      "מתחילים לגבות כש-7 בתי עסק מקבלים דרך האתר הזמנות בתשלום של 1,500₪ ומעלה בחודש, 3 חודשים ברצף.",
    );
    expect(screen.getByTestId("admin-billing-two-months").textContent).toBe(
      "כרגע: 0 מתוך 7 בתי עסק",
    );
  });

  it.each(["he", "en"])(
    "no digit is typed into a billing sentence (%s): numbers arrive as values",
    (locale) => {
      const messages = locale === "he" ? he : en;
      const typed = Object.entries(messages.admin.billing).filter(([, text]) =>
        /\d/.test(String(text)),
      );
      expect(typed).toEqual([]);
      // The check sees a digit when one is there.
      expect(/\d/.test("10 בתי עסק")).toBe(true);
    },
  );

  it("no screen sentence uses the word «סף»: a new admin reads amounts, not jargon", () => {
    // The check itself sees the word when it is there.
    expect(/(^|[\s«])ל?ה?סף([\s.,:»]|$)/.test("עברו את הסף החודש")).toBe(true);
    const withJargon = Object.entries(he.admin.billing).filter(([, text]) =>
      // The word on its own; «כסף» contains the letters and is fine.
      /(^|[\s«])ל?ה?סף([\s.,:»]|$)/.test(text),
    );
    expect(withJargon).toEqual([]);
  });

  it("0 businesses: the empty line and zeros", async () => {
    get.mockResolvedValue({ data: overview([]) });
    show();
    expect(await screen.findByTestId("admin-billing-empty")).toHaveTextContent(
      he.admin.billing.empty,
    );
    expect(screen.queryByTestId("admin-billing-row")).toBeNull();
    expect(screen.getByTestId("admin-billing-over").textContent).toBe("0");
    expect(screen.getByTestId("admin-billing-would-pay").textContent).toBe(
      "0₪",
    );
  });

  it("1 business that has not reached the amount: says so, and no would-pay line", async () => {
    get.mockResolvedValue({ data: overview([row("דבש הגליל", false)]) });
    show();
    const item = await screen.findByTestId("admin-billing-row");
    expect(item.textContent).toBe(
      "דבש הגלילהזמנה אחת דרך האתר, בסך 300₪עוד לא הגיע ל-1,000₪ החודש, ולכן לא היה משלם.",
    );
  });

  it("many businesses: each row its own sentences, the month card carries the server's totals", async () => {
    get.mockResolvedValue({
      data: overview([
        row("מאפייה", true, { months_over_in_a_row: 2, bookings: 14 }),
        row("גבינות", true, { months_over_in_a_row: 1, bookings: 2 }),
        row("דבש", false),
      ]),
    });
    show();
    const items = await screen.findAllByTestId("admin-billing-row");
    expect(items.map((item) => item.textContent)).toEqual([
      "מאפייה14 הזמנות דרך האתר, בסך 1,200₪הגיע ל-1,000₪ החודש. זה החודש השני ברצף.היה משלם לאתר החודש: 60₪",
      "גבינותשתי הזמנות דרך האתר, בסך 1,200₪הגיע ל-1,000₪ החודש. זה החודש הראשון ברצף.היה משלם לאתר החודש: 60₪",
      "דבשהזמנה אחת דרך האתר, בסך 300₪עוד לא הגיע ל-1,000₪ החודש, ולכן לא היה משלם.",
    ]);
    expect(screen.getByTestId("admin-billing-over").textContent).toBe("2");
    expect(screen.getByTestId("admin-billing-would-pay").textContent).toBe(
      "120₪",
    );
    expect(screen.getByTestId("admin-billing-two-months").textContent).toBe(
      "כרגע: 1 מתוך 10 בתי עסק",
    );
  });

  it("the answer turns to «כן» only when the goal is met", async () => {
    get.mockResolvedValue({
      data: overview([], { businesses_over_two_months: 10 }),
    });
    show();
    expect(
      await screen.findByTestId("admin-billing-ready-answer"),
    ).toHaveTextContent("כן, הגיע הזמן");
  });

  it("earlier months: no bookings · nobody reached the amount · one · two · many; the current month is not repeated", async () => {
    get.mockResolvedValue({
      data: overview([], {
        history: [
          past("2026-11", 4, 3, 17500),
          past("2026-10", 4, 3, 17500),
          past("2026-09", 3, 2, 9000),
          past("2026-08", 2, 1, 6000),
          past("2026-07", 1, 0, 0),
          past("2026-06", 0, 0, 0),
        ],
      }),
    });
    show();
    const lines = await screen.findAllByTestId("admin-billing-history-month");
    expect(lines.map((line) => line.textContent)).toEqual([
      "אוקטובר 20263 בתי עסק היו משלמים, בסך הכול 175₪",
      "ספטמבר 2026שני בתי עסק היו משלמים, בסך הכול 90₪",
      "אוגוסט 2026בית עסק אחד היה משלם, בסך הכול 60₪",
      "יולי 2026אף בית עסק לא הגיע ל-1,000₪",
      "יוני 2026לא היו הזמנות דרך האתר",
    ]);
  });

  it("a failed fetch shows an error, never a screen of zeros", async () => {
    get.mockRejectedValue(new Error("down"));
    show();
    expect(await screen.findByTestId("admin-billing-error")).toHaveTextContent(
      he.admin.billing.load_error,
    );
    expect(screen.queryByTestId("admin-billing")).toBeNull();
    expect(screen.queryByTestId("admin-billing-over")).toBeNull();
  });

  it.each(["would_pay_total_agorot", "phase", "history"])(
    "an answer without %s (an older server) is the error state, not a half-filled screen",
    async (field) => {
      const { [field]: _dropped, ...older } = overview([]);
      get.mockResolvedValue({ data: older });
      show();
      expect(await screen.findByTestId("admin-billing-error")).toHaveAttribute(
        "role",
        "alert",
      );
      expect(screen.queryByTestId("admin-billing")).toBeNull();
    },
  );

  it("billing reads as on only when the server says so", async () => {
    get.mockResolvedValue({ data: overview([], { phase: "billing" }) });
    show();
    expect(await screen.findByTestId("admin-billing-switch")).toHaveTextContent(
      he.admin.billing.switch_on_title,
    );
  });
});
