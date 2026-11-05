/**
 * MEH-2648 — the buyer's rescue-bag screens (chunk 4/4 of MEH-2643).
 *
 * Keys resolve against the REAL messages/he.json, not an echo of the key path:
 * the strings under test carry the pilot's commercial terms ("pay at the
 * counter", "two no-shows = blocked"), so a test that passed while the shipped
 * Hebrew said something else would be worthless (the MEH-1909 shape, and the
 * reason RescueCollectionNotice-style files do the same).
 *
 * FIVE-STATE COVERAGE is asserted as a MATRIX, not two lists (CLAUDE.md):
 * (0 / 1 / many bags) × (bag not reserved / reserved), counted as cells. The
 * orphan the rule exists for is (many × reserved) — covered below.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import heMessages from "../messages/he.json";

function lookup(key) {
  return key.split(".").reduce((o, k) => (o == null ? o : o[k]), heMessages);
}

// Minimal ICU: only the {name} substitution and plural selection these keys use.
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

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key, values) => format(lookup(ns ? `${ns}.${key}` : key), values),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

const fetchOffers = vi.fn();
const reserveBag = vi.fn();
const cancelOrder = vi.fn();
const submitReview = vi.fn();
const fetchMyOrders = vi.fn();
let flagOn = true;
let authUser = null;

vi.mock("@/lib/auth-context", () => ({
  useOptionalAuth: () => ({ user: authUser }),
}));

vi.mock("@/lib/rescue", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    rescueBagsEnabled: () => flagOn,
    fetchOffers: (...a) => fetchOffers(...a),
    reserveBag: (...a) => reserveBag(...a),
    cancelOrder: (...a) => cancelOrder(...a),
    submitReview: (...a) => submitReview(...a),
    fetchMyOrders: (...a) => fetchMyOrders(...a),
  };
});

vi.mock("@/components/CitySearch", () => ({
  default: ({ value, onChange, onSubmit, label }) => (
    <label>
      {label}
      <input
        data-testid="city-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit?.()}
      />
    </label>
  ),
}));

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
    id: over.id || "o1",
    date: "2026-11-04",
    qty_left: 3,
    qty_total: 4,
    price_agorot: 1500,
    value_min_agorot: null,
    value_max_agorot: null,
    pickup_start: new Date(now + 3600_000).toISOString(),
    pickup_end: new Date(now + 7200_000).toISOString(),
    cancel_until: new Date(now + 1800_000).toISOString(),
    producer: PRODUCER,
    typical_items: ["לחם", "חלה"],
    distance_km: 0.8,
    ...over,
  };
}

function order(over = {}) {
  const now = Date.now();
  return {
    id: "ord1",
    offer_id: "o1",
    user_id: "u1",
    qty: 1,
    pickup_code: "0431",
    status: "reserved",
    handed_at: null,
    cancelled_at: null,
    created_at: new Date(now).toISOString(),
    price_agorot: 1500,
    cancel_until: new Date(now + 1800_000).toISOString(),
    pickup_start: new Date(now + 3600_000).toISOString(),
    pickup_end: new Date(now + 7200_000).toISOString(),
    ...over,
  };
}

let RescueSection;
let RescueList;
let RescueHomeModule;
let RescueConfirmation;

beforeEach(async () => {
  vi.clearAllMocks();
  flagOn = true;
  // Signed in by default: the reserve flow is a signed-in flow. Guest cases
  // set it to null themselves.
  authUser = { id: "u1" };
  fetchMyOrders.mockResolvedValue([]);
  fetchOffers.mockResolvedValue([offer()]);
  ({ default: RescueSection } = await import("@/components/rescue/RescueSection"));
  ({ default: RescueList } = await import("@/components/rescue/RescueList"));
  ({ default: RescueHomeModule } = await import("@/components/rescue/RescueHomeModule"));
  ({ default: RescueConfirmation } = await import("@/components/rescue/RescueConfirmation"));
});

afterEach(() => {
  vi.resetModules();
});

describe("the flag gate", () => {
  it("renders nothing at all when the pilot is off", async () => {
    flagOn = false;
    const { container } = render(<RescueHomeModule city="חיפה" />);
    expect(container.firstChild).toBeNull();
    // Control: the same component with the flag on DOES render, so the null
    // above is the flag and not a broken component.
    flagOn = true;
    render(<RescueHomeModule city="חיפה" />);
    expect(await screen.findByTestId("rescue-home-module")).toBeTruthy();
  });

  it("does not even ask the API while the pilot is off", async () => {
    flagOn = false;
    render(<RescueHomeModule city="חיפה" />);
    await waitFor(() => expect(fetchOffers).not.toHaveBeenCalled());
  });
});

describe("the list — 0 / 1 / many", () => {
  it("0 bags says so, and in the town's name when a town is set", async () => {
    fetchOffers.mockResolvedValue([]);
    render(<RescueList initialCity="חיפה" />);
    const empty = await screen.findByTestId("rescue-list-empty");
    expect(empty.textContent).toBe(lookup("rescue.list.empty_city").replace("{city}", "חיפה"));
  });

  it("0 bags with no town set uses the town-less copy", async () => {
    fetchOffers.mockResolvedValue([]);
    render(<RescueList />);
    expect((await screen.findByTestId("rescue-list-empty")).textContent).toBe(
      lookup("rescue.list.empty"),
    );
  });

  it("1 bag uses the singular count, not '1 בתי עסק'", async () => {
    fetchOffers.mockResolvedValue([offer()]);
    render(<RescueList />);
    const count = await screen.findByTestId("rescue-list-count");
    expect(count.textContent).toBe("סל אחד");
  });

  it("2 bags use the Hebrew DUAL, which en.json has no branch for", async () => {
    fetchOffers.mockResolvedValue([offer({ id: "a" }), offer({ id: "b" })]);
    render(<RescueList />);
    expect((await screen.findByTestId("rescue-list-count")).textContent).toBe("שני סלים");
  });

  it("many bags use the plural with the number", async () => {
    fetchOffers.mockResolvedValue(["a", "b", "c", "d"].map((id) => offer({ id })));
    render(<RescueList />);
    expect((await screen.findByTestId("rescue-list-count")).textContent).toBe("4 סלים");
  });

  it("a failed fetch is not an empty list — different copy", async () => {
    fetchOffers.mockRejectedValue(new Error("network"));
    render(<RescueList />);
    expect(await screen.findByTestId("rescue-list-error")).toBeTruthy();
    expect(screen.queryByTestId("rescue-list-empty")).toBeNull();
  });

  it("the home module shows at most three rows however many come back", async () => {
    fetchOffers.mockResolvedValue(["a", "b", "c", "d", "e"].map((id) => offer({ id })));
    render(<RescueHomeModule city="חיפה" />);
    const rows = await screen.findAllByTestId("rescue-bag-row");
    expect(rows).toHaveLength(3);
  });
});

describe("the home module — only when the town has bags", () => {
  it("renders nothing with no town, and does not ask the API", async () => {
    const { container } = render(<RescueHomeModule city="" />);
    await waitFor(() => expect(fetchOffers).not.toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the town has 0 bags — no heading, no empty line", async () => {
    fetchOffers.mockResolvedValue([]);
    const { container } = render(<RescueHomeModule city="תל אביב-יפו" />);
    await waitFor(() => expect(fetchOffers).toHaveBeenCalledWith({ city: "תל אביב-יפו" }));
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("rescue-list-empty")).toBeNull();
  });

  it("renders nothing when the fetch fails", async () => {
    fetchOffers.mockRejectedValue(new Error("down"));
    const { container } = render(<RescueHomeModule city="חיפה" />);
    await waitFor(() => expect(fetchOffers).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it("1 bag: heading names the town, link says «לכל הסלים», no town field, no count line", async () => {
    render(<RescueHomeModule city="חיפה" />);
    expect((await screen.findByTestId("rescue-home-module")).textContent).toContain("מה נשאר היום בחיפה");
    expect(screen.getByTestId("rescue-home-all").textContent).toBe(lookup("rescue.home.all"));
    expect(screen.getAllByTestId("rescue-bag-row")).toHaveLength(1);
    expect(screen.queryByTestId("city-input")).toBeNull();
    expect(screen.queryByTestId("rescue-list-count")).toBeNull();
  });

  it("many bags: three rows, and the link counts all of them", async () => {
    fetchOffers.mockResolvedValue(["a", "b", "c", "d", "e"].map((id) => offer({ id })));
    render(<RescueHomeModule city="חיפה" />);
    expect(await screen.findAllByTestId("rescue-bag-row")).toHaveLength(3);
    expect(screen.getByTestId("rescue-home-all").textContent).toBe("לכל 5 הסלים ←");
  });

  it("a town change mid-flight: the older answer never paints", async () => {
    let releaseOld;
    fetchOffers
      .mockImplementationOnce(() => new Promise((r) => { releaseOld = r; }))
      .mockResolvedValueOnce([]);
    const { rerender, container } = render(<RescueHomeModule city="זכרון יעקב" />);
    rerender(<RescueHomeModule city="תל אביב-יפו" />);
    await waitFor(() => expect(fetchOffers).toHaveBeenCalledTimes(2));
    releaseOld([offer()]);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.firstChild).toBeNull();
  });
});

describe("the full list — the town arrives late (staging 5/11)", () => {
  it("the field follows the town, and the town-less answer cannot overwrite it", async () => {
    let releaseTownless;
    fetchOffers
      .mockImplementationOnce(() => new Promise((r) => { releaseTownless = r; }))
      .mockResolvedValueOnce([]);
    const { rerender } = render(<RescueList initialCity="" />);
    rerender(<RescueList initialCity="תל אביב-יפו" />);
    expect((await screen.findByTestId("rescue-list-empty")).textContent).toContain("תל אביב-יפו");
    expect(screen.getByTestId("city-input").value).toBe("תל אביב-יפו");
    releaseTownless([offer()]);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("rescue-bag-row")).toBeNull();
    expect(screen.getByTestId("rescue-list-empty")).toBeTruthy();
  });
});

describe("the row", () => {
  it("prefixes the pickup window and puts km in a bdi", async () => {
    render(<RescueList />);
    const pickup = await screen.findByTestId("rescue-row-pickup");
    expect(pickup.textContent.startsWith("איסוף")).toBe(true);
    const distance = screen.getByTestId("rescue-row-distance");
    // The number must sit inside <bdi dir="ltr"> or "0.8" renders reversed.
    const bdi = distance.querySelector("bdi");
    expect(bdi).not.toBeNull();
    expect(bdi.getAttribute("dir")).toBe("ltr");
    expect(bdi.textContent).toBe("0.8");
    expect(distance.textContent).toContain(lookup("rescue.row.km"));
    expect(distance.textContent).toContain("בערך");
  });

  it("the row heading is h2 on /rescue (under its h1) and h3 under the home block's h2", async () => {
    const { unmount } = render(<RescueList />);
    expect((await screen.findByTestId("rescue-row-name")).tagName).toBe("H2");
    unmount();
    render(<RescueHomeModule city="חיפה" />);
    expect((await screen.findByTestId("rescue-row-name")).tagName).toBe("H3");
  });

  it("leads with the pickup time and says until when", async () => {
    render(<RescueList />);
    const pickup = await screen.findByTestId("rescue-row-pickup");
    expect(pickup.textContent).toContain(lookup("rescue.row.pickup_label"));
    expect(pickup.textContent).toMatch(/\d\d:\d\d/);
    expect(pickup.textContent).toContain("עד ");
  });

  it("shows what is usually in the bag, and the short stock line", async () => {
    render(<RescueList />);
    expect((await screen.findByTestId("rescue-row-where")).textContent).toContain("לחם, חלה");
    expect(screen.getByTestId("rescue-row-stock").textContent).toBe("נשארו 3");
  });

  it("two bags left use the Hebrew dual branch: «נשארו 2»", async () => {
    fetchOffers.mockResolvedValue([offer({ qty_left: 2 })]);
    render(<RescueList />);
    expect((await screen.findByTestId("rescue-row-stock")).textContent).toBe("נשארו 2");
  });

  it("one bag left reads «נשאר 1»", async () => {
    fetchOffers.mockResolvedValue([offer({ qty_left: 1 })]);
    render(<RescueList />);
    expect((await screen.findByTestId("rescue-row-stock")).textContent).toBe("נשאר 1");
  });

  it("strikes the declared worth only when it is above the price", async () => {
    fetchOffers.mockResolvedValue([
      offer({ id: "a", value_min_agorot: 4500, value_max_agorot: 6000 }),
      offer({ id: "b", value_min_agorot: 1000 }),
    ]);
    render(<RescueList />);
    const worth = await screen.findAllByTestId("rescue-row-worth");
    expect(worth).toHaveLength(1);
    expect(worth[0].tagName).toBe("S");
    expect(worth[0].textContent).toBe("45 ₪");
  });

  it("«עוד שעה» only when pickup opens within the hour", async () => {
    const now = Date.now();
    fetchOffers.mockResolvedValue([
      offer({ id: "soon", pickup_start: new Date(now + 30 * 60_000).toISOString() }),
      offer({ id: "later", pickup_start: new Date(now + 3 * 3600_000).toISOString() }),
      offer({ id: "open", pickup_start: new Date(now - 10 * 60_000).toISOString() }),
    ]);
    render(<RescueList />);
    await screen.findAllByTestId("rescue-bag-row");
    expect(screen.getAllByTestId("rescue-row-soon")).toHaveLength(1);
  });

  it("no photo gets a tile, never an empty box; a photo becomes the background", async () => {
    fetchOffers.mockResolvedValue([
      offer({ id: "a" }),
      offer({ id: "b", producer: { ...PRODUCER, image_url: "https://res.cloudinary.com/x/image/upload/v1/p.jpg" } }),
    ]);
    render(<RescueList />);
    const [noPhoto, photo] = await screen.findAllByTestId("rescue-row-image");
    expect(noPhoto.querySelector("svg")).not.toBeNull();
    expect(photo.style.backgroundImage).toContain("res.cloudinary.com");
  });

  it("links to the business page, where the only reserve button lives", async () => {
    render(<RescueList />);
    const row = await screen.findByTestId("rescue-bag-row");
    expect(row.getAttribute("href")).toBe("/producer/hatzala");
    expect(screen.queryByTestId("rescue-reserve")).toBeNull();
  });
});

describe("the business-page section — reserve and confirm", () => {
  it("quotes the price AT THE COUNTER on the CTA", async () => {
    render(<RescueSection producer={PRODUCER} />);
    const cta = await screen.findByTestId("rescue-reserve");
    expect(cta.textContent).toBe("לשריין · 15 ₪ בקופה");
    expect(cta.textContent).toContain("בקופה");
  });

  it("shows the full address and the typical contents", async () => {
    render(<RescueSection producer={PRODUCER} />);
    expect((await screen.findByTestId("rescue-section-address")).textContent).toContain("הנביאים 10");
    expect(screen.getByTestId("rescue-section-typical").textContent).toBe("בדרך כלל: לחם, חלה");
  });

  it("renders nothing when this business has no bag today", async () => {
    fetchOffers.mockResolvedValue([offer({ producer: { ...PRODUCER, id: "someone-else" } })]);
    const { container } = render(<RescueSection producer={PRODUCER} />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("reserving swaps the CTA for the code — no checkout page in between", async () => {
    reserveBag.mockResolvedValue(order());
    render(<RescueSection producer={PRODUCER} />);
    fireEvent.click(await screen.findByTestId("rescue-reserve"));
    const code = await screen.findByTestId("rescue-confirmation-code");
    expect(code.textContent).toBe("0431");
    expect(code.getAttribute("dir")).toBe("ltr");
    expect(screen.queryByTestId("rescue-reserve")).toBeNull();
  });

  it("the confirmation states the counter payment and the cancel cutoff", async () => {
    reserveBag.mockResolvedValue(order());
    render(<RescueSection producer={PRODUCER} />);
    fireEvent.click(await screen.findByTestId("rescue-reserve"));
    expect((await screen.findByTestId("rescue-confirmation-price")).textContent).toContain("15");
    const terms = screen.getByTestId("rescue-confirmation-terms");
    expect(terms.textContent).toContain("ביטול חינם עד");
    expect(terms.textContent).toContain("שתי אי-הגעות = חסימה");
  });

  it("there is no countdown anywhere in the confirmation", async () => {
    render(<RescueConfirmation order={order()} />);
    const text = screen.getByTestId("rescue-confirmation").textContent;
    // The 10-minute hold was removed on 03/11; no minutes-remaining copy.
    expect(text).not.toMatch(/דק׳\s*$/);
    expect(text).not.toContain("שמור לך עוד");
  });

  it("does not promise an SMS, because nothing here sends one", async () => {
    render(<RescueConfirmation order={order()} />);
    expect(screen.getByTestId("rescue-confirmation").textContent).not.toContain("SMS");
  });

  it("'collect' lights up only once the pickup window has opened", async () => {
    const { unmount } = render(<RescueConfirmation order={order()} />);
    const before = screen.getByTestId("rescue-confirmation-steps").children[2];
    expect(before.className).toContain("text-fg-muted");
    unmount();

    render(
      <RescueConfirmation
        order={order({ pickup_start: new Date(Date.now() - 60_000).toISOString() })}
      />,
    );
    const after = screen.getByTestId("rescue-confirmation-steps").children[2];
    expect(after.className).toContain("font-semibold");
  });
});

describe("every error the API actually returns", () => {
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
    render(<RescueSection producer={PRODUCER} />);
    fireEvent.click(await screen.findByTestId("rescue-reserve"));
    const err = await screen.findByTestId("rescue-section-error");
    expect(err.textContent).toBe(lookup(key));
  });

  it("the block message is the backend's string, verbatim", () => {
    // If these two ever diverge the buyer is told one thing by the API and
    // another by the page. routers/rescue.py BLOCKED_DETAIL is the source.
    expect(lookup("rescue.errors.blocked")).toBe(
      "ההזמנות חסומות אחרי שתי אי-הגעות. כתבו לנו",
    );
  });
});

describe("5-state matrix — (0 / 1 / many) × (not reserved / reserved)", () => {
  // Counted as CELLS, not as two lists: the orphan this rule exists for is
  // (many × reserved), which a per-axis count reports as covered (MEH-1583).
  const counts = [0, 1, 4];

  it.each(counts)("%s bags × NOT reserved", async (n) => {
    fetchOffers.mockResolvedValue(Array.from({ length: n }, (_, i) => offer({ id: `x${i}` })));
    render(<RescueList />);
    if (n === 0) {
      expect(await screen.findByTestId("rescue-list-empty")).toBeTruthy();
    } else {
      expect(await screen.findAllByTestId("rescue-bag-row")).toHaveLength(n);
    }
    expect(screen.queryByTestId("rescue-confirmation")).toBeNull();
  });

  it.each(counts)("%s bags × reserved (the section shows the code, list unaffected)", async (n) => {
    fetchOffers.mockResolvedValue(
      n === 0
        ? []
        : [offer(), ...Array.from({ length: n - 1 }, (_, i) => offer({ id: `y${i}`, producer: { ...PRODUCER, id: `other${i}` } }))],
    );
    reserveBag.mockResolvedValue(order());
    render(<RescueSection producer={PRODUCER} />);
    if (n === 0) {
      // No bag for this business → nothing to reserve, so no confirmation.
      await waitFor(() => expect(screen.queryByTestId("rescue-reserve")).toBeNull());
      expect(screen.queryByTestId("rescue-confirmation")).toBeNull();
      return;
    }
    fireEvent.click(await screen.findByTestId("rescue-reserve"));
    expect(await screen.findByTestId("rescue-confirmation")).toBeTruthy();
  });
});

describe("the review", () => {
  it("appears only after the business marked the bag handed", async () => {
    reserveBag.mockResolvedValue(order({ status: "reserved" }));
    const { unmount } = render(<RescueSection producer={PRODUCER} />);
    fireEvent.click(await screen.findByTestId("rescue-reserve"));
    await screen.findByTestId("rescue-confirmation");
    expect(screen.queryByTestId("rescue-review")).toBeNull();
    unmount();

    reserveBag.mockResolvedValue(order({ status: "handed" }));
    render(<RescueSection producer={PRODUCER} />);
    fireEvent.click(await screen.findByTestId("rescue-reserve"));
    expect(await screen.findByTestId("rescue-review")).toBeTruthy();
  });

  it("cannot submit without a rating, and sends the chosen contents tags", async () => {
    submitReview.mockResolvedValue({ id: "r1" });
    const { default: RescueReview } = await import("@/components/rescue/RescueReview");
    render(<RescueReview orderId="ord1" />);
    const submit = screen.getByTestId("rescue-review-submit");
    expect(submit.disabled).toBe(true);

    fireEvent.click(screen.getByTestId("rescue-review-star-4"));
    fireEvent.click(screen.getByTestId("rescue-review-tag-bread"));
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() =>
      expect(submitReview).toHaveBeenCalledWith("ord1", { rating: 4, contents_tags: ["bread"] }),
    );
  });

  it("puts the 'something wrong?' line above the submit button", async () => {
    const { default: RescueReview } = await import("@/components/rescue/RescueReview");
    render(<RescueReview orderId="ord1" />);
    const problem = screen.getByTestId("rescue-review-problem");
    const submit = screen.getByTestId("rescue-review-submit");
    // Node.compareDocumentPosition: 4 = submit FOLLOWS problem.
    expect(problem.compareDocumentPosition(submit) & 4).toBeTruthy();
  });
});

describe("a reload keeps the order (MEH-2680)", () => {
  const mine = (over = {}) => ({ ...order(over), producer_id: PRODUCER.id, reviewed: false, ...over });

  it("a guest is never asked for their orders — a 401 would toast 'session expired'", async () => {
    authUser = null;
    render(<RescueSection producer={PRODUCER} />);
    await screen.findByTestId("rescue-reserve");
    expect(fetchMyOrders).not.toHaveBeenCalled();
  });

  it("a signed-in buyer sees her code again after a reload", async () => {
    authUser = { id: "u1" };
    fetchMyOrders.mockResolvedValue([mine({ status: "reserved" })]);
    render(<RescueSection producer={PRODUCER} />);
    expect(await screen.findByTestId("rescue-confirmation")).toBeTruthy();
    expect(screen.queryByTestId("rescue-reserve")).toBeNull();
  });

  it("the last bag sold — offer gone from the list — still restores her order", async () => {
    authUser = { id: "u1" };
    fetchOffers.mockResolvedValue([]);
    fetchMyOrders.mockResolvedValue([mine({ status: "reserved" })]);
    render(<RescueSection producer={PRODUCER} />);
    expect(await screen.findByTestId("rescue-confirmation")).toBeTruthy();
  });

  it("an order at another business is not shown here", async () => {
    authUser = { id: "u1" };
    fetchMyOrders.mockResolvedValue([mine({ producer_id: "someone-else" })]);
    render(<RescueSection producer={PRODUCER} />);
    await screen.findByTestId("rescue-reserve");
    await waitFor(() => expect(fetchMyOrders).toHaveBeenCalled());
    expect(screen.queryByTestId("rescue-confirmation")).toBeNull();
  });

  it("handed and not yet reviewed brings up the review", async () => {
    authUser = { id: "u1" };
    fetchMyOrders.mockResolvedValue([mine({ status: "handed" })]);
    render(<RescueSection producer={PRODUCER} />);
    expect(await screen.findByTestId("rescue-review")).toBeTruthy();
  });

  it("handed and already reviewed does not ask again", async () => {
    authUser = { id: "u1" };
    fetchMyOrders.mockResolvedValue([mine({ status: "handed", reviewed: true })]);
    render(<RescueSection producer={PRODUCER} />);
    expect(await screen.findByTestId("rescue-review-thanks")).toBeTruthy();
    expect(screen.queryByTestId("rescue-review")).toBeNull();
  });

  it("one bag handed and a newer one reserved: the reserved code is shown", async () => {
    authUser = { id: "u1" };
    fetchMyOrders.mockResolvedValue([
      mine({ id: "old", status: "handed", pickup_code: "1111" }),
      mine({ id: "new", status: "reserved", pickup_code: "2222" }),
    ]);
    render(<RescueSection producer={PRODUCER} />);
    const box = await screen.findByTestId("rescue-confirmation");
    expect(box.textContent).toContain("2222");
    expect(box.textContent).not.toContain("1111");
  });

  it("coming back to the tab re-reads, so 'handed' shows without a reload", async () => {
    authUser = { id: "u1" };
    fetchMyOrders.mockResolvedValueOnce([mine({ status: "reserved" })]);
    render(<RescueSection producer={PRODUCER} />);
    await screen.findByTestId("rescue-confirmation");
    expect(screen.queryByTestId("rescue-review")).toBeNull();
    fetchMyOrders.mockResolvedValueOnce([mine({ status: "handed" })]);
    window.dispatchEvent(new Event("focus"));
    expect(await screen.findByTestId("rescue-review")).toBeTruthy();
  });
});

describe("the confirmation after the counter or the cutoff (MEH-2694)", () => {
  it("a handed bag offers no cancel and no cancel terms, and marks the last step", () => {
    render(<RescueConfirmation order={order({ status: "handed" })} onCancel={() => {}} />);
    expect(screen.queryByTestId("rescue-confirmation-cancel")).toBeNull();
    expect(screen.queryByTestId("rescue-confirmation-terms")).toBeNull();
    expect(screen.getByTestId("rescue-confirmation-step-done").className).toContain("font-semibold");
  });

  it("past the cancel cutoff the button is gone, the code stays", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    render(<RescueConfirmation order={order({ cancel_until: past })} onCancel={() => {}} />);
    expect(screen.queryByTestId("rescue-confirmation-cancel")).toBeNull();
    expect(screen.getByTestId("rescue-confirmation-code").textContent).toBe("0431");
  });

  it("a no-show order offers no cancel either", () => {
    render(<RescueConfirmation order={order({ status: "no_show" })} onCancel={() => {}} />);
    expect(screen.queryByTestId("rescue-confirmation-cancel")).toBeNull();
  });

  it("before the cutoff a reserved bag can still be cancelled", () => {
    render(<RescueConfirmation order={order()} onCancel={() => {}} />);
    expect(screen.getByTestId("rescue-confirmation-cancel")).toBeTruthy();
    expect(screen.getByTestId("rescue-confirmation-step-done").className).not.toContain("font-semibold");
  });
});

describe("a guest taps reserve (MEH-2700)", () => {
  it("gets the sign-in line and no request is sent, so no 'session expired' toast", async () => {
    authUser = null;
    render(<RescueSection producer={PRODUCER} />);
    fireEvent.click(await screen.findByTestId("rescue-reserve"));
    const err = await screen.findByTestId("rescue-section-error");
    expect(err.textContent).toBe(lookup("rescue.errors.sign_in"));
    expect(reserveBag).not.toHaveBeenCalled();
  });
});
