import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MapProducerCard from "@/components/MapProducerCard";

// MEH-1243: MapProducerCard is now a "selection card" — image · name ·
// rating-if-exists · meta line + ONE end-corner chevron (the only nav
// affordance). Body tap selects (pin-sync) an unselected card and navigates a
// selected one (second-tap). No contact CTA / "full profile" link / verified
// seal / delivery pill (all removed). Rating = ★ X.X (N), reserved-height row.
//
// MEH-826: distance block stays REAL (useUserLocation + lib/distance exercise
// the actual sessionStorage read + haversine/formatDistance pipeline).
vi.mock("next-intl", () => ({
  useTranslations: () => (k) => k,
}));

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
// next/image doesn't forward onLoad/onError reliably under jsdom — render a
// plain <img> forwarding both so the MEH-1133 aspect flip + MEH-1211 fallback
// stay testable (real-browser behavior verified separately in qa-artifacts).
vi.mock("next/image", () => ({
  default: ({ onLoad, onError, className, alt, src }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={typeof src === "string" ? src : ""} className={className} onLoad={onLoad} onError={onError} />
  ),
}));
vi.mock("@/lib/cloudinary", () => ({
  optimizeCloudinary: (u) => u || "",
}));
vi.mock("@/lib/category-registry", () => ({
  styleForProducer: () => ({
    color: "#000000",
    icon: (p) => <span data-testid="cat-icon" {...p} />,
  }),
}));
vi.mock("@phosphor-icons/react", () => ({
  Star: (p) => <span data-testid="star-icon" {...p} />,
  // MEH-1296: chevron glyph ArrowRight → CaretRight.
  CaretRight: (p) => <span data-testid="caret-icon" {...p} />,
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

const GEO = { lat: 32.0853, lng: 34.7818 };

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  pushMock.mockClear();
});

describe("MapProducerCard — distance (MEH-826)", () => {
  it("does NOT render distance when the user has no geolocation", () => {
    render(<MapProducerCard producer={producer} />);
    expect(screen.queryByTestId("map-distance-pill")).not.toBeInTheDocument();
  });

  it("renders distance as a <bdi> (auto-dir, digits-first) when coords exist", () => {
    window.localStorage.setItem("user_location", JSON.stringify(GEO));
    render(<MapProducerCard producer={producer} />);
    const pill = screen.getByTestId("map-distance-pill");
    expect(pill.tagName).toBe("BDI");
    expect(pill.textContent).toBe('54 ק"מ'); // MEH-1298: 53.9 km rounds (≥10) // 🔒 §3 Hebrew unit, no "ממך"
    expect(pill.textContent).not.toContain("km");
    // MEH-1296: no dir override — <bdi> auto-resolves to RTL so the token reads
    // digits-first in the RTL meta line.
    expect(pill).not.toHaveAttribute("dir");
  });

  it("does NOT render distance when producer lat/lng are missing", () => {
    window.localStorage.setItem("user_location", JSON.stringify(GEO));
    render(<MapProducerCard producer={{ ...producer, lat: null, lng: null }} />);
    expect(screen.queryByTestId("map-distance-pill")).not.toBeInTheDocument();
  });
});

describe("MapProducerCard — meta line (🔒 §3 category-first, distance-last)", () => {
  it("renders ONE meta line: category first, distance last", () => {
    window.localStorage.setItem("user_location", JSON.stringify(GEO));
    render(
      <MapProducerCard
        producer={{ ...producer, categories: [{ name: "ירקות, פירות ומשקים" }] }}
      />,
    );
    const meta = screen.getByTestId("map-meta-line");
    // category text comes before the distance in the DOM order
    expect(meta.textContent).toMatch(/^ירקות, פירות ומשקים/);
    expect(meta).toContainElement(screen.getByTestId("map-distance-pill"));
    expect(meta.textContent).toMatch(/ק"מ$/);
    expect(meta.textContent).not.toContain("km");
    expect(meta.textContent).not.toContain("ממך");
  });

  it("category text truncates; the distance token never shrinks", () => {
    window.localStorage.setItem("user_location", JSON.stringify(GEO));
    render(
      <MapProducerCard
        producer={{ ...producer, categories: [{ name: "ירקות, פירות ומשקים" }] }}
      />,
    );
    const categoryText = screen.getByText("ירקות, פירות ומשקים");
    expect(categoryText).toHaveClass("truncate");
    // the distance sits in a shrink-0 / whitespace-nowrap wrapper
    const distWrap = screen.getByTestId("map-distance-pill").closest("span.shrink-0");
    expect(distWrap).toBeTruthy();
    expect(distWrap).toHaveClass("whitespace-nowrap");
  });

  it("with no geolocation, meta line shows category only (fallback, same row)", () => {
    render(
      <MapProducerCard producer={{ ...producer, categories: [{ name: "דבש" }] }} />,
    );
    const meta = screen.getByTestId("map-meta-line");
    expect(meta.textContent).toContain("דבש");
    expect(screen.queryByTestId("map-distance-pill")).not.toBeInTheDocument();
  });
});

describe("MapProducerCard — rating (🔒 §5/§7 ★ X.X (N), reserved height)", () => {
  it("renders ★ X.X (N) as an LTR-isolated <bdi> at ≥3 reviews", () => {
    render(
      <MapProducerCard
        producer={{ ...producer, avg_rating: 4.5, reviews_count: 7 }}
      />,
    );
    const rating = screen.getByText("4.5 (7)");
    expect(rating.tagName).toBe("BDI");
    expect(rating).toHaveAttribute("dir", "ltr");
  });

  it("hides the rating below 3 reviews but KEEPS the row (reserved height)", () => {
    render(
      <MapProducerCard
        producer={{ ...producer, avg_rating: 5, reviews_count: 2 }}
      />,
    );
    // the rating content is gone …
    expect(screen.queryByTestId("map-rating")).not.toBeInTheDocument();
    // … but its fixed-height row still exists so all cards stay equal-height.
    expect(screen.getByTestId("map-rating-row")).toBeInTheDocument();
  });

  it("hides the rating when avg_rating is null even with many reviews", () => {
    render(
      <MapProducerCard
        producer={{ ...producer, avg_rating: null, reviews_count: 40 }}
      />,
    );
    expect(screen.queryByTestId("map-rating")).not.toBeInTheDocument();
    expect(screen.getByTestId("map-rating-row")).toBeInTheDocument();
  });
});

describe("MapProducerCard — reduced to a selection card (MEH-1243 'drop both')", () => {
  it("has no contact CTA and no 'full profile' text link", () => {
    render(
      <MapProducerCard
        producer={{ ...producer, phone: "0501234567", primary_contact_method: "whatsapp" }}
      />,
    );
    // no <button> at all, no visible "full_profile" text (it's the chevron's aria-label only)
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("full_profile")).not.toBeInTheDocument();
  });

  it("has no verified seal even when verification_tier='verified'", () => {
    render(
      <MapProducerCard producer={{ ...producer, verification_tier: "verified" }} />,
    );
    expect(screen.queryByLabelText("verified")).not.toBeInTheDocument();
  });

  it("has no delivery pill even when the producer delivers to the user's city", () => {
    render(
      <MapProducerCard
        producer={{ ...producer, delivery_areas: [{ city: "ירושלים", delivery_day: "ה" }] }}
      />,
    );
    expect(screen.queryByText("distance_prefix")).not.toBeInTheDocument();
  });

  it("renders no ✓ / → text dingbats (glyph-LOCK MEH-938)", () => {
    render(
      <MapProducerCard producer={{ ...producer, verification_tier: "verified" }} />,
    );
    expect(document.body.textContent).not.toContain("✓");
    expect(document.body.textContent).not.toContain("→");
  });
});

describe("MapProducerCard — chevron nav + second-tap (Direction B)", () => {
  it("renders a single end-corner chevron linking to /{slug}", () => {
    render(<MapProducerCard producer={producer} onClick={vi.fn()} />);
    const chevron = screen.getByTestId("map-chevron");
    expect(chevron.tagName).toBe("A");
    expect(chevron).toHaveAttribute("href", "/havat-hadvash");
    expect(chevron).toHaveAttribute("aria-label", "full_profile");
  });

  it("falls back to /producer/:id when there is no slug", () => {
    render(<MapProducerCard producer={{ ...producer, slug: undefined }} onClick={vi.fn()} />);
    expect(screen.getByTestId("map-chevron")).toHaveAttribute("href", "/producer/p1");
  });

  it("body tap on an UNSELECTED card selects (onClick), does not navigate", () => {
    const onClick = vi.fn();
    render(<MapProducerCard producer={producer} onClick={onClick} active={false} />);
    fireEvent.click(screen.getByText("חוות הדבש"));
    expect(onClick).toHaveBeenCalledWith(producer);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("body tap on an ALREADY-SELECTED card navigates to /{slug}, does not re-select", () => {
    const onClick = vi.fn();
    render(<MapProducerCard producer={producer} onClick={onClick} active={true} />);
    fireEvent.click(screen.getByText("חוות הדבש"));
    expect(pushMock).toHaveBeenCalledWith("/havat-hadvash");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("clicking the chevron does not bubble to the body select handler", () => {
    const onClick = vi.fn();
    render(<MapProducerCard producer={producer} onClick={onClick} active={false} />);
    fireEvent.click(screen.getByTestId("map-chevron"));
    expect(onClick).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("MapProducerCard — Pin-Echo selected state (🔒 §1)", () => {
  it("selected card uses a 2px category-color border + 6% tint + 7px padding", () => {
    const { container } = render(<MapProducerCard producer={producer} active={true} />);
    const article = container.querySelector("article");
    expect(article.style.borderWidth).toBe("2px");
    expect(article.style.padding).toBe("7px");
    // categoryTint("#000000", 0.06) → rgba(0, 0, 0, 0.06)
    expect(article.style.backgroundColor).toMatch(/rgba\(0, ?0, ?0, ?0\.06\)/);
  });

  it("unselected card carries no inline pin-echo border/padding overrides", () => {
    const { container } = render(<MapProducerCard producer={producer} active={false} />);
    const article = container.querySelector("article");
    expect(article.style.borderWidth).toBe("");
    expect(article.style.padding).toBe("");
  });
});

describe("MapProducerCard — no-photo placeholder (🔒 §6)", () => {
  it("renders the category-glyph placeholder on the #EAF3DE tile when no image", () => {
    render(<MapProducerCard producer={{ ...producer, categories: [{ name: "דבש" }] }} />);
    const thumb = screen.getByTestId("map-thumb");
    expect(thumb.style.backgroundColor).toMatch(/rgb\(234, ?243, ?222\)|#EAF3DE/i);
    // the placeholder glyph lives in an aria-hidden box inside the thumb
    expect(thumb.querySelector('[aria-hidden="true"]')).toBeTruthy();
    expect(thumb.querySelector("img")).toBeNull();
  });

  it("falls back from a broken image to the placeholder glyph (MEH-1211)", () => {
    const { container } = render(
      <MapProducerCard producer={{ ...producer, images: ["/dead.jpg"] }} />,
    );
    const thumb = screen.getByTestId("map-thumb");
    const img = thumb.querySelector("img");
    expect(img).toBeTruthy();
    expect(thumb.querySelector('[aria-hidden="true"]')).toBeNull();
    fireEvent.error(img);
    expect(thumb.querySelector("img")).toBeNull();
    expect(thumb.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
});

describe("MapProducerCard — price stays removed (MEH-1210)", () => {
  it("renders no price text even when price fields are set", () => {
    window.localStorage.setItem("user_location", JSON.stringify(GEO));
    render(
      <MapProducerCard
        producer={{ ...producer, city: "חיפה", price_range: "מ-35₪", categories: [{ name: "דבש" }] }}
      />,
    );
    expect(screen.queryByText(/₪/)).not.toBeInTheDocument();
    expect(screen.queryByText(/מ-35/)).not.toBeInTheDocument();
    expect(screen.queryByText("35-50")).not.toBeInTheDocument();
  });
});

describe("MapProducerCard — thumbnail letterbox (MEH-1133)", () => {
  const withImage = { ...producer, images: ["/logo.png"] };

  // jsdom never loads images (naturalWidth = 0), so stub intrinsic dimensions on
  // the rendered <img> and fire its load event to drive the onLoad aspect check.
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
