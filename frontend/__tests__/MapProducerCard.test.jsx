import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
vi.mock("@/lib/cloudinary", () => ({
  optimizeCloudinary: (u) => u || "",
}));
vi.mock("@/lib/use-user-city", () => ({
  useUserCity: () => ({ city: null }),
}));
vi.mock("@/lib/map-categories", () => ({
  styleForProducer: () => ({ color: "#000000" }),
}));
vi.mock("@/lib/contact-method", () => ({
  getPrimaryContactHref: () => null,
  getPrimaryMethod: () => "whatsapp",
  getPrimaryContactLabel: () => "label",
  isPrimaryExternal: () => false,
}));
vi.mock("@/lib/hours", () => ({
  parseHours: () => null,
  computeStatus: () => null,
}));
vi.mock("@phosphor-icons/react", () => ({
  Star: (p) => <span {...p} />,
  Truck: (p) => <span {...p} />,
  Leaf: (p) => <span {...p} />,
  Clock: (p) => <span {...p} />,
  WhatsappLogo: (p) => <span {...p} />,
  Phone: (p) => <span {...p} />,
  Globe: (p) => <span {...p} />,
  EnvelopeSimple: (p) => <span {...p} />,
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
    expect(pill.textContent).toMatch(/ק"מ ממך$/);
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

describe("MapProducerCard — price RTL split (MEH-934)", () => {
  it("splits a Hebrew-prefixed price: prefix in body font, number in Cormorant <bdi>", () => {
    render(<MapProducerCard producer={{ ...producer, price_range: "מ-35₪" }} />);
    const prefix = screen.getByText("מ-");
    expect(prefix.tagName).toBe("SPAN");
    expect(prefix).toHaveClass("font-body-md");
    const number = screen.getByText("35₪");
    expect(number.tagName).toBe("BDI");
    expect(number).toHaveClass("font-english", "italic", "numeric");
  });

  it("keeps a shekel-first label (₪35) whole in the <bdi> with no prefix span", () => {
    render(<MapProducerCard producer={{ ...producer, price_range: "₪35" }} />);
    expect(screen.queryByText("מ-")).not.toBeInTheDocument();
    const number = screen.getByText("₪35");
    expect(number.tagName).toBe("BDI");
    expect(number).toHaveClass("font-english", "italic");
  });

  it("renders a pure-numeric range (35-50) entirely in the <bdi>", () => {
    render(<MapProducerCard producer={{ ...producer, price_range: "35-50" }} />);
    const number = screen.getByText("35-50");
    expect(number.tagName).toBe("BDI");
  });

  it("renders no price element when the producer has no price", () => {
    const { container } = render(<MapProducerCard producer={producer} />);
    expect(container.querySelector("bdi")).toBeNull();
  });
});
