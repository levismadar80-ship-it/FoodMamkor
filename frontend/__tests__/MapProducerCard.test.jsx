import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MapProducerCard from "@/components/MapProducerCard";

// MEH-826: covers the client-side distance block. useUserLocation + lib/distance
// are intentionally REAL — the test exercises the actual sessionStorage read +
// haversine/formatDistance pipeline. Everything else is mocked to isolate it.
vi.mock("next-intl", () => ({
  useTranslations: () => (k) => k,
}));
vi.mock("next/link", () => ({
  default: ({ children, href }) => <a href={href}>{children}</a>,
}));
// next/image doesn't forward onLoad reliably under jsdom — render a plain <img>
// that forwards onLoad + className so the MEH-1133 aspect flip is testable
// (real-browser behavior verified separately in qa-artifacts).
vi.mock("next/image", () => ({
  // MEH-1211: also forward onError so the load-failure fallback is testable.
  default: ({ onLoad, onError, className, alt, src }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={typeof src === "string" ? src : ""} className={className} onLoad={onLoad} onError={onError} />
  ),
}));
vi.mock("@/lib/cloudinary", () => ({
  optimizeCloudinary: (u) => u || "",
}));
vi.mock("@/lib/use-user-city", () => ({
  useUserCity: () => ({ city: null }),
}));
vi.mock("@/lib/map-categories", () => ({
  styleForProducer: () => ({
    color: "#000000",
    textColor: "#000000",
    icon: (p) => <span data-testid="cat-icon" {...p} />,
  }),
}));
vi.mock("@/lib/contact-method", () => ({
  getPrimaryContactHref: () => null,
  getPrimaryMethod: () => "whatsapp",
  getPrimaryContactLabel: () => "label",
  isPrimaryExternal: () => false,
}));
vi.mock("@phosphor-icons/react", () => ({
  Star: (p) => <span {...p} />,
  Truck: (p) => <span {...p} />,
  Leaf: (p) => <span {...p} />,
  WhatsappLogo: (p) => <span {...p} />,
  Phone: (p) => <span {...p} />,
  Globe: (p) => <span {...p} />,
  EnvelopeSimple: (p) => <span {...p} />,
  SealCheck: (p) => <span {...p} />,
  ArrowRight: (p) => <span {...p} />,
}));

const producer = {
  id: "p1",
  name: "חוות הדבש",
  slug: "havat-hadvash",
  images: [],
  categories: [],
  lat: 31.7683,
  lng: 35.2137,
};

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("MapProducerCard — distance (MEH-826)", () => {
  it("does NOT render distance when the user has no geolocation", () => {
    render(<MapProducerCard producer={producer} />);
    expect(screen.queryByTestId("map-distance-pill")).not.toBeInTheDocument();
  });

  it("renders LTR-isolated distance when user + producer coords exist", () => {
    window.sessionStorage.setItem(
      "user_location",
      JSON.stringify({ lat: 32.0853, lng: 34.7818 }),
    );
    render(<MapProducerCard producer={producer} />);
    const pill = screen.getByTestId("map-distance-pill");
    expect(pill.textContent).toMatch(/km\u2069 ממך$/);
    expect(pill).toHaveAttribute("dir", "ltr");
  });

  it("does NOT render distance when producer lat/lng are missing", () => {
    window.sessionStorage.setItem(
      "user_location",
      JSON.stringify({ lat: 32.0853, lng: 34.7818 }),
    );
    render(<MapProducerCard producer={{ ...producer, lat: null, lng: null }} />);
    expect(screen.queryByTestId("map-distance-pill")).not.toBeInTheDocument();
  });
});

describe("MapProducerCard — glyph-LOCK (MEH-938)", () => {
  it("renders verified seal (icon + aria-label only) with no raw ✓/→ dingbat", () => {
    // identity t() mock → keys; the SealCheck renders only when
    // verification_tier === "verified" (MEH-766 ch1 — seal source switched off is_verified).
    // Uniform template: the t("verified") TEXT is dropped on the map card — the
    // label survives as the icon's aria-label only.
    render(<MapProducerCard producer={{ ...producer, verification_tier: "verified" }} />);
    expect(screen.getByLabelText("verified")).toBeInTheDocument();
    expect(screen.queryByText("verified")).not.toBeInTheDocument();
    expect(screen.getByText("full_profile")).toBeInTheDocument();
    // ✓ and → are now Phosphor icons (mocked <span>), never text dingbats — guards re-introduction
    expect(document.body.textContent).not.toContain("✓");
    expect(document.body.textContent).not.toContain("→");
  });
});

