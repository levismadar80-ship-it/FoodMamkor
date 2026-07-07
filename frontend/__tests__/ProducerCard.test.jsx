import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProducerCard from "@/components/ProducerCard";

// MEH-473: ProducerCard now reads useTranslations() from next-intl
// (Wave 3 i18n cutover). Mocked here following the Header.test.jsx
// pattern established in MEH-471 — map only the keys ProducerCard
// renders, plus ICU interpolation/plural for review/favorites counts.
vi.mock("next-intl", () => ({
  useTranslations: () => (key, values = {}) => {
    const flat = {
      "producer.card.contact.phone": "טלפון",
      "producer.card.contact.website": "אתר",
      "producer.card.contact.email": "אימייל",
      "producer.card.favorites.saved_login_prompt": "שמרתי — התחברי לראות את כל המועדפים שלך",
      "producer.card.favorites.login_cta": "התחברי",
      "error.generic": "משהו השתבש, נסו שוב",
      "producer.card.favorites.remove": "הסר ממועדפים",
      "producer.card.favorites.add": "הוסף למועדפים",
      "producer.card.favorites.aria": "שמירה",
      "producer.card.badges.delivery_only": "🚚 משלוחים בלבד",
      "producer.card.badges.available_today": "🛒 מגיעה היום",
      // MEH-76 chunk 4 — S12 tier badge keys consumed by BadgeRow.
      verified_label: "מאומת",
      declared_label: "מוצהר",
      aria_verified: "בית עסק מאומת. {tooltip}",
      aria_verified_plain: "בית עסק מאומת",
      aria_declared: "בית עסק מוצהר",
    };
    if (flat[key]) return flat[key];
    if (key === "producer.card.aria.image_missing") return `${values.name} — תמונה חסרה`;
    if (key === "producer.card.aria.primary_contact") return `ערוץ קשר עיקרי: ${values.method}`;
    if (key === "producer.card.favorites_count_short") {
      // Match the HE plural rendering for `{count} שמרו` (one/two/other).
      return `${values.count} שמרו`;
    }
    return key;
  },
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ src, alt }) => <img src={src} alt={alt} />,
}));

