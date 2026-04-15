import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ProducerCard from "@/components/ProducerCard";

// Mock next/link — render as <a>
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock next/image — render as <img>
vi.mock("next/image", () => ({
  default: ({ src, alt, ...props }) => <img src={src} alt={alt} />,
}));

// Mock Cloudinary optimizer — pass through
vi.mock("@/lib/cloudinary", () => ({
  optimizeCloudinary: (url) => url || null,
}));

// Mock normalizePhone — simple passthrough
vi.mock("@/lib/utils", () => ({
  normalizePhone: (phone) => (phone ? phone.replace(/^0/, "972") : ""),
}));

// Mock Phosphor icons
vi.mock("@phosphor-icons/react", () => ({
  Seal: (props) => <span data-testid="seal-icon" {...props} />,
  Leaf: (props) => <span data-testid="leaf-icon" {...props} />,
  Cow: (props) => <span data-testid="cow-icon" {...props} />,
}));

// Mock CategoryTag
vi.mock("@/components/CategoryTag", () => ({
  default: ({ category }) => <span data-testid="category-tag">{category.name}</span>,
}));

const fullProducer = {
  id: 1,
  name: "חוות השקמה",
  slug: "havat-hashikma",
  city: "רחובות",
  phone: "0501234567",
  instagram: "havat_hashikma",
  images: ["https://example.com/photo.jpg"],
  is_verified: true,
  plan: "premium",
  is_available_today: true,
  reviews_count: 12,
  avg_rating: 4.5,
  top_product_name: "גבינת עיזים מיושנת",
  organic_certified: true,
  grass_fed: true,
  kosher: "חלבי",
  price_range: "₪40-80",
  categories: [{ id: 1, name: "חלב וגבינות", emoji: "🥛" }],
};

const minimalProducer = {
  id: 2,
  name: "חנות פשוטה",
  city: "תל אביב",
  phone: null,
  instagram: null,
  images: [],
  is_verified: false,
  plan: null,
  is_available_today: false,
  reviews_count: 0,
  avg_rating: null,
  top_product_name: null,
  organic_certified: false,
  grass_fed: false,
  kosher: null,
  price_range: null,
  starting_price_label: null,
  categories: [],
};

