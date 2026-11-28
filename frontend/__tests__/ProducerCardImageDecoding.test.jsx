import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ProducerCard from "@/components/ProducerCard";

/**
 * MEH-3983 — Back to the home grid must not blink the card photos.
 *
 * next/image writes decoding="async" by default. On a remounted grid that made
 * every cached photo paint one frame late (the empty tile first), which read as
 * a flash on Back. The home grid passes imageDecoding="sync" when the reader is
 * returning (useRevealSkip); everywhere else the default stays async, so a first
 * visit does not block its paint on decoding.
 */

vi.mock("next-intl", () => ({ useTranslations: () => (key) => key, useLocale: () => "he" }));

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
}));
// next/image is the REAL component: the assertion is on the attribute it writes.
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
// ProducerCard.test.jsx does.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@phosphor-icons/react", () => ({
  // MEH-3824: offer-switch icons (lib/chip-icons.js)
  Basket: () => null,
  UsersThree: () => null,
  CalendarBlank: () => null,
  CookingPot: () => null,
  Leaf: (p) => <span data-testid="leaf-icon" {...p} />,
  HeartStraight: ({ weight, ...p }) => <span data-testid="icon-heart" {...p} />,
  Star: (p) => <span data-testid="icon-star" {...p} />,
  Truck: (p) => <span data-testid="icon-truck" {...p} />,
  // MEH-2584: BadgeRow now imports lib/chip-icons.js (badge glyphs).
  SealCheck: () => null,
  Package: () => null,
  Storefront: () => null, // MEH-2598: chip-icons on_site
  Certificate: () => null,
  Carrot: () => null,
  GrainsSlash: () => null,
  Barn: () => null,
  Medal: () => null,
  HandHeart: () => null,
  DropSlash: () => null,
  Cube: () => null,
  Clock: () => null,
}));


const producer = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "מאפיית רוח השדה",
  city: "זכרון יעקב",
  categories: [],
  images: ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
};

const photo = () => screen.getByRole("img", { name: producer.name });

describe("ProducerCard — photo decoding on a return (MEH-3983)", () => {
  it("a returning grid decodes the photo synchronously", () => {
    render(<ProducerCard producer={producer} imageDecoding="sync" />);
    expect(photo().getAttribute("decoding")).toBe("sync");
  });

  it("without the hint the card keeps next/image's async default", () => {
    render(<ProducerCard producer={producer} />);
    expect(photo().getAttribute("decoding")).toBe("async");
  });
});