vi.mock("@/lib/cloudinary", () => ({
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

// Phosphor icons — render as identifiable spans
vi.mock("@phosphor-icons/react", () => ({
  Leaf: (props) => <span data-testid="leaf-icon" {...props} />,
  HeartStraight: ({ weight, ...props }) => (
    <span data-testid="icon-heart" data-weight={weight} {...props} />
  ),
  WhatsappLogo: (props) => <span data-testid="icon-whatsapp" {...props} />,
  Phone: (props) => <span data-testid="icon-phone" {...props} />,
  Globe: (props) => <span data-testid="icon-globe" {...props} />,
  EnvelopeSimple: (props) => <span data-testid="icon-email" {...props} />,
  // MEH-990: rating ★ glyph → Phosphor Star (Emoji LOCK).
  Star: (props) => <span data-testid="icon-star" {...props} />,
  // MEH-76 chunk 4 — S12 tier badge glyphs rendered by BadgeRow.
  SealCheck: (props) => <span data-testid="icon-seal" {...props} />,
  Note: (props) => <span data-testid="icon-note" {...props} />,
}));

const fullProducer = {
  id: "producer-1",
  name: "חוות השקמה",
  slug: "havat-hashikma",
  city: "רחובות",
  images: ["https://example.com/photo.jpg"],
  verification_tier: "verified",
  // MEH-291 Phase 3 — new field (legacy is_available_today preserved during overlap).
  availability_state: "available_today",
  is_available_today: true,
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

const minimalProducer = {
  id: "producer-2",
  name: "חנות פשוטה",
  city: "תל אביב",
  images: [],
  verification_tier: null,
  availability_state: "accepting_orders",
  is_available_today: false,
  reviews_count: 0,
  avg_rating: null,
  short_description: null,
  top_product_name: null,
  organic_certified: false,
  grass_fed: false,
  kosher: null,
  price_range: null,
  starting_price_label: null,
  categories: [],
};

beforeEach(() => {
  authState.user = null;
  apiMock.post.mockReset().mockResolvedValue({ data: {} });
  apiMock.delete.mockReset().mockResolvedValue({ data: {} });
  toastSpy.mockClear();
  enqueueSpy.mockClear();
  favCache.ids = new Set();
  window.sessionStorage.clear();
});

describe("ProducerCard — Phase B anatomy", () => {
  it("renders the producer image with 4:3 / 1:1 responsive wrapper", () => {
    const { container } = render(<ProducerCard producer={fullProducer} />);
    const imageWrapper = container.querySelector(".aspect-square.lg\\:aspect-\\[4\\/3\\]");
    expect(imageWrapper).toBeTruthy();
  });

  it("renders fallback placeholder when images array is empty", () => {
    render(<ProducerCard producer={minimalProducer} />);
    expect(screen.getByText("מהמקור")).toBeInTheDocument();
  });

  it("never renders the premium image overlay", () => {
    render(<ProducerCard producer={fullProducer} />);
    expect(screen.queryByText("פרמיום")).not.toBeInTheDocument();
  });

  it("never renders the 'זמין היום' pill overlay (folded into dot)", () => {
    render(<ProducerCard producer={fullProducer} />);
    expect(screen.queryByText("זמין היום")).not.toBeInTheDocument();
  });

  it("never renders the legacy contact-icon row", () => {
    render(<ProducerCard producer={fullProducer} />);
    expect(screen.queryByLabelText("שלח הודעה בווטסאפ")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("התקשר לבית העסק")).not.toBeInTheDocument();
  });

  it("never renders the inline text CTA", () => {
    render(<ProducerCard producer={fullProducer} />);
    expect(screen.queryByText("מידע נוסף")).not.toBeInTheDocument();
    expect(screen.queryByText(/גלי עוד/)).not.toBeInTheDocument();
  });

  it("renders a single primary-method hint icon on the footer end", () => {
    render(<ProducerCard producer={fullProducer} />);
    const hint = screen.getByTestId("primary-method-hint");
    expect(hint).toHaveAttribute("data-method", "whatsapp");
    expect(hint.querySelector('[data-testid="icon-whatsapp"]')).toBeTruthy();
  });

  it("switches the primary-method icon when the method changes", () => {
    render(
      <ProducerCard producer={{ ...fullProducer, primary_contact_method: "phone" }} />,
    );
    const hint = screen.getByTestId("primary-method-hint");
    expect(hint).toHaveAttribute("data-method", "phone");
    expect(hint.querySelector('[data-testid="icon-phone"]')).toBeTruthy();
  });

  it("truncates the price label (narrow max-width)", () => {
    render(<ProducerCard producer={fullProducer} />);
    const price = screen.getByText("₪40-80");
    expect(price.className).toMatch(/max-w-/);
  });

  // MEH-1031 (A6): bidi-isolate the price so number+unit+currency can't flip
  // inside RTL — mirrors the rating/distance-pill dir="ltr" idiom.
  it("bidi-isolates the price label with dir=ltr", () => {
    render(<ProducerCard producer={fullProducer} />);
    const price = screen.getByText("₪40-80");
    expect(price).toHaveAttribute("dir", "ltr");
  });

  it("hides price when both price_range and starting_price_label are null", () => {
    render(<ProducerCard producer={minimalProducer} />);
    expect(screen.queryByText(/₪/)).not.toBeInTheDocument();
  });

  it("folds rating into the name row when reviews_count >= 3", () => {
    render(<ProducerCard producer={fullProducer} />);
    const rating = screen.getByTestId("card-rating");
    expect(rating).toHaveAttribute("dir", "ltr");
    // MEH-990: leading ★ glyph is now a Phosphor Star icon (no text node).
    expect(rating.querySelector('[data-testid="icon-star"]')).toBeInTheDocument();
    expect(rating.textContent.replace(/\s+/g, " ").trim()).toBe("4.5 · 12");
  });

  it("hides rating entirely when reviews_count < 3", () => {
    render(
      <ProducerCard producer={{ ...fullProducer, reviews_count: 2, avg_rating: 5 }} />,
    );
    expect(screen.queryByTestId("card-rating")).not.toBeInTheDocument();
  });

  it("hides rating when avg_rating is null even if reviews_count is high", () => {
    render(
      <ProducerCard producer={{ ...fullProducer, reviews_count: 10, avg_rating: null }} />,
    );
    expect(screen.queryByTestId("card-rating")).not.toBeInTheDocument();
  });

  // MEH-643: availability dots tokenized — available_today → primary (brand
  // green), non-available (full_this_week / on_vacation) → fg-muted. No raw
  // hex / inline style (was #4cb08b/#f97316/#EF9F27 pre-redesign).
  it("renders the primary (green) dot when availability_state='available_today'", () => {
    render(<ProducerCard producer={fullProducer} />);
    const dot = screen.getByTestId("availability-dot");
    expect(dot).toHaveAttribute("data-status", "available_today");
    expect(dot.className).toMatch(/bg-primary/);
  });

  it("renders an fg-muted dot when availability_state='full_this_week'", () => {
    render(
      <ProducerCard producer={{ ...fullProducer, availability_state: "full_this_week" }} />,
    );
    const dot = screen.getByTestId("availability-dot");
    expect(dot).toHaveAttribute("data-status", "full_this_week");
    expect(dot.className).toMatch(/bg-fg-muted/);
  });

  it("renders an fg-muted dot when availability_state='on_vacation'", () => {
    render(
      <ProducerCard producer={{ ...fullProducer, availability_state: "on_vacation" }} />,
    );
    const dot = screen.getByTestId("availability-dot");
    expect(dot).toHaveAttribute("data-status", "on_vacation");
    expect(dot.className).toMatch(/bg-fg-muted/);
  });

  it("renders no dot when producer is not available and not on vacation", () => {
    render(<ProducerCard producer={minimalProducer} />);
    expect(screen.queryByTestId("availability-dot")).not.toBeInTheDocument();
  });

  it("always shows the city", () => {
    render(<ProducerCard producer={fullProducer} />);
    expect(screen.getByText(/רחובות/)).toBeInTheDocument();
  });

  it("does NOT render distance when user has no geolocation", () => {
    render(
      <ProducerCard producer={{ ...fullProducer, lat: 32.0853, lng: 34.7818 }} />,
    );
    expect(screen.queryByTestId("distance-pill")).not.toBeInTheDocument();
  });

  it("renders distance inline in the location line when coords exist on both sides", () => {
    window.sessionStorage.setItem(
      "user_location",
      JSON.stringify({ lat: 32.0853, lng: 34.7818 }),
    );
    render(
      <ProducerCard producer={{ ...fullProducer, lat: 31.7683, lng: 35.2137 }} />,
    );
    const distance = screen.getByTestId("distance-pill");
    expect(distance.textContent).toMatch(/km\u2069 ממך$/);
    expect(distance).toHaveAttribute("dir", "ltr");
  });

  it("prefers short_description over top_product_name", () => {
    render(<ProducerCard producer={fullProducer} />);
    const desc = screen.getByTestId("card-description");
    expect(desc.textContent).toMatch(/גבינות עיזים/);
  });

  it("falls back to top_product_name when short_description is null", () => {
    render(
      <ProducerCard producer={{ ...fullProducer, short_description: null }} />,
    );
    const desc = screen.getByTestId("card-description");
    expect(desc.textContent).toBe("גבינת עיזים מיושנת");
  });

  it("hides the description row when both fields are null", () => {
    render(<ProducerCard producer={minimalProducer} />);
    expect(screen.queryByTestId("card-description")).not.toBeInTheDocument();
  });

  it("soft-truncates descriptions past 80 chars with an ellipsis", () => {
    const long = "תיאור ארוך מאוד שממשיך וממשיך וממשיך ועוד ועוד ועוד ועוד ועוד ועוד ועוד ועוד ועוד ועוד";
    render(<ProducerCard producer={{ ...fullProducer, short_description: long }} />);
    const desc = screen.getByTestId("card-description");
    expect(desc.textContent).toMatch(/…$/);
    expect(desc.textContent.length).toBeLessThanOrEqual(81);
  });

  it("renders the verified badge via BadgeRow when verification_tier='verified'", () => {
    render(<ProducerCard producer={fullProducer} />);
    const badge = screen.getByRole("button", { name: /מאומת/ });
    expect(badge).toHaveAttribute("data-badge", "verified");
  });

  it("truncates the badge row to max 2 by priority (verified > recommended wins)", () => {
    render(
      <ProducerCard
        producer={{
          ...fullProducer,
          verification_tier: "verified",
          is_recommended: true,
          days_since_created: 5,
          organic_certified: true,
        }}
      />,
    );
    expect(screen.getByRole("button", { name: /מאומת/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /מומלץ/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^חדש/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /אורגני/ })).not.toBeInTheDocument();
  });

  it("promotes organic/grass_fed/kosher into the unified pill row", () => {
    render(
      <ProducerCard
        producer={{ ...minimalProducer, organic_certified: true, grass_fed: true }}
      />,
    );
    expect(screen.getByRole("button", { name: /אורגני/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /גראס פד/ })).toBeInTheDocument();
  });

  it("uses slug for href when available", () => {
    render(<ProducerCard producer={fullProducer} />);
    const links = screen.getAllByRole("link");
    const mainLink = links.find((l) => l.getAttribute("href")?.includes("havat-hashikma"));
    expect(mainLink).toBeTruthy();
  });

  it("falls back to /producer/:id when no slug", () => {
    render(<ProducerCard producer={{ ...minimalProducer, slug: undefined }} />);
    const links = screen.getAllByRole("link");
    const mainLink = links.find((l) => l.getAttribute("href")?.includes("/producer/"));
    expect(mainLink).toBeTruthy();
  });

  it("appends ?from=referrer to both image and title links", () => {
    render(<ProducerCard producer={fullProducer} referrer="home" />);
    const tagged = screen
      .getAllByRole("link")
      .filter((l) => l.getAttribute("href")?.includes("?from=home"));
    expect(tagged.length).toBeGreaterThanOrEqual(2);
  });

  it("calls onClick when the card body is tapped outside interactive children", () => {
    const onClick = vi.fn();
    render(<ProducerCard producer={fullProducer} onClick={onClick} active={false} />);
    // MEH-1028: tap the location line — a non-interactive body element that stays
    // visible on mobile (the description is now `hidden sm:block`, so it's not a
    // representative mobile tap target).
    const body = screen.getByTestId("location-line");
    body.click();
    expect(onClick).toHaveBeenCalledWith(fullProducer);
  });

  it("applies active ring classes when active=true", () => {
    const { container } = render(<ProducerCard producer={fullProducer} active={true} />);
    const article = container.querySelector("article");
    expect(article.className).toMatch(/ring-primary/);
    expect(article.className).toMatch(/border-primary/);
  });
});

describe("ProducerCard — heart (Phase C)", () => {
  it("renders an unfilled heart for guests", () => {
    render(<ProducerCard producer={fullProducer} />);
    const heart = screen.getByTestId("card-heart");
    expect(heart).toHaveAttribute("aria-pressed", "false");
    const icon = heart.querySelector('[data-testid="icon-heart"]');
    expect(icon).toHaveAttribute("data-weight", "regular");
  });

  it("guest tap: fills heart, enqueues favorite, shows snackbar with התחברי link", () => {
    render(<ProducerCard producer={fullProducer} />);
    const heart = screen.getByTestId("card-heart");
    fireEvent.click(heart);
    expect(heart).toHaveAttribute("aria-pressed", "true");
    expect(enqueueSpy).toHaveBeenCalledWith("producer-1");
    expect(toastSpy).toHaveBeenCalled();
    // MEH-685: spy receives ("info", message, { duration, action }).
    const [type, msg, opts] = toastSpy.mock.calls[0];
    expect(type).toBe("info");
    expect(msg).toMatch(/שמרתי/);
    expect(opts.duration).toBe(5000);
    expect(opts.action.label).toBe("התחברי");
    expect(opts.action.href).toMatch(/^\/login\?redirect=/);
  });

  it("guest tap does NOT hit the API", () => {
    render(<ProducerCard producer={fullProducer} />);
    fireEvent.click(screen.getByTestId("card-heart"));
    expect(apiMock.post).not.toHaveBeenCalled();
    expect(apiMock.delete).not.toHaveBeenCalled();
  });

  it("authed tap: POSTs favorite and fills optimistically", async () => {
    authState.user = { id: "u1", producer_id: null };
    render(<ProducerCard producer={fullProducer} />);
    const heart = screen.getByTestId("card-heart");
    fireEvent.click(heart);
    expect(heart).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith("/users/me/favorites/producer-1"),
    );
  });

  it("authed second tap: DELETEs favorite (unfill)", async () => {
    authState.user = { id: "u1", producer_id: null };
    favCache.ids.add("producer-1");
    render(<ProducerCard producer={fullProducer} />);
    const heart = await screen.findByTestId("card-heart");
    // Wait for the ensureFavoritesLoaded effect to flush.
    await waitFor(() => expect(heart).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(heart);
    expect(heart).toHaveAttribute("aria-pressed", "false");
    await waitFor(() =>
      expect(apiMock.delete).toHaveBeenCalledWith("/users/me/favorites/producer-1"),
    );
  });

  it("authed tap reverts on API error", async () => {
    authState.user = { id: "u1", producer_id: null };
    apiMock.post.mockRejectedValueOnce(new Error("fail"));
    render(<ProducerCard producer={fullProducer} />);
    const heart = screen.getByTestId("card-heart");
    fireEvent.click(heart);
    expect(heart).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(heart).toHaveAttribute("aria-pressed", "false"));
    expect(toastSpy).toHaveBeenCalledWith(
      "error",
      expect.stringMatching(/השתבש/),
    );
  });

  it("hides the heart when the viewer is the producer's owner", () => {
    authState.user = { id: "u1", producer_id: "producer-1" };
    render(<ProducerCard producer={fullProducer} />);
    expect(screen.queryByTestId("card-heart")).not.toBeInTheDocument();
  });

  it("heart click does not bubble to card onClick", () => {
    const onClick = vi.fn();
    render(<ProducerCard producer={fullProducer} onClick={onClick} />);
    fireEvent.click(screen.getByTestId("card-heart"));
    expect(onClick).not.toHaveBeenCalled();
  });
});

// MEH-991 (CARD-09): v4 LOCK — a third+ badge collapses to a "+N" overflow chip.
describe("ProducerCard — badge overflow chip (MEH-991)", () => {
  it("renders +N when the producer earns more than 2 badges", () => {
    render(
      <ProducerCard
        producer={{
          ...minimalProducer,
          organic_certified: true,
          grass_fed: true,
          has_gluten_free_products: true,
          has_delivery: true,
        }}
      />,
    );
    const chip = screen.getByTestId("badge-overflow");
    expect(chip).toHaveTextContent("+2");
    expect(chip).toHaveAttribute("dir", "ltr");
  });

  it("renders no overflow chip at 2 badges or fewer", () => {
    render(
      <ProducerCard
        producer={{ ...minimalProducer, organic_certified: true, grass_fed: true }}
      />,
    );
    expect(screen.queryByTestId("badge-overflow")).not.toBeInTheDocument();
  });
});
