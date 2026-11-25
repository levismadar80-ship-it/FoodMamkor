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
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

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

// MEH-3226: t.rich splits <tag>…</tag> and hands each chunk to its renderer.
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

// Strips the rich-text tags from a he.json value so a test can match its
// visible text. Repeats until nothing changes, so a tag split by another
// tag cannot survive one pass (CodeQL js/incomplete-multi-character-sanitization).
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
  // MEH-3626: the same empty state as /group-buys — a heading, one line under
  // it, and the alert hint as the way out (not one plain sentence).
  it("0 bags says so as a heading, in the town's name when a town is set", async () => {
    fetchOffers.mockResolvedValue([]);
    render(<RescueList initialCity="חיפה" />);
    const empty = await screen.findByTestId("rescue-list-empty");
    const heading = within(empty).getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe(lookup("rescue.list.empty_title_city").replace("{city}", "חיפה"));
    expect(within(empty).getByText(lookup("rescue.list.empty_subtitle"))).toBeTruthy();
    expect(within(empty).getByTestId("hub-alert-hint-rescue")).toBeTruthy();
  });

  it("0 bags with no town set uses the town-less heading", async () => {
    fetchOffers.mockResolvedValue([]);
    render(<RescueList />);
    const empty = await screen.findByTestId("rescue-list-empty");
    expect(within(empty).getByRole("heading", { level: 2 }).textContent).toBe(lookup("rescue.list.empty_title"));
  });

  it("while loading: a skeleton with a status label, and no empty state yet", async () => {
    let resolve;
    fetchOffers.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<RescueList />);
    const loading = screen.getByTestId("rescue-list-loading");
    expect(loading.getAttribute("role")).toBe("status");
    expect(loading.getAttribute("aria-label")).toBe(lookup("rescue.list.loading"));
    expect(loading.textContent).toBe(""); // no visible line that appears and vanishes
    expect(screen.queryByTestId("rescue-list-empty")).toBeNull();
    resolve([]);
    expect(await screen.findByTestId("rescue-list-empty")).toBeTruthy();
    expect(screen.queryByTestId("rescue-list-loading")).toBeNull();
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

  it("links to the bag's own page, and the row itself reserves nothing", async () => {
    render(<RescueList />);
    const row = await screen.findByTestId("rescue-bag-row");
    // MEH-3586: the bag page (by OFFER id), as Too Good To Go opens a bag.
    // It was `/{slug}#section-rescue` — the business page's bag section.
    const firstOfferId = fetchOffers.mock.results[0] ? (await fetchOffers.mock.results[0].value)[0].id : null;
    expect(row.getAttribute("href")).toBe(`/rescue/${firstOfferId}`);
    expect(screen.queryByTestId("rescue-reserve")).toBeNull();
  });
});

describe("the business-page section — landing from a bag link", () => {
  // A bag row links `/{slug}#section-rescue`, but the section mounts only after
  // its own fetch, so the browser's hash scroll has nothing to hit. The
  // section scrolls itself into view once — and only for that hash.
  let scrolled;
  beforeEach(() => {
    scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { cb(0); return 0; });
  });
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("scrolls to the bag when the URL carries #section-rescue", async () => {
    window.history.replaceState(null, "", "/hatzala#section-rescue");
    render(<RescueSection producer={PRODUCER} />);
    await screen.findByTestId("rescue-section-card");
    // MEH-3217: the scroll runs in an effect after the bag renders — wait for it.
    await waitFor(() => expect(scrolled).toHaveBeenCalledTimes(1));
  });

  it("does not scroll on an ordinary visit", async () => {
    window.history.replaceState(null, "", "/hatzala");
    render(<RescueSection producer={PRODUCER} />);
    await screen.findByTestId("rescue-section-card");
    expect(scrolled).not.toHaveBeenCalled();
  });
});

