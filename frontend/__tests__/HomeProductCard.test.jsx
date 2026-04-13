import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import HomeProductCard from "@/components/HomeProductCard";

// Mock next/image
vi.mock("next/image", () => ({
  default: ({ src, alt }) => <img src={src} alt={alt} />,
}));

// Mock Cloudinary
vi.mock("@/lib/cloudinary", () => ({
  optimizeCloudinary: (url) => url || null,
}));

// Mock Phosphor icons
vi.mock("@phosphor-icons/react", () => ({
  CalendarBlank: (props) => <span data-testid="calendar-icon" {...props} />,
  House: (props) => <span data-testid="house-icon" {...props} />,
  Leaf: (props) => <span data-testid="leaf-icon" {...props} />,
  MagnifyingGlass: (props) => <span data-testid="search-icon" {...props} />,
  MapPin: (props) => <span data-testid="map-pin-icon" {...props} />,
  Warning: (props) => <span data-testid="warning-icon" {...props} />,
}));

// Mock child components
vi.mock("@/components/StarRating", () => ({
  default: ({ avg, count }) =>
    avg ? <span data-testid="star-rating">{avg}</span> : null,
}));

vi.mock("@/components/WhatsAppButton", () => ({
  default: ({ phone }) =>
    phone ? <button data-testid="whatsapp-btn">WhatsApp</button> : null,
}));

const fullProduct = {
  id: 1,
  title: "לחם מחמצת שיפון",
  images: ["https://example.com/bread.jpg"],
  photo: null,
  price: 35,
  unit: "כיכר",
  city: "תל אביב",
  neighborhood: "פלורנטין",
  phone: "0501234567",
  is_organic: true,
  kosher: "חלבי",
  storage_type: "טמפרטורת חדר",
  category: "מאפים",
  prep_date: "2026-04-10T00:00:00",
  expiry_date: "2026-04-15T00:00:00",
  allergens: "גלוטן, שומשום",
  quantity: 5,
  seller_name: "שרה",
  avg_rating: 4.2,
  rating_count: 8,
  moderation_status: "APPROVED",
};

const minimalProduct = {
  id: 2,
  title: "עוגיות",
  images: [],
  photo: null,
  price: null,
  unit: null,
  city: "חיפה",
  neighborhood: null,
  phone: null,
  is_organic: false,
  kosher: null,
  storage_type: null,
  category: null,
  prep_date: null,
  expiry_date: null,
  allergens: null,
  quantity: null,
  seller_name: null,
  avg_rating: null,
  rating_count: 0,
  moderation_status: "APPROVED",
};

describe("HomeProductCard", () => {
  it("renders with photo", () => {
    render(<HomeProductCard product={fullProduct} />);
    const img = screen.getByAltText("לחם מחמצת שיפון");
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("src")).toBe("https://example.com/bread.jpg");
  });

  it("renders placeholder when photo_url is null", () => {
    render(<HomeProductCard product={minimalProduct} />);
    expect(screen.getByText("מהמטבח")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders price with unit when price is set", () => {
    render(<HomeProductCard product={fullProduct} />);
    expect(screen.getByText("₪35 / כיכר")).toBeInTheDocument();
  });

  it("does NOT render price when price is null", () => {
    render(<HomeProductCard product={minimalProduct} />);
    expect(screen.queryByText(/₪/)).not.toBeInTheDocument();
    expect(screen.queryByText("במתנה")).not.toBeInTheDocument();
  });

  it("renders gift label when price is 0", () => {
    const freeProduct = { ...minimalProduct, price: 0 };
    render(<HomeProductCard product={freeProduct} />);
    expect(screen.getByText("🎁 במתנה")).toBeInTheDocument();
  });

  it("renders neighborhood when available, falls back to city", () => {
    const { rerender } = render(<HomeProductCard product={fullProduct} />);
    expect(screen.getByText(/פלורנטין/)).toBeInTheDocument();

    rerender(<HomeProductCard product={minimalProduct} />);
    expect(screen.getByText(/חיפה/)).toBeInTheDocument();
  });

  it("does NOT render allergens when null", () => {
    render(<HomeProductCard product={minimalProduct} />);
    expect(screen.queryByText(/אלרגנים/)).not.toBeInTheDocument();
  });

  it("renders allergens when present", () => {
    render(<HomeProductCard product={fullProduct} />);
    expect(screen.getByText(/גלוטן, שומשום/)).toBeInTheDocument();
  });

  it("does NOT render quantity when null", () => {
    render(<HomeProductCard product={minimalProduct} />);
    expect(screen.queryByText(/כמות זמינה/)).not.toBeInTheDocument();
  });

  it("does NOT render seller_name when null", () => {
    render(<HomeProductCard product={minimalProduct} />);
    expect(screen.queryByText(/מוכר:/)).not.toBeInTheDocument();
  });

  it("renders seller_name when present", () => {
    render(<HomeProductCard product={fullProduct} />);
    expect(screen.getByText(/מוכר: שרה/)).toBeInTheDocument();
  });

  it("renders FLAGGED moderation badge", () => {
    const flagged = { ...fullProduct, moderation_status: "FLAGGED" };
    render(<HomeProductCard product={flagged} />);
    expect(screen.getByText("בבדיקה")).toBeInTheDocument();
  });

  it("does NOT render FLAGGED badge when status is APPROVED", () => {
    render(<HomeProductCard product={fullProduct} />);
    expect(screen.queryByText("בבדיקה")).not.toBeInTheDocument();
  });

  it("renders organic badge when is_organic is true", () => {
    render(<HomeProductCard product={fullProduct} />);
    expect(screen.getByText("אורגני")).toBeInTheDocument();
  });

  it("does NOT render organic badge when is_organic is false", () => {
    render(<HomeProductCard product={minimalProduct} />);
    expect(screen.queryByText("אורגני")).not.toBeInTheDocument();
  });

  it("does NOT render dates when both are null", () => {
    render(<HomeProductCard product={minimalProduct} />);
    expect(screen.queryByText(/הוכן/)).not.toBeInTheDocument();
    expect(screen.queryByText(/עד:/)).not.toBeInTheDocument();
  });
});
