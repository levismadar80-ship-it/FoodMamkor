import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-1138: imageless product cards render the canonical no-photo state
// (cream surface + leaf glyph), never an empty gray box or a generic package
// icon. MEH-1168 P1: the "מהמקור" wordmark was removed from the product
// placeholder (platform logo inside a business's own products was confusing).

vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    if (key === "producer.card.aria.image_missing") return `${vars?.name ?? ""} — תמונה חסרה`;
    return key;
  },
  useFormatter: () => ({ dateTime: () => "" }),
}));

vi.mock("next/image", () => ({
  default: (props) => <img data-testid="product-image" src={props.src} alt={props.alt} />,
}));

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => new Promise(() => {})) },
}));

vi.mock("@/lib/cloudinary", async (importOriginal) => ({
  ...(await importOriginal()), // keep real IMAGE_RATIOS
  optimizeCloudinary: (url) => `optimized:${url}`,
}));

vi.mock("@phosphor-icons/react", () => ({
  Leaf: (props) => <span data-testid="leaf-icon" data-weight={props.weight} className={props.className} />,
}));

vi.mock("@/components/DeliveryBlock", () => ({ default: () => null }));
vi.mock("@/components/FadeInSection", () => ({
  default: ({ children }) => <div>{children}</div>,
  REVEAL_PRESET: {},
}));
vi.mock("@/components/DirectoryDisclaimer", () => ({ default: () => null }));
vi.mock("@/components/OpeningHours", () => ({ default: () => null }));
vi.mock("@/components/ProducerCard", () => ({ default: () => null }));
vi.mock("@/components/public/RecipeCard", () => ({ default: () => null }));
vi.mock("@/components/ReportButton", () => ({ default: () => null }));
vi.mock("@/components/ReviewsSection", () => ({ default: () => null }));

import ProducerSections from "@/app/[locale]/producer/[id]/components/ProducerSections";

const baseProps = {
  events: [],
  similarProducers: [],
  sectionRefs: { current: {} },
  reviewsContainerRef: { current: null },
  reviewsVisible: false,
};

const producerWith = (products) => ({
  id: 1,
  name: "טבע פור",
  products,
});

describe("ProducerSections products — imageless canonical placeholder (MEH-1138)", () => {
  it("imageless card renders leaf glyph (light) on the cream token, no wordmark", () => {
    render(
      <ProducerSections
        {...baseProps}
        producer={producerWith([{ id: 11, name: "גרנולה ביתית", image_url: null }])}
      />,
    );
    const leaf = screen.getByTestId("leaf-icon");
    expect(leaf).toBeInTheDocument();
    expect(leaf.dataset.weight).toBe("light");
    expect(leaf.className).toMatch(/text-primary\/\[0\.32\]/);
    // MEH-1168 P1: the brand wordmark is gone from the product placeholder.
    expect(screen.queryByText("מהמקור")).not.toBeInTheDocument();
    // Cream surface token, not a gray/tint box.
    const placeholder = leaf.closest("div");
    expect(placeholder.className).toMatch(/bg-background/);
    expect(placeholder.getAttribute("aria-label")).toContain("גרנולה ביתית");
  });

  it("imageless card still shows the product name in the card body", () => {
    render(
      <ProducerSections
        {...baseProps}
        producer={producerWith([{ id: 11, name: "גרנולה ביתית", image_url: "" }])}
      />,
    );
    expect(screen.getByText("גרנולה ביתית")).toBeInTheDocument();
  });

  it("card WITH image renders the photo, no placeholder, name in body", () => {
    render(
      <ProducerSections
        {...baseProps}
        producer={producerWith([
          { id: 12, name: "דבש פרחי בר", image_url: "https://res.cloudinary.com/x/a.jpg" },
        ])}
      />,
    );
    expect(screen.getByTestId("product-image")).toBeInTheDocument();
    expect(screen.queryByTestId("leaf-icon")).not.toBeInTheDocument();
    expect(screen.queryByText("מהמקור")).not.toBeInTheDocument();
    expect(screen.getByText("דבש פרחי בר")).toBeInTheDocument();
  });

  it("no stray indicator/dot renders on an imageless card", () => {
    const { container } = render(
      <ProducerSections
        {...baseProps}
        producer={producerWith([{ id: 11, name: "גרנולה ביתית", image_url: null }])}
      />,
    );
    // The old pre-MEH-1126 gray Package glyph / green box must not come back.
    expect(container.querySelector(".bg-green-50")).toBeNull();
  });
});