describe("ProducerCard", () => {
  it("renders with all fields populated", () => {
    render(<ProducerCard producer={fullProducer} />);
    expect(screen.getByText("חוות השקמה")).toBeInTheDocument();
    expect(screen.getByText("מאומת")).toBeInTheDocument();
    expect(screen.getByText("פרמיום")).toBeInTheDocument();
    expect(screen.getByText("זמין היום")).toBeInTheDocument();
    expect(screen.getByText("גבינת עיזים מיושנת")).toBeInTheDocument();
    expect(screen.getByText("אורגני")).toBeInTheDocument();
    expect(screen.getByText("גראס פד")).toBeInTheDocument();
    expect(screen.getByText(/חלבי/)).toBeInTheDocument();
    expect(screen.getByText("₪40-80")).toBeInTheDocument();
  });

  it("does NOT render phone button when phone is null", () => {
    render(<ProducerCard producer={minimalProducer} />);
    expect(screen.queryByLabelText("התקשר לבית העסק")).not.toBeInTheDocument();
  });

  it("does NOT render instagram button when instagram is null", () => {
    render(<ProducerCard producer={minimalProducer} />);
    expect(screen.queryByLabelText("עמוד אינסטגרם")).not.toBeInTheDocument();
  });

  it("does NOT render WhatsApp button when phone is null", () => {
    render(<ProducerCard producer={minimalProducer} />);
    expect(screen.queryByLabelText("שלח הודעה בווטסאפ")).not.toBeInTheDocument();
  });

  it("renders verified badge only when is_verified=true", () => {
    const { rerender } = render(<ProducerCard producer={fullProducer} />);
    expect(screen.getByText("מאומת")).toBeInTheDocument();

    rerender(<ProducerCard producer={minimalProducer} />);
    expect(screen.queryByText("מאומת")).not.toBeInTheDocument();
  });

  it("does NOT render premium badge when plan is not premium", () => {
    render(<ProducerCard producer={minimalProducer} />);
    expect(screen.queryByText("פרמיום")).not.toBeInTheDocument();
  });

  it("does NOT render availability badge when is_available_today is false", () => {
    render(<ProducerCard producer={minimalProducer} />);
    expect(screen.queryByText("זמין היום")).not.toBeInTheDocument();
  });

  it("does NOT render reviews when reviews_count is 0", () => {
    render(<ProducerCard producer={minimalProducer} />);
    expect(screen.queryByText(/⭐/)).not.toBeInTheDocument();
  });

  it("does NOT render top product when top_product_name is null", () => {
    render(<ProducerCard producer={minimalProducer} />);
    expect(screen.queryByText("גבינת עיזים מיושנת")).not.toBeInTheDocument();
  });

  it("does NOT render price when price_range and starting_price_label are null", () => {
    render(<ProducerCard producer={minimalProducer} />);
    expect(screen.queryByText(/₪/)).not.toBeInTheDocument();
  });

  it("renders fallback placeholder when images array is empty", () => {
    render(<ProducerCard producer={minimalProducer} />);
    expect(screen.getByText("מהמקור")).toBeInTheDocument();
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
    const mainLink = links.find((l) => l.getAttribute("href")?.includes("/producer/2"));
    expect(mainLink).toBeTruthy();
  });

  // ----- MEH-12 availability badge -----

  it("does NOT render availability badge when status is 'available' (default)", () => {
    render(
      <ProducerCard producer={{ ...fullProducer, availability_status: "available" }} />,
    );
    expect(screen.queryByText("פתוח להזמנות")).not.toBeInTheDocument();
  });

  it("renders the 'עמוס כרגע' badge when status is 'full'", () => {
    render(
      <ProducerCard producer={{ ...fullProducer, availability_status: "full" }} />,
    );
    expect(screen.getByText("עמוס כרגע")).toBeInTheDocument();
  });

  it("renders the 'בהפסקה' badge when status is 'vacation'", () => {
    render(
      <ProducerCard producer={{ ...fullProducer, availability_status: "vacation" }} />,
    );
    expect(screen.getByText("בהפסקה")).toBeInTheDocument();
  });

  // ----- MEH-13 distance pill -----

  it("does NOT render distance pill when user has not granted geolocation", () => {
    window.sessionStorage.clear();
    render(
      <ProducerCard
        producer={{ ...fullProducer, lat: 32.0853, lng: 34.7818 }}
      />,
    );
    expect(screen.queryByTestId("distance-pill")).not.toBeInTheDocument();
  });

  it("does NOT render distance pill when producer has no lat/lng", () => {
    window.sessionStorage.setItem(
      "user_location",
      JSON.stringify({ lat: 32.0853, lng: 34.7818 }),
    );
    render(<ProducerCard producer={fullProducer} />);
    expect(screen.queryByTestId("distance-pill")).not.toBeInTheDocument();
    window.sessionStorage.clear();
  });

  it("renders distance pill when both userLoc and producer coords exist", () => {
    // Tel Aviv → Jerusalem = ~54 km
    window.sessionStorage.setItem(
      "user_location",
      JSON.stringify({ lat: 32.0853, lng: 34.7818 }),
    );
    render(
      <ProducerCard
        producer={{ ...fullProducer, lat: 31.7683, lng: 35.2137 }}
      />,
    );
    const pill = screen.getByTestId("distance-pill");
    expect(pill).toBeInTheDocument();
    expect(pill.textContent).toMatch(/ק"מ ממך$/);
    window.sessionStorage.clear();
  });

  // ----- MEH-17 primary-method highlight -----

  it("marks the WhatsApp icon as primary when primary_contact_method='whatsapp'", () => {
    render(
      <ProducerCard
        producer={{ ...fullProducer, primary_contact_method: "whatsapp" }}
      />,
    );
    const whatsappLink = screen.getByLabelText("שלח הודעה בווטסאפ");
    expect(whatsappLink).toHaveAttribute("data-primary", "true");
    const phoneLink = screen.getByLabelText("התקשר לבית העסק");
    expect(phoneLink).not.toHaveAttribute("data-primary");
  });

  it("marks the phone icon as primary when primary_contact_method='phone'", () => {
    render(
      <ProducerCard
        producer={{ ...fullProducer, primary_contact_method: "phone" }}
      />,
    );
    const phoneLink = screen.getByLabelText("התקשר לבית העסק");
    expect(phoneLink).toHaveAttribute("data-primary", "true");
    const whatsappLink = screen.getByLabelText("שלח הודעה בווטסאפ");
    expect(whatsappLink).not.toHaveAttribute("data-primary");
  });

  it("renders an email icon when contact_email is set", () => {
    render(
      <ProducerCard
        producer={{
          ...fullProducer,
          contact_email: "hello@example.com",
          primary_contact_method: "email",
        }}
      />,
    );
    const emailLink = screen.getByLabelText("שלח אימייל");
    expect(emailLink).toHaveAttribute("href", "mailto:hello@example.com");
    expect(emailLink).toHaveAttribute("data-primary", "true");
  });
});