describe("the business-page section — the bag card", () => {
  // MEH-3586 follow-up (Sapir 22/11): the card is the way in, as each
  // group-buy card is. Reserve, the login prompt, cancel and the errors live
  // on the bag page only (RescueOfferReserveFlow.test.jsx).
  it("the whole card is one link to the bag page, with the group-buy caret", async () => {
    render(<RescueSection producer={PRODUCER} />);
    const card = await screen.findByTestId("rescue-section-card");
    expect(card.tagName).toBe("A");
    expect(card.getAttribute("href")).toBe("/rescue/o1");
    expect(card.querySelector("svg.ltr\\:rotate-180")).not.toBeNull();
    expect(screen.getByTestId("rescue-section-price").textContent).toBe("15 ₪");
  });

  it("nothing on the card can be pressed by itself: no reserve button, no link under it, no fold", async () => {
    render(<RescueSection producer={PRODUCER} />);
    const card = await screen.findByTestId("rescue-section-card");
    expect(card.querySelectorAll("button, a, details, input")).toHaveLength(0);
    expect(screen.queryByTestId("rescue-reserve")).toBeNull();
    expect(screen.queryByTestId("rescue-section-details")).toBeNull();
    expect(screen.queryByTestId("rescue-section-allergens")).toBeNull();
    expect(screen.queryByTestId("rescue-section-terms")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // MEH-2713: the struck "worth" is the business's own LOW estimate, shown only
  // when it is above the price — the same rule BagRow uses on the home page.
  it("strikes through the declared worth only when it is above the price", async () => {
    fetchOffers.mockResolvedValue([offer({ value_min_agorot: 4500 })]);
    const { unmount } = render(<RescueSection producer={PRODUCER} />);
    const worth = await screen.findByTestId("rescue-section-worth");
    expect(worth.tagName).toBe("S");
    expect(worth.textContent).toBe("45 ₪");
    unmount();

    fetchOffers.mockResolvedValue([offer({ value_min_agorot: 1000 })]);
    render(<RescueSection producer={PRODUCER} />);
    await screen.findByTestId("rescue-section-card");
    expect(screen.queryByTestId("rescue-section-worth")).toBeNull();
  });

  // MEH-3585 (Sapir 21/11): «נשארו 4» said nothing about what — the stock
  // names the bags, beside the logo seeds the group-buy card uses (one seed per
  // bag of the day, filled = still available).
  it("shows the stock with the word «סלים» and one seed per bag: one bag and many", async () => {
    fetchOffers.mockResolvedValue([offer({ qty_left: 1, qty_total: 4 })]);
    const { unmount } = render(<RescueSection producer={PRODUCER} />);
    expect((await screen.findByTestId("rescue-section-stock")).textContent).toBe("נשאר סל אחד");
    let seeds = screen.getByTestId("gb-progress-seeds");
    expect(seeds.querySelectorAll("svg")).toHaveLength(4);
    expect(seeds.querySelectorAll("svg[data-filled='true']")).toHaveLength(1);
    // Decorative: the words sit beside it, so a screen reader hears them once.
    expect(seeds.getAttribute("aria-hidden")).toBe("true");
    expect(seeds.getAttribute("role")).toBeNull();
    unmount();
    fetchOffers.mockResolvedValue([offer({ qty_left: 4, qty_total: 4 })]);
    render(<RescueSection producer={PRODUCER} />);
    expect((await screen.findByTestId("rescue-section-stock")).textContent).toBe("נשארו 4 סלים");
    seeds = screen.getByTestId("gb-progress-seeds");
    expect(seeds.querySelectorAll("svg[data-filled='true']")).toHaveLength(4);
  });

  // MEH-3585: the group-buy card's anatomy — the pickup window sits in the
  // beige status band beside what is left; the address under the title.
  it("puts the pickup window in the status band with the stock, and the address under the title", async () => {
    render(<RescueSection producer={PRODUCER} />);
    const pickup = await screen.findByTestId("rescue-section-pickup");
    expect(pickup.textContent).toMatch(/^איסוף היום \d{2}:\d{2}–\d{2}:\d{2}$/);
    expect(pickup.querySelector("svg")).not.toBeNull();
    // Same band: stock on its start side, pickup on its end side.
    const band = screen.getByTestId("rescue-section-stock").parentElement.parentElement;
    expect(band.contains(pickup)).toBe(true);
    const title = screen.getByTestId("rescue-section-typical");
    expect(title.tagName).toBe("H3");
    expect(title.parentElement.parentElement.contains(screen.getByTestId("rescue-section-address"))).toBe(true);
    expect(screen.getByTestId("rescue-section-address").querySelector("svg")).not.toBeNull();
  });

  it("a gold saving line off the business's own low estimate; none when the worth is not above the price", async () => {
    fetchOffers.mockResolvedValue([offer({ value_min_agorot: 4500 })]);
    const { unmount } = render(<RescueSection producer={PRODUCER} />);
    expect((await screen.findByTestId("rescue-section-saving")).textContent).toBe("חיסכון של 67%");
    unmount();

    fetchOffers.mockResolvedValue([offer({ value_min_agorot: 1000 })]);
    render(<RescueSection producer={PRODUCER} />);
    await screen.findByTestId("rescue-section-card");
    expect(screen.queryByTestId("rescue-section-saving")).toBeNull();
  });

  it("shows the full address and the typical contents", async () => {
    render(<RescueSection producer={PRODUCER} />);
    expect((await screen.findByTestId("rescue-section-address")).textContent).toContain("הנביאים 10");
    expect(screen.getByTestId("rescue-section-typical").textContent).toBe("בדרך כלל: לחם, חלה");
  });

  // MEH-3585 review: no typical items → no card title, so «סל הפתעה» (the
  // section heading) is not repeated as an h3 right under itself.
  it("no typical items: no card title, the section heading is the only «סל הפתעה»", async () => {
    fetchOffers.mockResolvedValue([offer({ typical_items: [] })]);
    render(<RescueSection producer={PRODUCER} />);
    await screen.findByTestId("rescue-section-card");
    expect(screen.queryByTestId("rescue-section-typical")).toBeNull();
    expect(screen.getAllByText("סל הפתעה")).toHaveLength(1);
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });

  it("renders nothing when this business has no bag today", async () => {
    fetchOffers.mockResolvedValue([offer({ producer: { ...PRODUCER, id: "someone-else" } })]);
    const { container } = render(<RescueSection producer={PRODUCER} />);
    await waitFor(() => expect(container.firstChild).toBeNull());
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

describe("the block message", () => {
  it("is the backend's string, verbatim", () => {
    // If these two ever diverge the buyer is told one thing by the API and
    // another by the page. routers/rescue.py BLOCKED_DETAIL is the source.
    expect(plain("rescue.errors.blocked")).toBe(
      "שני סלים לא נאספו, ולכן אי אפשר לשריין סלים חדשים כרגע. כתבו לנו",
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

  // MEH-3586 follow-up: a reservation no longer changes the business page.
  // The card stays the way to the bag page, where her code is.
  it.each(counts)("%s bags × reserved (the business page shows the card, never the code)", async (n) => {
    fetchOffers.mockResolvedValue(
      n === 0
        ? []
        : [offer(), ...Array.from({ length: n - 1 }, (_, i) => offer({ id: `y${i}`, producer: { ...PRODUCER, id: `other${i}` } }))],
    );
    fetchMyOrders.mockResolvedValue([{ ...order(), producer_id: PRODUCER.id }]);
    const { container } = render(<RescueSection producer={PRODUCER} />);
    if (n === 0) {
      await waitFor(() => expect(fetchOffers).toHaveBeenCalled());
      await waitFor(() => expect(container.firstChild).toBeNull());
    } else {
      expect(await screen.findAllByTestId("rescue-section-card")).toHaveLength(1);
    }
    expect(screen.queryByTestId("rescue-confirmation")).toBeNull();
    expect(fetchMyOrders).not.toHaveBeenCalled();
  });
});

describe("the review", () => {
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

describe("the confirmation past the free-cancel cutoff (MEH-2737)", () => {
  const past = () => new Date(Date.now() - 60_000).toISOString();

  it("the confirmation keeps the no-show rule and drops the time", () => {
    render(<RescueConfirmation order={order({ cancel_until: past() })} onCancel={() => {}} />);
    expect(screen.getByTestId("rescue-confirmation-terms").textContent).toBe(
      "אי אפשר לבטל · אחרי שני סלים שלא נאספו, אי אפשר לשריין סלים חדשים",
    );
  });
});
