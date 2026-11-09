/**
 * MEH-2856 (Sapir 09/11): the card's badge strip is ONE line. As many of the
 * first 2 badges as fit are shown; the rest move into the «+N» disclosure. A
 * single badge that is still too wide breaks inside itself (MEH-2849) — never
 * two pills stacked.
 *
 * jsdom has no layout, so the strip's widths come from a small fake: each
 * `[data-badge]` pill has a width per key, «+N» is 24px, gaps 4px, and the
 * one-line group's own (capped) width is the card's room. One pill alone shrinks to fit
 * (that is what MEH-2849's min-w-0 + overflow-wrap does in a real browser).
 * The fake reads the DOM the component actually rendered, so a component that
 * ignores the overflow (the pre-2856 strip) still renders 2 pills and goes red.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ProducerCard from "@/components/ProducerCard";
import { allBadges } from "@/lib/badges";

vi.mock("@/lib/use-badge-copy", async () => (await import("./helpers/he-badge-copy")).badgeCopyMock);
vi.mock("next-intl", () => ({
  useTranslations: () => (key, values = {}) => {
    const flat = {
      "producer.card.favorites.saved_login_prompt": "שמרתי — התחברי לראות את כל המועדפים שלך",
      "producer.card.favorites.login_cta": "התחברי",
      "error.generic": "משהו השתבש, נסו שוב",
      "producer.card.favorites.remove": "הסר ממועדפים",
      "producer.card.favorites.add": "הוסף למועדפים",
      "producer.card.favorites.aria": "שמירה",
      "producer.card.badges.delivery_only": "משלוחים בלבד",
      // MEH-1547: +N overflow disclosure aria.
      "producer.card.badges.overflow_aria": `הצגת עוד ${values.count} תגיות`,
      // MEH-76 chunk 4 — S12 tier badge keys consumed by BadgeRow.
      verified_label: "מאומת",
      declared_label: "מוצהר",
      aria_verified: "בית עסק מאומת. {tooltip}",
      aria_verified_plain: "בית עסק מאומת",
      aria_declared: "בית עסק מוצהר",
    };
    if (flat[key]) return flat[key];
    if (key === "producer.card.aria.image_missing") return `${values.name} — תמונה חסרה`;
    if (key === "producer.card.favorites_count_short") {
      // Match the HE plural rendering for `{count} שמרו` (one/two/other).
      return `${values.count} שמרו`;
    }
    // MEH-1678: mirrors the real he.json shape ("משלוח: {amount}") so the
    // component's AMOUNT_SENTINEL split behaves identically under test —
    // interpolating the sentinel here, not returning a pre-split literal.
    if (key === "group_buys.delivery.fee") return `משלוח: ${values.amount}`;
    if (key === "group_buys.delivery.fee_free") return "משלוח חינם";
    if (key === "group_buys.delivery.fee_from") return `משלוח מ-${values.amount}`;
    // MEH-2676: card delivery row folds a free-delivery threshold in.
    if (key === "producer.offer.card_free_above") return `חינם מעל ${values.amount}`;
    if (key === "producer.offer.card_delivery_sr") return "משלוח";
    if (key === "producer.offer.unit_amount.kg") return `${values.count} ק"ג`;
    return key;
  },
  // MEH-1301: ProducerCard reads useLocale() to pick the distance unit
  // ('ק"מ' on the Hebrew card). The experience-card test set the precedent
  // for this mock shape before MEH-2248 deleted it.
  useLocale: () => "he",
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  // MEH-1211: forward onError so the load-failure fallback can be exercised.
  default: ({ src, alt, onError }) => <img src={src} alt={alt} onError={onError} />,
}));

vi.mock("@/lib/cloudinary", async (importOriginal) => ({
  ...(await importOriginal()), // keep real IMAGE_RATIOS
  optimizeCloudinary: (url) => url || null,
}));

// MEH-729: ProducerCard reads useRouter() (components/ProducerCard.jsx:175)
// since the v4 redesign (PR #890). jsdom has no Next app-router context, so
// mock next/navigation to satisfy the invariant.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// ---- Heart / auth wiring: mock-all-the-things so each test can set state ----
const { authState, apiMock, toastSpy, enqueueSpy, favCache } = vi.hoisted(() => ({
  authState: { user: null },
  apiMock: {
    post: vi.fn(),
    delete: vi.fn(),
  },
  toastSpy: vi.fn(),
  enqueueSpy: vi.fn(),
  favCache: { ids: new Set() },
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => authState,
}));

vi.mock("@/lib/api", () => ({
  default: apiMock,
}));

// MEH-685: methods-only object; spy prefixes the semantic type.
vi.mock("@/lib/toast", () => ({
  showToast: {
    success: (...args) => toastSpy("success", ...args),
    error: (...args) => toastSpy("error", ...args),
    info: (...args) => toastSpy("info", ...args),
  },
}));

vi.mock("@/lib/post-login-action", () => ({
  enqueueFavoriteOnLogin: (...args) => enqueueSpy(...args),
}));

vi.mock("@/lib/favorites-cache", () => ({
  ensureFavoritesLoaded: () => Promise.resolve(favCache.ids),
  isFavorited: (id) => favCache.ids.has(id),
  setFavoritedLocal: (id, value) => {
    if (value) favCache.ids.add(id);
    else favCache.ids.delete(id);
  },
  subscribeFavorites: () => () => {},
}));

// MEH-1334: BadgeRow (a real child) now imports the locale-aware Link for its
// hero popover — mock the wrapper so the import chain stays jsdom-safe.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

// Phosphor icons render for real here (the strip's icons are not under test).


const fullProducer = {
  id: "producer-1",
  name: "חוות השקמה",
  slug: "havat-hashikma",
  city: "רחובות",
  images: ["https://example.com/photo.jpg"],
  verification_tier: "verified",
  availability_state: "available_today",
  reviews_count: 12,
  avg_rating: 4.5,
  short_description: "גבינות עיזים וכבשים, כולן מחלב טרי.",
  top_product_name: "גבינת עיזים מיושנת",
  organic_certified: true,
  grass_fed: true,
  kosher: "חלבי",
  price_range: "₪40-80",
  primary_contact_method: "whatsapp",
  categories: [{ id: 1, name: "חלב וגבינות", emoji: "🥛" }],
};


const LINE_SELECTOR = "[data-badge-line]";
const GAP = 4;
const PLUS_N = 24;
let room = 150;
let px = {};

// «+N» keeps a 44px hit area inside a 24px box with a -10px margin, so in a
// real browser it reaches 10px past the group's end — counted by scrollWidth
// unless the group pads its end by the same 10px (pe-2.5).
const PLUS_N_REACH = 10;

function stripContentWidth(strip) {
  const pills = [...strip.querySelectorAll("[data-badge]")].map((b) => px[b.dataset.badge] ?? 50);
  const hasPlus = Boolean(strip.querySelector('[data-testid="badge-overflow"]'));
  const parts = hasPlus ? [...pills, PLUS_N] : pills;
  let total = parts.reduce((a, b) => a + b, 0) + GAP * Math.max(0, parts.length - 1);
  if (hasPlus && !strip.className.split(/\s+/).includes("pe-2.5")) total += PLUS_N_REACH;
  // One pill alone may shrink and break inside itself (MEH-2849).
  return pills.length === 1 ? Math.min(total, room) : total;
}
const isStrip = (el) => el.hasAttribute?.("data-badge-line");

const saved = {};
beforeEach(() => {
  room = 150;
  px = {};
  for (const prop of ["scrollWidth", "clientWidth"]) {
    saved[prop] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
  }
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get() { return isStrip(this) ? stripContentWidth(this) : 0; },
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() { return isStrip(this) ? room : 0; },
  });
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
});
afterEach(() => {
  for (const [prop, desc] of Object.entries(saved)) {
    if (desc) Object.defineProperty(HTMLElement.prototype, prop, desc);
    else delete HTMLElement.prototype[prop];
  }
  delete globalThis.ResizeObserver;
});

const base = {
  id: "producer-fit",
  name: "חוות ערוגות נועם",
  city: "כרכור",
  images: [],
  verification_tier: null,
  availability_state: "accepting_orders",
  reviews_count: 0,
  avg_rating: null,
  categories: [],
};
// «ערוגות נועם»: two badges (the 100% vegan declaration + reservist-owned).
const twoBadges = { ...base, vegan_scope: "all", reservist_owned: true };
const threeBadges = { ...twoBadges, grass_fed: true };

const visibleKeys = () => [...document.querySelectorAll("[data-badge]")].map((b) => b.dataset.badge);
const plusN = () => screen.queryByTestId("badge-overflow");

describe("card badge strip: one line, the rest in «+N» (MEH-2856)", () => {
  it("control: the fixtures earn the badges the cases assume", () => {
    expect(allBadges(twoBadges)).toHaveLength(2);
    expect(allBadges(threeBadges)).toHaveLength(3);
  });

  it("two long badges on a narrow card → the first one + «+1»", () => {
    const [first, second] = allBadges(twoBadges).map((b) => b.key);
    px = { [first]: 90, [second]: 90 };
    render(<ProducerCard producer={twoBadges} />);
    expect(visibleKeys()).toEqual([first]);
    expect(plusN()).toHaveTextContent("+1");
    expect(plusN()).toHaveAttribute("aria-label", "הצגת עוד 1 תגיות");
  });

  it("two short badges → both, no «+N»", () => {
    const keys = allBadges(twoBadges).map((b) => b.key);
    px = { [keys[0]]: 40, [keys[1]]: 40 };
    render(<ProducerCard producer={twoBadges} />);
    expect(visibleKeys()).toEqual(keys);
    expect(plusN()).toBeNull();
  });

  it("three badges with room → two + «+1» (the v4 cap of 2 holds)", () => {
    room = 400;
    render(<ProducerCard producer={threeBadges} />);
    expect(visibleKeys()).toEqual(allBadges(threeBadges).slice(0, 2).map((b) => b.key));
    expect(plusN()).toHaveTextContent("+1");
  });

  it("three badges that just fit with «+1» keep both pills (the «+N» hit area is not overflow)", () => {
    // 60 + 4 + 60 + 4 + 24 = 152 of 160 — fits; the chip's 10px reach must not count.
    room = 160;
    const keys = allBadges(threeBadges).map((b) => b.key);
    px = Object.fromEntries(keys.map((k) => [k, 60]));
    render(<ProducerCard producer={threeBadges} />);
    expect(visibleKeys()).toEqual(keys.slice(0, 2));
    expect(plusN()).toHaveTextContent("+1");
  });

  it("three badges, narrow → one + «+2»", () => {
    const keys = allBadges(threeBadges).map((b) => b.key);
    px = Object.fromEntries(keys.map((k) => [k, 90]));
    render(<ProducerCard producer={threeBadges} />);
    expect(visibleKeys()).toEqual([keys[0]]);
    expect(plusN()).toHaveTextContent("+2");
  });

  it("200% text: one badge wider than the card stays (never 0), breaks inside itself, + «+1»", () => {
    const [first, second] = allBadges(twoBadges).map((b) => b.key);
    px = { [first]: 260, [second]: 90 };
    render(<ProducerCard producer={twoBadges} />);
    expect(visibleKeys()).toEqual([first]);
    expect(plusN()).toHaveTextContent("+1");
    // MEH-2849: the lone pill's list may shrink, and the pill keeps its cap.
    const list = document.querySelector(`[data-badge="${first}"]`).closest('[role="list"]');
    expect(list.className).toContain("min-w-0");
    expect(list.className).not.toContain("[&>*]:shrink-0");
    // With one pill nothing is left to drop: the lone pill keeps the 10px the
    // «+N» padding would have taken (it is the pill that breaks at 200%).
    expect(document.querySelector(LINE_SELECTOR).className.split(/\s+/)).not.toContain("pe-2.5");
  });

  it("the «+N» panel lists exactly the hidden badges", () => {
    const keys = allBadges(threeBadges).map((b) => b.key);
    px = Object.fromEntries(keys.map((k) => [k, 90]));
    render(<ProducerCard producer={threeBadges} />);
    fireEvent.click(plusN());
    const items = within(screen.getByTestId("badge-overflow-popover")).getAllByRole("listitem");
    expect(items, "the two hidden badges, not the old fixed slice(2)").toHaveLength(2);
    const shownLabel = document.querySelector(`[data-badge="${keys[0]}"]`).textContent.trim();
    expect(shownLabel, "control: the visible pill has a label").not.toBe("");
    for (const item of items) expect(item.textContent.startsWith(shownLabel)).toBe(false);
  });

  it("the pills and «+N» never wrap apart; two pills keep their width", () => {
    room = 400;
    render(<ProducerCard producer={threeBadges} />);
    const line = document.querySelector(LINE_SELECTOR);
    expect(line.className.split(/\s+/)).toContain("flex-nowrap");
    expect(line.className.split(/\s+/)).not.toContain("flex-wrap");
    expect(line.contains(plusN()), "«+N» is on the same line as the pills").toBe(true);
    const list = line.querySelector('[role="list"]');
    expect(list.className).toContain("flex-nowrap");
    expect(list.className).toContain("[&>*]:shrink-0");
  });

  it("no ResizeObserver (SSR / old browser) → today's behaviour: 2 + «+1»", () => {
    delete globalThis.ResizeObserver;
    const keys = allBadges(threeBadges).map((b) => b.key);
    px = Object.fromEntries(keys.map((k) => [k, 90]));
    render(<ProducerCard producer={threeBadges} />);
    expect(visibleKeys()).toEqual(keys.slice(0, 2));
    expect(plusN()).toHaveTextContent("+1");
  });
});
