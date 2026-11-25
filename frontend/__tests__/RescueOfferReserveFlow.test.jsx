/**
 * The bag page's reserve flow: errors, the read-back after a reload, the
 * review, a business cancel and the buyer's own cancel.
 *
 * MEH-3586 follow-up (Sapir 22/11): these cases used to run against the
 * business page's bag block (RescueBuyerFlow.test.jsx). That block is now a
 * link card with no button, and the bag page is the only place a bag is
 * reserved, so the same behaviour is held here, on the real RescueOfferPage
 * and the real lib/useRescueReservation hook.
 *
 * Keys resolve against the REAL messages/he.json, as in RescueBuyerFlow and
 * RescueOfferPage: the strings carry the pilot's terms (pay at the counter,
 * blocked after two bags not collected), so a pass means the shipped Hebrew
 * says them.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import heMessages from "../messages/he.json";

function lookup(key) {
  return key.split(".").reduce((o, k) => (o == null ? o : o[k]), heMessages);
}

function format(raw, values = {}) {
  if (typeof raw !== "string") return raw;
  let out = raw.replace(/\{(\w+), plural,([\s\S]*)\}$/, (_m, varName, body) => {
    const n = Number(values[varName]);
    const branches = {};
    const re = /(one|two|other)\s*\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(body)) !== null) branches[m[1]] = m[2];
    const pick = n === 1 ? branches.one : n === 2 ? branches.two : branches.other;
    return (pick ?? branches.other ?? "").replace("#", String(n));
  });
  out = out.replace(/\{(\w+)\}/g, (_m, k) => (values[k] !== undefined ? String(values[k]) : `{${k}}`));
  return out;
}

// t.rich splits <tag>…</tag> and hands each chunk to its renderer (MEH-3226).
function rich(raw, values = {}) {
  const parts = [];
  const re = /<(\w+)>([^<]*)<\/\1>/g;
  let last = 0;
  let m;
  while ((m = re.exec(raw)) !== null) {
    parts.push(raw.slice(last, m.index), values[m[1]](m[2]));
    last = m.index + m[0].length;
  }
  parts.push(raw.slice(last));
  return parts;
}

// Visible text of a rich value: strip tags until nothing changes.
function plain(key) {
  let text = lookup(key);
  let previous;
  do {
    previous = text;
    text = text.replace(/<\/?\w+>/g, "");
  } while (text !== previous);
  return text;
}

vi.mock("next-intl", () => ({
  useTranslations: (ns) => {
    const t = (key, values) => format(lookup(ns ? `${ns}.${key}` : key), values);
    t.rich = (key, values) => rich(lookup(ns ? `${ns}.${key}` : key), values);
    return t;
  },
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="mini-map" /> }));
vi.mock("@/components/ShareButton", () => ({ default: () => null }));
vi.mock("@/components/HistoryBackLink", () => ({ default: () => null }));
vi.mock("@/components/RegistrationOverlays", () => ({
  useInView: () => true,
  StickyRegistrationBar: () => null,
}));
// The prompt itself is the shared LoginPromptModal (its own tests); here only
// that it opens, and where «היכנסו» sends the buyer back to.
vi.mock("@/components/LoginPromptModal", () => ({
  default: ({ open, title, nextPath }) =>
    open ? (
      <div data-testid="login-prompt" data-next={nextPath}>
        {title}
      </div>
    ) : null,
}));

const fetchOffer = vi.fn();
const reserveBag = vi.fn();
const cancelOrder = vi.fn();
const fetchMyOrders = vi.fn();
let authUser = null;

vi.mock("@/lib/auth-context", () => ({ useOptionalAuth: () => ({ user: authUser, loading: false }) }));
vi.mock("@/lib/rescue", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    rescueBagsEnabled: () => true,
    fetchOffer: (...a) => fetchOffer(...a),
    reserveBag: (...a) => reserveBag(...a),
    cancelOrder: (...a) => cancelOrder(...a),
    fetchMyOrders: (...a) => fetchMyOrders(...a),
  };
});

import RescueOfferPage from "@/app/[locale]/rescue/[offerId]/RescueOfferPage";

const PRODUCER = {
  id: "p1",
  name: "מאפיית ההצלה",
  slug: "hatzala",
  city: "חיפה",
  location_city: "חיפה",
  location_address: "הנביאים 10",
  image_url: null,
};

function offer(over = {}) {
  const now = Date.now();
  return {
    id: "o1",
    date: "2026-11-25",
    state: "available",
    qty_left: 3,
    qty_total: 4,
    price_agorot: 1500,
    value_min_agorot: null,
    value_max_agorot: null,
    pickup_start: new Date(now + 3600_000).toISOString(),
    pickup_end: new Date(now + 7200_000).toISOString(),
    cancel_until: new Date(now + 1800_000).toISOString(),
    typical_items: ["לחם", "חלה"],
    allergens: null,
    distance_km: null,
    lat: 32.79,
    lng: 34.98,
    producer: PRODUCER,
    ...over,
  };
}

function order(over = {}) {
  const now = Date.now();
  return {
    id: "ord1",
    offer_id: "o1",
    producer_id: PRODUCER.id,
    user_id: "u1",
    qty: 1,
    pickup_code: "0431",
    status: "reserved",
    handed_at: null,
    cancelled_at: null,
    cancelled_by_business: false,
    reviewed: false,
    created_at: new Date(now).toISOString(),
    price_agorot: 1500,
    cancel_until: new Date(now + 1800_000).toISOString(),
    pickup_start: new Date(now + 3600_000).toISOString(),
    pickup_end: new Date(now + 7200_000).toISOString(),
    ...over,
  };
}

async function renderPage(row = offer()) {
  fetchOffer.mockResolvedValue(row);
  render(<RescueOfferPage offerId="o1" />);
  await screen.findByTestId("rescue-offer-page");
}

async function reserved() {
  reserveBag.mockResolvedValue(order());
  await renderPage();
  fireEvent.click(await screen.findByTestId("rescue-reserve"));
  await screen.findByTestId("rescue-confirmation-code");
}

beforeEach(() => {
  vi.clearAllMocks();
  // Signed in by default: reserving is a signed-in flow.
  authUser = { id: "u1" };
  fetchMyOrders.mockResolvedValue([]);
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("the bag page — the reserve button and the confirmation", () => {
  it("the CTA says payment is AT THE COUNTER", async () => {
    await renderPage();
    expect((await screen.findByTestId("rescue-reserve")).textContent).toBe("לשריין את הסל · משלמים בקופה");
  });

  it("reserving swaps the button for the code, with no checkout page in between", async () => {
    await reserved();
    const code = screen.getByTestId("rescue-confirmation-code");
    expect(code.textContent).toBe("0431");
    expect(code.getAttribute("dir")).toBe("ltr");
    expect(screen.queryByTestId("rescue-reserve")).toBeNull();
  });

  it("the confirmation states the counter payment and the cancel cutoff", async () => {
    await reserved();
    expect(screen.getByTestId("rescue-confirmation-price").textContent).toContain("15");
    const terms = screen.getByTestId("rescue-confirmation-terms");
    expect(terms.textContent).toContain("ביטול חינם עד");
    expect(terms.textContent).toContain("אחרי שני סלים שלא נאספו, אי אפשר לשריין סלים חדשים");
  });

  it("a guest's tap opens the login prompt, which comes back to this bag", async () => {
    authUser = null;
    window.history.replaceState(null, "", "/rescue/o1");
    await renderPage();
    fireEvent.click(await screen.findByTestId("rescue-reserve"));
    const prompt = await screen.findByTestId("login-prompt");
    expect(prompt.textContent).toBe(lookup("rescue.login_prompt_title"));
    expect(prompt.getAttribute("data-next")).toBe("/rescue/o1");
    expect(reserveBag).not.toHaveBeenCalled();
  });
});

describe("the bag page — every error the API actually returns", () => {
  const cases = [
    [422, undefined, "rescue.errors.blocked"],
    [409, "לא נשארו מספיק סלים", "rescue.errors.sold_out"],
    [409, "אפשר לשריין עד שני סלים", "rescue.errors.max_two"],
    [401, undefined, "rescue.errors.sign_in"],
    [404, undefined, "rescue.errors.gone"],
    [500, undefined, "rescue.errors.generic"],
  ];

  it.each(cases)("status %s → its own message", async (status, detail, key) => {
    reserveBag.mockRejectedValue({ response: { status, data: { detail } } });
    await renderPage();
    fireEvent.click(await screen.findByTestId("rescue-reserve"));
    expect((await screen.findByTestId("rescue-section-error")).textContent).toBe(plain(key));
  });

  it("403 email_unverified → the resend notice with the reserve wording (MEH-3225)", async () => {
    reserveBag.mockRejectedValue({
      response: { status: 403, data: { detail: { code: "email_unverified", message: "יש לאמת את כתובת המייל תחילה" } } },
    });
    await renderPage();
    fireEvent.click(await screen.findByTestId("rescue-reserve"));
    const notice = await screen.findByTestId("unverified-email-notice");
    expect(notice.textContent).toContain(lookup("rescue.errors.unverified"));
    expect(notice.textContent).not.toContain(lookup("auth.verify.publish_gate"));
    expect(screen.queryByTestId("rescue-section-error")).toBeNull();
  });

  it("«כתבו לנו» on the block message links to the contact page (MEH-3226)", async () => {
    reserveBag.mockRejectedValue({ response: { status: 422, data: {} } });
    await renderPage();
    fireEvent.click(await screen.findByTestId("rescue-reserve"));
    const link = await screen.findByTestId("rescue-blocked-contact");
    expect(link.getAttribute("href")).toBe("/contact");
    expect(link.textContent).toBe("כתבו לנו");
  });

  it("no other error carries the contact link", async () => {
    reserveBag.mockRejectedValue({ response: { status: 409, data: {} } });
    await renderPage();
    fireEvent.click(await screen.findByTestId("rescue-reserve"));
    await screen.findByTestId("rescue-section-error");
    expect(screen.queryByTestId("rescue-blocked-contact")).toBeNull();
  });
});

describe("the bag page — the review", () => {
  it("appears only after the business marked the bag handed", async () => {
    await reserved();
    expect(screen.queryByTestId("rescue-review")).toBeNull();
  });

  it("a handed order read back brings up the review", async () => {
    fetchMyOrders.mockResolvedValue([order({ status: "handed" })]);
    await renderPage();
    expect(await screen.findByTestId("rescue-review")).toBeTruthy();
  });

  it("handed and already reviewed does not ask again", async () => {
    fetchMyOrders.mockResolvedValue([order({ status: "handed", reviewed: true })]);
    await renderPage();
    expect(await screen.findByTestId("rescue-review-thanks")).toBeTruthy();
    expect(screen.queryByTestId("rescue-review")).toBeNull();
  });
});

describe("the bag page — a reload keeps the order (MEH-2680)", () => {
  it("a guest is never asked for their orders: a 401 would toast «session expired»", async () => {
    authUser = null;
    await renderPage();
    await screen.findByTestId("rescue-reserve");
    expect(fetchMyOrders).not.toHaveBeenCalled();
  });

  it("the last bag sold: the page says sold out and still shows her code", async () => {
    fetchMyOrders.mockResolvedValue([order()]);
    await renderPage(offer({ state: "sold_out", qty_left: 0 }));
    expect((await screen.findByTestId("rescue-confirmation-code")).textContent).toBe("0431");
  });

  it("an order at another business is not shown here", async () => {
    fetchMyOrders.mockResolvedValue([order({ producer_id: "someone-else" })]);
    await renderPage();
    await waitFor(() => expect(fetchMyOrders).toHaveBeenCalled());
    expect(screen.queryByTestId("rescue-confirmation")).toBeNull();
    expect(screen.getByTestId("rescue-reserve")).toBeTruthy();
  });

  it("one bag handed and a newer one reserved: the reserved code is shown", async () => {
    fetchMyOrders.mockResolvedValue([
      order({ id: "old", status: "handed", pickup_code: "1111" }),
      order({ id: "new", status: "reserved", pickup_code: "2222" }),
    ]);
    await renderPage();
    const box = await screen.findByTestId("rescue-confirmation");
    expect(box.textContent).toContain("2222");
    expect(box.textContent).not.toContain("1111");
  });

  it("coming back to the tab re-reads, so «handed» shows without a reload", async () => {
    fetchMyOrders.mockResolvedValueOnce([order()]);
    await renderPage();
    await screen.findByTestId("rescue-confirmation");
    expect(screen.queryByTestId("rescue-review")).toBeNull();
    fetchMyOrders.mockResolvedValueOnce([order({ status: "handed" })]);
    window.dispatchEvent(new Event("focus"));
    expect(await screen.findByTestId("rescue-review")).toBeTruthy();
  });
});

describe("the bag page — the business cancelled the bag (MEH-2738)", () => {
  const byBusiness = (over = {}) => order({ status: "cancelled", cancelled_by_business: true, ...over });
  const TEXT = "בית העסק ביטל את הסל של היום, ולכן השריון שלכם בוטל. אין צורך להגיע.";

  it("says so in words, with no code", async () => {
    fetchMyOrders.mockResolvedValue([byBusiness()]);
    await renderPage(offer({ state: "cancelled" }));
    expect((await screen.findByTestId("rescue-business-cancelled")).textContent).toBe(TEXT);
    expect(screen.queryByTestId("rescue-confirmation")).toBeNull();
  });

  it("a code on screen gives way to the line when the tab is re-read", async () => {
    fetchMyOrders.mockResolvedValueOnce([order()]);
    await renderPage();
    await screen.findByTestId("rescue-confirmation");
    fetchMyOrders.mockResolvedValueOnce([byBusiness()]);
    window.dispatchEvent(new Event("focus"));
    expect(await screen.findByTestId("rescue-business-cancelled")).toBeTruthy();
    expect(screen.queryByTestId("rescue-confirmation")).toBeNull();
  });

  it("a bag handed over before the cancel still shows the handed order, not the line", async () => {
    fetchMyOrders.mockResolvedValue([order({ id: "got", status: "handed" }), byBusiness({ id: "lost" })]);
    await renderPage();
    expect(await screen.findByTestId("rescue-review")).toBeTruthy();
    expect(screen.queryByTestId("rescue-business-cancelled")).toBeNull();
  });

  it("a cancelled row the business did not cancel shows no line", async () => {
    fetchMyOrders.mockResolvedValue([order({ status: "cancelled" })]);
    await renderPage();
    await waitFor(() => expect(fetchMyOrders).toHaveBeenCalled());
    expect(screen.queryByTestId("rescue-business-cancelled")).toBeNull();
    expect(screen.queryByTestId("rescue-confirmation")).toBeNull();
  });

  it("another business's cancel is not shown here", async () => {
    fetchMyOrders.mockResolvedValue([byBusiness({ producer_id: "someone-else" })]);
    await renderPage();
    await waitFor(() => expect(fetchMyOrders).toHaveBeenCalled());
    expect(screen.queryByTestId("rescue-business-cancelled")).toBeNull();
  });
});

// MEH-2737 — copy approved word for word by Sapir on 6/11 («מאשרת 1-8»).
describe("the bag page — cancelling a reservation (MEH-2737)", () => {
  it("the first tap asks, and nothing is cancelled yet", async () => {
    await reserved();
    fireEvent.click(screen.getByTestId("rescue-confirmation-cancel"));
    const ask = screen.getByTestId("rescue-cancel-ask");
    expect(ask.textContent).toContain("לבטל את השריון?");
    expect(ask.textContent).toContain("הסל יחזור לרשימה ומישהו אחר יוכל לשריין אותו.");
    expect(screen.getByTestId("rescue-cancel-yes").textContent).toBe("כן, לבטל");
    expect(screen.getByTestId("rescue-cancel-no").textContent).toBe("לא, להשאיר");
    expect(cancelOrder).not.toHaveBeenCalled();
  });

  it("«לא, להשאיר» closes the question and keeps the code", async () => {
    await reserved();
    fireEvent.click(screen.getByTestId("rescue-confirmation-cancel"));
    fireEvent.click(screen.getByTestId("rescue-cancel-no"));
    expect(screen.queryByTestId("rescue-cancel-ask")).toBeNull();
    expect(screen.getByTestId("rescue-confirmation-code").textContent).toBe("0431");
    expect(cancelOrder).not.toHaveBeenCalled();
  });

  it("«כן, לבטל» cancels and says so, and the reserve button is back", async () => {
    cancelOrder.mockResolvedValue({ ...order(), status: "cancelled" });
    await reserved();
    fireEvent.click(screen.getByTestId("rescue-confirmation-cancel"));
    fireEvent.click(screen.getByTestId("rescue-cancel-yes"));
    expect((await screen.findByTestId("rescue-cancelled-notice")).textContent).toBe("השריון בוטל, והסל חזר לרשימה.");
    expect(cancelOrder).toHaveBeenCalledWith("ord1");
    expect(screen.queryByTestId("rescue-confirmation-code")).toBeNull();
    expect(screen.getByTestId("rescue-reserve")).toBeTruthy();
  });

  it("the last bag: after the cancel the re-read shows it available again, with the notice", async () => {
    fetchMyOrders.mockResolvedValue([order()]);
    cancelOrder.mockResolvedValue({ ...order(), status: "cancelled" });
    await renderPage(offer({ state: "sold_out", qty_left: 0 }));
    fireEvent.click(await screen.findByTestId("rescue-confirmation-cancel"));
    fetchMyOrders.mockResolvedValue([]);
    fetchOffer.mockResolvedValue(offer({ qty_left: 1 }));
    fireEvent.click(screen.getByTestId("rescue-cancel-yes"));
    expect((await screen.findByTestId("rescue-cancelled-notice")).textContent).toBe("השריון בוטל, והסל חזר לרשימה.");
    expect((await screen.findByTestId("rescue-offer-stock")).textContent).toBe("נשאר סל אחד");
  });

  it("a cancel refused because the cutoff passed says so, and the code stays", async () => {
    // The page loaded before the cutoff; it passes while the request is in
    // flight, and the server refuses with 409.
    reserveBag.mockResolvedValue(order({ cancel_until: new Date(Date.now() + 400).toISOString() }));
    cancelOrder.mockImplementation(
      () => new Promise((_res, rej) => setTimeout(() => rej({ response: { status: 409, data: { detail: "x" } } }), 700)),
    );
    await renderPage();
    fireEvent.click(await screen.findByTestId("rescue-reserve"));
    await screen.findByTestId("rescue-confirmation-code");
    fireEvent.click(screen.getByTestId("rescue-confirmation-cancel"));
    fireEvent.click(screen.getByTestId("rescue-cancel-yes"));
    expect((await screen.findByTestId("rescue-section-error")).textContent).toBe(
      "מועד הביטול החינמי כבר עבר, אז השריון נשאר בתוקף.",
    );
    expect(screen.getByTestId("rescue-confirmation-code").textContent).toBe("0431");
    await waitFor(() => expect(screen.queryByTestId("rescue-cancel-ask")).toBeNull());
  });

  it("a 409 before the cutoff on an order still reserved is not called «too late»", async () => {
    cancelOrder.mockRejectedValue({ response: { status: 409, data: { detail: "x" } } });
    await reserved();
    fetchMyOrders.mockResolvedValue([order()]);
    fireEvent.click(screen.getByTestId("rescue-confirmation-cancel"));
    fireEvent.click(screen.getByTestId("rescue-cancel-yes"));
    expect((await screen.findByTestId("rescue-section-error")).textContent).toBe(lookup("rescue.errors.generic"));
  });

  it("a 409 because it was already cancelled elsewhere shows the cancelled notice", async () => {
    cancelOrder.mockRejectedValue({ response: { status: 409, data: { detail: "x" } } });
    await reserved();
    fetchMyOrders.mockResolvedValue([]);
    fireEvent.click(screen.getByTestId("rescue-confirmation-cancel"));
    fireEvent.click(screen.getByTestId("rescue-cancel-yes"));
    expect((await screen.findByTestId("rescue-cancelled-notice")).textContent).toBe("השריון בוטל, והסל חזר לרשימה.");
    expect(screen.queryByTestId("rescue-section-error")).toBeNull();
    expect(screen.queryByTestId("rescue-confirmation-code")).toBeNull();
  });

  it("a 409 because the business cancelled meanwhile says the business did", async () => {
    cancelOrder.mockRejectedValue({ response: { status: 409, data: { detail: "x" } } });
    await reserved();
    fetchMyOrders.mockResolvedValue([order({ status: "cancelled", cancelled_by_business: true })]);
    fireEvent.click(screen.getByTestId("rescue-confirmation-cancel"));
    fireEvent.click(screen.getByTestId("rescue-cancel-yes"));
    expect(await screen.findByTestId("rescue-business-cancelled")).toBeTruthy();
    expect(screen.queryByTestId("rescue-section-error")).toBeNull();
  });

  it("a 409 because the bag was handed meanwhile shows the handed order, no error", async () => {
    cancelOrder.mockRejectedValue({ response: { status: 409, data: { detail: "x" } } });
    await reserved();
    fetchMyOrders.mockResolvedValue([order({ status: "handed" })]);
    fireEvent.click(screen.getByTestId("rescue-confirmation-cancel"));
    fireEvent.click(screen.getByTestId("rescue-cancel-yes"));
    expect(await screen.findByTestId("rescue-review")).toBeTruthy();
    expect(screen.queryByTestId("rescue-section-error")).toBeNull();
  });

  it("any other cancel failure shows the generic line next to the code", async () => {
    cancelOrder.mockRejectedValue({ response: { status: 500 } });
    await reserved();
    fireEvent.click(screen.getByTestId("rescue-confirmation-cancel"));
    fireEvent.click(screen.getByTestId("rescue-cancel-yes"));
    expect((await screen.findByTestId("rescue-section-error")).textContent).toBe(lookup("rescue.errors.generic"));
  });
});

describe("the bag page — the free-cancel line under the button (MEH-2737)", () => {
  // Date frozen at 10:00 Israel (08:00 UTC, winter): on the real clock the
  // default cutoff (now + 30 min) is already tomorrow from 23:30 Israel, and
  // the bare «today» time would go red at that hour (MEH-3704 CI).
  it("before the cutoff it gives the time, and leaves the no-show rule to the confirmation", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-12-10T08:00:00Z"));
      await renderPage(offer());
      const terms = await screen.findByTestId("rescue-section-terms");
      expect(terms.textContent).toBe("ביטול חינם עד 10:30");
      expect(terms.textContent).not.toContain("לא נאספו");
    } finally {
      vi.useRealTimers();
    }
  });

  it("past the cutoff it says the bag can no longer be cancelled, never a time that has passed", async () => {
    await renderPage(offer({ cancel_until: new Date(Date.now() - 60_000).toISOString() }));
    expect((await screen.findByTestId("rescue-section-terms")).textContent).toBe("את הסל הזה כבר אי אפשר לבטל");
  });
});

describe("the bag page — allergens (MEH-2752)", () => {
  it("an empty list is treated as «not declared», never as «none»", async () => {
    await renderPage(offer({ allergens: [] }));
    expect(screen.getByTestId("rescue-offer-allergens-none")).toBeTruthy();
  });
});
