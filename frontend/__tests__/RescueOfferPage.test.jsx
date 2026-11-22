/**
 * MEH-3586 — the surprise bag's own page.
 *
 * Keys resolve against the REAL messages/he.json (as RescueBuyerFlow does), so
 * a passing test means the shipped Hebrew says it.
 *
 * Cells covered, counted as a matrix (CLAUDE.md, 5-state rule):
 *   state:      available · sold_out · cancelled · ended · not found · failed
 *   typical:    0 items · 1 item · many items
 *   allergens:  not declared (null) · declared list
 *   worth:      none · one figure (struck) · a range
 *   reservation: guest tap → login prompt · signed-in reserve → confirmation ·
 *                a reservation read back after reload
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
  return out.replace(/\{(\w+)\}/g, (_m, k) => (values[k] !== undefined ? String(values[k]) : `{${k}}`));
}

vi.mock("next-intl", () => ({
  useTranslations: (ns) => {
    const t = (key, values) => format(lookup(ns ? `${ns}.${key}` : key), values);
    t.rich = (key) => lookup(ns ? `${ns}.${key}` : key);
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

vi.mock("next/dynamic", () => ({ default: () => (props) => <div data-testid="mini-map" data-lat={props.lat} /> }));
vi.mock("@/components/ShareButton", () => ({ default: () => <button type="button">share</button> }));
vi.mock("@/components/HistoryBackLink", () => ({ default: () => null }));
let inlineButtonInView = false;
vi.mock("@/components/RegistrationOverlays", () => ({
  useInView: () => inlineButtonInView,
  StickyRegistrationBar: ({ note, children }) => (
    <div data-testid="sticky-bar">
      {note}
      {children}
    </div>
  ),
}));
vi.mock("@/components/LoginPromptModal", () => ({
  default: ({ open, title }) => (open ? <div data-testid="login-prompt">{title}</div> : null),
}));

const fetchOffer = vi.fn();
const reserveBag = vi.fn();
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
    fetchMyOrders: (...a) => fetchMyOrders(...a),
  };
});

import RescueOfferPage from "@/app/[locale]/rescue/[offerId]/RescueOfferPage";

const HOUR = 3_600_000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

function offer(over = {}) {
  return {
    id: "o1",
    date: "2026-11-21",
    state: "available",
    qty_left: 3,
    qty_total: 4,
    price_agorot: 2500,
    value_min_agorot: 5000,
    value_max_agorot: null,
    pickup_start: iso(HOUR),
    pickup_end: iso(3 * HOUR),
    cancel_until: iso(HOUR / 2),
    typical_items: ["לחם", "מאפים"],
    allergens: null,
    distance_km: null,
    lat: 32.79,
    lng: 34.98,
    producer: {
      id: "p1",
      name: "מאפיית ההצלה",
      slug: "hatzala",
      city: "חיפה",
      location_city: "חיפה",
      location_address: "הנביאים 10",
      image_url: null,
      avg_rating: 4.6,
      reviews_count: 12,
    },
    ...over,
  };
}

async function renderWith(row) {
  fetchOffer.mockResolvedValue(row);
  render(<RescueOfferPage offerId="o1" />);
  if (row) await screen.findByTestId("rescue-offer-page");
}

beforeEach(() => {
  vi.clearAllMocks();
  authUser = null;
  inlineButtonInView = false;
  fetchMyOrders.mockResolvedValue([]);
});

describe("RescueOfferPage — an available bag", () => {
  it("shows price, struck worth, stock, pickup, address, map, how it works and the cancel rule", async () => {
    await renderWith(offer());
    expect(fetchOffer).toHaveBeenCalledWith("o1");
    expect(screen.getByTestId("rescue-offer-title").textContent).toBe("מאפיית ההצלה");
    expect(screen.getByTestId("rescue-offer-price").textContent).toBe("25 ₪");
    expect(screen.getByTestId("rescue-offer-worth").textContent).toBe("50 ₪");
    expect(screen.getByTestId("rescue-offer-stock").textContent).toBe("נשארו 3 סלים");
    expect(screen.getByTestId("rescue-offer-address").textContent).toBe("הנביאים 10, חיפה");
    expect(screen.getByTestId("mini-map").dataset.lat).toBe("32.79");
    expect(screen.getByText(lookup("rescue.offer_page.how_2"))).toBeTruthy();
    expect(screen.getByTestId("rescue-offer-cancel").textContent).toContain("אפשר לבטל בחינם עד");
    expect(screen.getByTestId("rescue-offer-business").getAttribute("href")).toBe("/hatzala");
    expect(screen.getByTestId("rescue-offer-rating")).toBeTruthy();
    expect(screen.getByTestId("sticky-bar").textContent).toContain("25 ₪ · איסוף עד");
    expect(screen.queryByTestId("rescue-offer-unavailable")).toBeNull();
  });

  it("the phone bar stays away while the card's own button is on screen", async () => {
    inlineButtonInView = true;
    await renderWith(offer());
    expect(screen.queryByTestId("sticky-bar")).toBeNull();
    expect(screen.getAllByTestId("rescue-reserve")).toHaveLength(1);
  });

  // MEH-3570: the bag page reserves too, so it names the seller and says
  // Mehamakor is not a party, the same line as the business page section.
  it("under the reserve button: the deal is with the business, Mehamakor is not a party", async () => {
    await renderWith(offer());
    expect(screen.getByTestId("rescue-not-a-party").textContent).toBe(
      "את העסקה עושים ישירות מול מאפיית ההצלה. מהמקור לא המוכרת ולא צד לעסקה.",
    );
  });

  it("a range of worth reads as a line, not a struck figure", async () => {
    await renderWith(offer({ value_max_agorot: 7000 }));
    expect(screen.queryByTestId("rescue-offer-worth")).toBeNull();
    expect(screen.getByTestId("rescue-offer-worth-text").textContent).toBe("שווי משוער 50–70 ₪");
  });

  it("no worth above the price → no worth at all (never a made-up discount)", async () => {
    await renderWith(offer({ value_min_agorot: 2000 }));
    expect(screen.queryByTestId("rescue-offer-worth")).toBeNull();
    expect(screen.queryByTestId("rescue-offer-worth-text")).toBeNull();
  });

  it("one left says so", async () => {
    await renderWith(offer({ qty_left: 1 }));
    expect(screen.getByTestId("rescue-offer-stock").textContent).toBe("נשאר סל אחד");
  });

  it("no rating line when the business has no reviews", async () => {
    await renderWith(offer({ producer: { ...offer().producer, avg_rating: null, reviews_count: 0 } }));
    expect(screen.queryByTestId("rescue-offer-rating")).toBeNull();
  });

  it("the business's own short description sits in its row", async () => {
    await renderWith(offer({ producer: { ...offer().producer, short_description: "מאפייה שכונתית מ-1985" } }));
    expect(screen.getByTestId("rescue-offer-business-about").textContent).toBe("מאפייה שכונתית מ-1985");
  });

  it("no description → no empty line", async () => {
    await renderWith(offer({ producer: { ...offer().producer, short_description: null } }));
    expect(screen.queryByTestId("rescue-offer-business-about")).toBeNull();
  });
});

describe("RescueOfferPage — pickup note (MEH-3593)", () => {
  it("no note → no line", async () => {
    await renderWith(offer({ pickup_note: null }));
    expect(screen.queryByTestId("rescue-offer-pickup-note")).toBeNull();
  });
  it("a note → one line with it", async () => {
    await renderWith(offer({ pickup_note: "דלת אחורית" }));
    expect(screen.getByTestId("rescue-offer-pickup-note").textContent).toBe(
      lookup("rescue.offer_page.pickup_note").replace("{note}", "דלת אחורית"),
    );
  });
});

describe("RescueOfferPage — the business's logo (MEH-3611)", () => {
  it("a logo → it sits in the business row's circle, not cropped", async () => {
    await renderWith(offer({ producer: { ...offer().producer, logo_url: "https://res.cloudinary.com/x/image/upload/logo.png" } }));
    const img = screen.getByTestId("rescue-offer-business").querySelector("img");
    expect(img?.getAttribute("src")).toContain("logo.png");
    expect(img?.className).toContain("object-contain");
  });

  it("no logo → the letter avatar, no image", async () => {
    await renderWith(offer({ producer: { ...offer().producer, logo_url: null } }));
    expect(screen.getByTestId("rescue-offer-business").querySelector("img")).toBeNull();
  });
});

describe("RescueOfferPage — the cover", () => {
  it("no photo → no cover band at all; share sits beside the «סל הפתעה» chip", async () => {
    await renderWith(offer());
    expect(screen.queryByTestId("rescue-offer-cover-band")).toBeNull();
    expect(screen.queryByTestId("rescue-offer-cover")).toBeNull();
    expect(screen.getByTestId("rescue-offer-share-inline")).toBeTruthy();
  });

  it("a photo → the business's photo as the cover, share on its corner", async () => {
    const withPhoto = offer();
    withPhoto.producer = { ...withPhoto.producer, image_url: "https://res.cloudinary.com/x/image/upload/a.jpg" };
    await renderWith(withPhoto);
    expect(screen.getByTestId("rescue-offer-cover")).toBeTruthy();
    expect(screen.getByTestId("rescue-offer-cover-actions")).toBeTruthy();
    expect(screen.queryByTestId("rescue-offer-share-inline")).toBeNull();
  });
});

describe("RescueOfferPage — what is inside and allergens", () => {
  it("0 typical items → the surprise line only, no list", async () => {
    await renderWith(offer({ typical_items: [] }));
    expect(screen.getByText(lookup("rescue.offer_page.inside_body"))).toBeTruthy();
    expect(screen.queryByTestId("rescue-offer-typical")).toBeNull();
  });
  it("1 typical item → one chip", async () => {
    await renderWith(offer({ typical_items: ["לחם"] }));
    expect(screen.getByTestId("rescue-offer-typical").querySelectorAll("li")).toHaveLength(1);
  });
  it("many typical items → a chip each", async () => {
    await renderWith(offer());
    expect(screen.getByTestId("rescue-offer-typical").querySelectorAll("li")).toHaveLength(2);
  });
  it("allergens not declared → ask before pickup", async () => {
    await renderWith(offer());
    expect(screen.getByTestId("rescue-offer-allergens-none").textContent).toBe(lookup("rescue.section.allergens_undeclared"));
  });
  it("declared allergens are listed by their product-sheet names", async () => {
    await renderWith(offer({ allergens: ["gluten"] }));
    expect(screen.getByTestId("rescue-offer-allergens-declared").textContent).toContain(
      lookup("settings.products.form.allergen_gluten"),
    );
  });
  // MEH-3610: the pickup window under the title is the shared PickupLine.
  it("the pickup window reads label, then the window", async () => {
    await renderWith(offer());
    const line = screen.getByTestId("rescue-offer-pickup").textContent;
    expect(line.startsWith(`${lookup("rescue.offer_page.pickup_title")} `)).toBe(true);
    expect(line).toMatch(/\d{2}:\d{2}–\d{2}:\d{2}$/);
  });
  // MEH-3610: the bag draws the group buy's AllergenSection, which reads only
  // known codes; the bag's own copy printed whatever key the list held.
  it("an unknown allergen code is not printed as a raw key", async () => {
    await renderWith(offer({ allergens: ["not_a_code"] }));
    expect(screen.getByTestId("rescue-offer-allergens-none").textContent).toBe(lookup("rescue.section.allergens_undeclared"));
    expect(screen.queryByTestId("rescue-offer-allergens-declared")).toBeNull();
  });
});

describe("RescueOfferPage — a bag that cannot be reserved", () => {
  it.each([
    ["sold_out", "rescue.offer_page.state_sold_out"],
    ["cancelled", "rescue.offer_page.state_cancelled"],
    ["ended", "rescue.offer_page.state_ended"],
  ])("%s says why, offers other bags, and has no reserve button", async (state, key) => {
    await renderWith(offer({ state, qty_left: state === "sold_out" ? 0 : 2 }));
    const box = screen.getByTestId("rescue-offer-unavailable");
    expect(box.textContent).toContain(lookup(key));
    expect(box.querySelector("a").getAttribute("href")).toBe("/rescue");
    expect(screen.queryByTestId("rescue-reserve")).toBeNull();
    expect(screen.queryByTestId("sticky-bar")).toBeNull();
  });

  it("not found → the empty state with a way to other bags", async () => {
    fetchOffer.mockResolvedValue(null);
    render(<RescueOfferPage offerId="o1" />);
    const box = await screen.findByTestId("rescue-offer-not-found");
    expect(box.textContent).toContain(lookup("rescue.offer_page.not_found_title"));
  });

  it("a failed load says so, not «not found»", async () => {
    fetchOffer.mockRejectedValue(new Error("500"));
    render(<RescueOfferPage offerId="o1" />);
    expect((await screen.findByRole("alert")).textContent).toBe(lookup("rescue.list.failed"));
    expect(screen.queryByTestId("rescue-offer-not-found")).toBeNull();
  });
});

describe("RescueOfferPage — reserving", () => {
  it("a guest's tap opens the login prompt and sends nothing", async () => {
    await renderWith(offer());
    fireEvent.click(screen.getAllByTestId("rescue-reserve")[0]);
    expect(screen.getByTestId("login-prompt").textContent).toBe(lookup("rescue.login_prompt_title"));
    expect(reserveBag).not.toHaveBeenCalled();
  });

  it("a signed-in reserve swaps the card for the confirmation with the code", async () => {
    authUser = { id: "u1" };
    reserveBag.mockResolvedValue({
      id: "r1", offer_id: "o1", qty: 1, status: "reserved", pickup_code: "4821",
      price_agorot: 2500, cancel_until: iso(HOUR / 2), pickup_start: iso(HOUR), pickup_end: iso(3 * HOUR),
    });
    await renderWith(offer());
    fireEvent.click(screen.getAllByTestId("rescue-reserve")[0]);
    await waitFor(() => expect(screen.getByTestId("rescue-offer-reserved")).toBeTruthy());
    expect(reserveBag).toHaveBeenCalledWith({ offerId: "o1" });
    expect(screen.getByTestId("rescue-offer-reserved").textContent).toContain("4821");
    expect(screen.queryByTestId("rescue-offer-action")).toBeNull();
  });

  it("a reservation made earlier is read back after a reload", async () => {
    authUser = { id: "u1" };
    fetchMyOrders.mockResolvedValue([
      {
        id: "r1", offer_id: "o1", producer_id: "p1", qty: 1, status: "reserved", pickup_code: "7310",
        price_agorot: 2500, cancel_until: iso(HOUR / 2), pickup_start: iso(HOUR), pickup_end: iso(3 * HOUR),
        reviewed: false, cancelled_by_business: false,
      },
    ]);
    await renderWith(offer());
    await waitFor(() => expect(screen.getByTestId("rescue-offer-reserved").textContent).toContain("7310"));
  });

  it("a reserved bag offers «הוספה ליומן» for its pickup window (MEH-3616 button)", async () => {
    authUser = { id: "u1" };
    fetchMyOrders.mockResolvedValue([
      {
        id: "r1", offer_id: "o1", producer_id: "p1", qty: 1, status: "reserved", pickup_code: "7310",
        price_agorot: 2500, cancel_until: iso(HOUR / 2), pickup_start: iso(HOUR), pickup_end: iso(3 * HOUR),
        reviewed: false, cancelled_by_business: false,
      },
    ]);
    await renderWith(offer());
    const btn = await screen.findByTestId("rescue-offer-add-to-calendar");
    expect(btn.textContent).toBe(lookup("events.detail.add_to_calendar"));
  });

  it("no reservation → no calendar button", async () => {
    await renderWith(offer());
    expect(screen.getByTestId("rescue-reserve")).toBeTruthy();
    expect(screen.queryByTestId("rescue-offer-add-to-calendar")).toBeNull();
  });

  it("a handed bag → no calendar button (the pickup already happened)", async () => {
    authUser = { id: "u1" };
    fetchMyOrders.mockResolvedValue([
      {
        id: "r1", offer_id: "o1", producer_id: "p1", qty: 1, status: "handed", pickup_code: "7310",
        price_agorot: 2500, cancel_until: iso(HOUR / 2), pickup_start: iso(HOUR), pickup_end: iso(3 * HOUR),
        reviewed: true, cancelled_by_business: false,
      },
    ]);
    await renderWith(offer());
    await waitFor(() => expect(screen.getByTestId("rescue-offer-reserved")).toBeTruthy());
    expect(screen.queryByTestId("rescue-offer-add-to-calendar")).toBeNull();
  });

  it("a reservation on ANOTHER bag of the same business is not shown on this one", async () => {
    // Two pickup points → two bags a day; bag o1's page must not show o2's code.
    authUser = { id: "u1" };
    fetchMyOrders.mockResolvedValue([
      {
        id: "r2", offer_id: "o2", producer_id: "p1", qty: 1, status: "reserved", pickup_code: "5555",
        price_agorot: 2500, cancel_until: iso(HOUR / 2), pickup_start: iso(HOUR), pickup_end: iso(3 * HOUR),
        reviewed: false, cancelled_by_business: false,
      },
    ]);
    await renderWith(offer());
    await waitFor(() => expect(fetchMyOrders).toHaveBeenCalled());
    expect(screen.queryByTestId("rescue-offer-reserved")).toBeNull();
    expect(screen.getByTestId("rescue-reserve")).toBeTruthy();
  });

  it("a failed load offers the other bags", async () => {
    fetchOffer.mockRejectedValue(new Error("500"));
    render(<RescueOfferPage offerId="o1" />);
    await screen.findByRole("alert");
    expect(screen.getByText(lookup("rescue.offer_page.other_bags")).getAttribute("href")).toBe("/rescue");
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });
});