describe("MapProducerCard — uniform card template", () => {
  it("no longer renders the category color dot on the thumbnail", () => {
    const { container } = render(
      <MapProducerCard
        producer={{ ...producer, images: ["/photo.jpg"], categories: [{ name: "דבש" }] }}
      />,
    );
    // the dot was the only absolutely-positioned span inside the thumbnail box
    expect(container.querySelector("span.absolute")).toBeNull();
  });

  it("no longer renders the hours/open-now block", () => {
    render(
      <MapProducerCard
        producer={{ ...producer, opening_hours: { sun: [["08:00", "18:00"]] } }}
      />,
    );
    // identity t() mock → the old block surfaced "open_now"/"closed_now" keys
    expect(screen.queryByText(/open_now|closed_now/)).not.toBeInTheDocument();
  });

  it("renders rating inside the chip line as an LTR-isolated <bdi>, not a trust strip", () => {
    const { container } = render(
      <MapProducerCard
        producer={{ ...producer, categories: [{ name: "דבש" }], avg_rating: 4.5, reviews_count: 7 }}
      />,
    );
    const rating = screen.getByText("4.5 (7)");
    expect(rating.tagName).toBe("BDI");
    expect(rating).toHaveAttribute("dir", "ltr");
    // chip + rating share one flex line
    expect(rating.closest("div")).toContainElement(screen.getByText("דבש"));
    expect(container.querySelectorAll("[data-testid='map-meta-line']").length).toBeLessThanOrEqual(1);
  });

  it("renders ONE meta line: city · distance (no price)", () => {
    window.sessionStorage.setItem(
      "user_location",
      JSON.stringify({ lat: 32.0853, lng: 34.7818 }),
    );
    render(
      <MapProducerCard
        producer={{ ...producer, city: "ירושלים", price_range: "מ-25/בקבוק" }}
      />,
    );
    const meta = screen.getByTestId("map-meta-line");
    expect(meta.textContent).toMatch(/^ירושלים · /);
    expect(meta).toContainElement(screen.getByTestId("map-distance-pill"));
    // MEH-1210: price no longer appears in the meta line.
    expect(meta.textContent).not.toContain("מ-");
    expect(meta.textContent).not.toContain("/בקבוק");
  });
});

// MEH-1210: price removed from discovery cards ("מגזין, לא marketplace").
// The MEH-934 RTL price-split render is gone — prices live at product level
// inside /producer, never on the map card.
describe("MapProducerCard — price removed (MEH-1210)", () => {
  it("renders no price element (no <bdi>) even when a price is set", () => {
    const { container } = render(
      <MapProducerCard producer={{ ...producer, price_range: "מ-35₪" }} />,
    );
    expect(container.querySelector("bdi")).toBeNull();
    expect(screen.queryByText(/₪/)).not.toBeInTheDocument();
    expect(screen.queryByText("מ-")).not.toBeInTheDocument();
  });

  it("renders no price when the producer has a city + distance + price", () => {
    window.sessionStorage.setItem(
      "user_location",
      JSON.stringify({ lat: 32.0853, lng: 34.7818 }),
    );
    render(
      <MapProducerCard
        producer={{ ...producer, city: "חיפה", price_range: "35-50" }}
      />,
    );
    expect(screen.queryByText("35-50")).not.toBeInTheDocument();
  });
});

describe("MapProducerCard — thumbnail letterbox (MEH-1133)", () => {
  const withImage = { ...producer, images: ["/logo.png"] };

  // jsdom never loads images (naturalWidth = 0), so stub the intrinsic
  // dimensions on the rendered <img> and fire its load event to drive the
  // onLoad aspect check exactly as a real load would.
  function loadImageWith(w, h) {
    const { container } = render(<MapProducerCard producer={withImage} />);
    const img = container.querySelector("img");
    Object.defineProperty(img, "naturalWidth", { value: w, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: h, configurable: true });
    fireEvent.load(img);
    return img;
  }

  it("letterboxes a logo-like wide image (aspect ≥ 2) with object-contain", () => {
    expect(loadImageWith(600, 200)).toHaveClass("object-contain"); // 3:1 wordmark
  });

  it("keeps a normal-aspect photo full-bleed with object-cover", () => {
    expect(loadImageWith(1200, 800)).toHaveClass("object-cover"); // 3:2 photo
  });

  it("defaults to object-cover before the image loads", () => {
    const { container } = render(<MapProducerCard producer={withImage} />);
    expect(container.querySelector("img")).toHaveClass("object-cover");
  });
});

// MEH-1211: a present-but-dead image URL must fall back to the leaf thumb
// placeholder instead of the browser broken-glyph.
describe("MapProducerCard — broken-image fallback (MEH-1211)", () => {
  it("renders the leaf placeholder when the image errors", () => {
    const { container } = render(
      <MapProducerCard producer={{ ...producer, images: ["/dead.jpg"] }} />,
    );
    // Scope to the thumbnail box — the full_profile arrow also carries aria-hidden.
    const thumb = container.querySelector(".bg-green-50");
    const img = thumb.querySelector("img");
    expect(img).toBeTruthy();
    // No leaf placeholder while the image is still present.
    expect(thumb.querySelector('[aria-hidden="true"]')).toBeNull();
    fireEvent.error(img);
    // Image is gone, the leaf placeholder box takes its place.
    expect(thumb.querySelector("img")).toBeNull();
    expect(thumb.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
});
