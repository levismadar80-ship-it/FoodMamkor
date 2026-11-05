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
let flagOn = true;

vi.mock("@/lib/rescue", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    rescueBagsEnabled: () => flagOn,
    fetchOffers: (...a) => fetchOffers(...a),
    reserveBag: (...a) => reserveBag(...a),
    cancelOrder: (...a) => cancelOrder(...a),
    submitReview: (...a) => submitReview(...a),
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
    expect(distance.textContent).toContain("בערך");
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
    [409, "לא נשארו מספיק שקיות", "rescue.errors.sold_out"],
    [409, "אפשר לשריין עד שתי שקיות", "rescue.errors.max_two"],
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
