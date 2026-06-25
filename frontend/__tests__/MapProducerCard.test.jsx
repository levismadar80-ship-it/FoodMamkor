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

describe("MapProducerCard — glyph-LOCK (MEH-938)", () => {
  it("renders verified + full-profile labels with no raw ✓/→ dingbat (Phosphor only)", () => {
    // identity t() mock → keys; the verified span (SealCheck + label) renders only when is_verified
    render(<MapProducerCard producer={{ ...producer, is_verified: true }} />);
    expect(screen.getByText("verified")).toBeInTheDocument();
    expect(screen.getByText("full_profile")).toBeInTheDocument();
    // ✓ and → are now Phosphor icons (mocked <span>), never text dingbats — guards re-introduction
    expect(document.body.textContent).not.toContain("✓");
    expect(document.body.textContent).not.toContain("→");
  });
});
