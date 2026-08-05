import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ProducerCard from "@/components/ProducerCard";
import { ProducersResponseSchema } from "@/lib/schemas";

/**
 * MEH-1880 — the derived "open for orders" line on ProducerCard.
 *
 * These specs drive the REAL `getOrderWindowStatus` against a pinned clock
 * rather than mocking the status. Mocking it would let the card pass while the
 * actual derivation disagreed — and the derivation is the whole feature. The
 * clock is the only thing faked, because "is the window open" is a function of
 * wall time and nothing else.
 *
 * The load-bearing assertions are the ABSENT ones. "Renders when open" passes
 * identically against a card with no condition at all, so it cannot tell the
 * feature from the bug it exists to prevent (a line shown on every card, or one
 * shown while the business is on vacation).
 */

// 2026-08-02 is a SUNDAY. Israel is UTC+3 in August, so 10:00 Israel = 07:00Z.
const SUNDAY_1000_ISRAEL = new Date("2026-08-02T07:00:00Z");
const SUNDAY_2200_ISRAEL = new Date("2026-08-02T19:00:00Z"); // after close

const OPEN_WINDOW = { sunday: [{ open: "09:00", close: "13:00" }] };

vi.mock("next-intl", () => ({
  useTranslations: () => (key, values = {}) => {
    if (key === "producer.detail.header.status.orders_open") {
      // Mirrors the real he.json ICU string so the assertion below is about
      // the card interpolating the cutoff, not about copy text.
      return `פתוח להזמנות · עד ${values.time}`;
    }
    return key;
  },
  useLocale: () => "he",
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
}));
vi.mock("next/image", () => ({ default: ({ src, alt }) => <img src={src} alt={alt} /> }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/api", () => ({ default: { post: vi.fn(), delete: vi.fn(), get: vi.fn() } }));
vi.mock("@/lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/post-login-action", () => ({ enqueueFavoriteOnLogin: vi.fn() }));
vi.mock("@/lib/user-location", () => ({ useUserLocation: () => ({ coords: null }) }));
vi.mock("@/lib/cloudinary", async (o) => ({
  ...(await o()),
  optimizeCloudinary: (u) => u || null,
}));
vi.mock("@/lib/favorites-cache", () => ({
  ensureFavoritesLoaded: () => Promise.resolve(new Set()),
  isFavorited: () => false,
  setFavoritedLocal: () => {},
  subscribeFavorites: () => () => {},
}));
// BadgeRow (a real child) imports the locale-aware Link, which pulls
// next-intl's navigation into the module graph — unresolvable under this vitest
// config. Mocking the wrapper keeps the import chain jsdom-safe, exactly as
// ProducerCard.test.jsx does. This was the actual cause of the first failing
// run here; the page-lib `israelTime` import was innocent and was verified so
// with an isolated probe before anything was changed.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@phosphor-icons/react", () => ({
  Leaf: (p) => <span data-testid="leaf-icon" {...p} />,
  HeartStraight: ({ weight, ...p }) => <span data-testid="icon-heart" {...p} />,
  Star: (p) => <span data-testid="icon-star" {...p} />,
  Truck: (p) => <span data-testid="icon-truck" {...p} />,
}));

const base = {
  id: 1,
  name: "מאפיית רוח השדה",
  city: "זכרון יעקב",
  categories: [],
  images: [],
};

const LINE = () => screen.queryByTestId("card-order-window");

describe("ProducerCard — order-window line (MEH-1880)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the line, with the real cutoff, when the window is open now", () => {
    vi.setSystemTime(SUNDAY_1000_ISRAEL);
    render(<ProducerCard producer={{ ...base, order_window: OPEN_WINDOW }} />);
    const el = LINE();
    expect(el).toBeTruthy();
    // 13:00 comes from the fixture via the real derivation — not a literal
    // echoed back by a mock.
    expect(el.textContent).toContain("13:00");
  });

  it("renders NOTHING when the window is closed now — discriminating case", () => {
    vi.setSystemTime(SUNDAY_2200_ISRAEL);
    render(<ProducerCard producer={{ ...base, order_window: OPEN_WINDOW }} />);
    expect(LINE()).toBeNull();
  });

  it("renders NOTHING when the producer has no window at all", () => {
    vi.setSystemTime(SUNDAY_1000_ISRAEL);
    render(<ProducerCard producer={{ ...base, order_window: null }} />);
    expect(LINE()).toBeNull();
  });

  it("suppresses the line on vacation even while the window is open", () => {
    // Vacation wins. Without this the card would advertise an open ordering
    // window for a business that has explicitly stepped away — the exact
    // over-claim the precedence exists to prevent.
    vi.setSystemTime(SUNDAY_1000_ISRAEL);
    render(
      <ProducerCard
        producer={{ ...base, order_window: OPEN_WINDOW, availability_state: "on_vacation" }}
      />
    );
    expect(LINE()).toBeNull();
  });

  it("leaves the rest of the card untouched when no line renders", () => {
    // Guards the "no layout shift / byte-identical" half of the AC: a card with
    // no window must still render its location line exactly as before.
    vi.setSystemTime(SUNDAY_1000_ISRAEL);
    render(<ProducerCard producer={{ ...base, order_window: null }} />);
    expect(screen.getByTestId("location-line")).toBeTruthy();
    expect(LINE()).toBeNull();
  });
});

/**
 * The assertion the component specs above cannot make, and the one that
 * actually decides whether this feature works in the product.
 *
 * Every spec above hands `order_window` to the card as a prop. The home grid
 * and /map do not: they run the payload through `ProducersResponseSchema`
 * first, and `z.object` STRIPS what it does not declare. So the card could
 * pass all five and still render nothing on both feeds — a green with a second
 * possible cause.
 *
 * Measured, not assumed: with the field added to `ProducerListOut` but not to
 * `lib/schemas.js`, `order_window` came back `undefined` from this exact parse.
 * That is the MEH-826 / 901 / 902 / 1704 / 1719 / 1823 mechanism a sixth time,
 * and it is why the declaration in `lib/schemas.js` is part of THIS ticket
 * rather than a follow-up.
 */
describe("MEH-1880 — order_window survives the feed parse", () => {
  it("keeps the nested range through ProducersResponseSchema", () => {
    const parsed = ProducersResponseSchema.safeParse([
      { id: 1, name: "מאפיית רוח השדה", order_window: OPEN_WINDOW },
    ]);
    expect(parsed.success).toBe(true);
    // Not just "the key is present" — the range the derivation reads must
    // arrive intact, or getOrderWindowStatus returns null and the line dies
    // one layer further in.
    expect(parsed.data[0].order_window).toEqual(OPEN_WINDOW);
  });

  it("accepts the pre-MEH-1869 single-dict shape too", () => {
    // Rows written before the list cutover are still read. Dropping one from
    // the all-or-nothing feed parse would cost a whole business, not a line.
    const legacy = { sunday: { open: "09:00", close: "13:00" } };
    const parsed = ProducersResponseSchema.safeParse([
      { id: 2, name: "משק הבוסתן", order_window: legacy },
    ]);
    expect(parsed.success).toBe(true);
    expect(parsed.data[0].order_window).toEqual(legacy);
  });

  it("never drops a producer over a malformed window", () => {
    const parsed = ProducersResponseSchema.safeParse([
      { id: 3, name: "חוות הפריטי", order_window: { sunday: [{ open: null, close: "13:00" }] } },
    ]);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toHaveLength(1);
  });
});
