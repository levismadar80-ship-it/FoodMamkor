import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

// MEH-3216 stage 5b — «הוספה» on the product rows of a business that takes
// orders, and the order bar. The mocks are ProducerSectionsOrder's.

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
  useFormatter: () => ({ dateTime: () => "" }),
  useLocale: () => "he",
}));

vi.mock("next/image", () => ({ default: (p) => <img alt={p.alt} src={p.src} /> }));
// next/dynamic → the MiniMap marker.
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="minimap" /> }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(() => new Promise(() => {})) } }));
// MEH-2659: ProducerActivities (events + group buys) has its own test file.
vi.mock("@/app/[locale]/producer/[id]/components/ProducerActivities", () => ({ default: () => null }));
vi.mock("@/lib/cloudinary", async (importOriginal) => ({
  ...(await importOriginal()), // keep real IMAGE_RATIOS
  optimizeCloudinary: (u) => u,
}));
// MEH-1901: CaretLeft joins the set — the product grid row and signature card
// carry a forward chevron (LEFT in RTL) now that they open the detail sheet.
vi.mock("@phosphor-icons/react", () => ({
  Info: () => <span />, // MEH-2999: fine-print icon
  Leaf: () => <span />,
  // MEH-2654: ProducerSections now loads lib/chip-icons (diet glyphs on rows).
  SealCheck: () => <span />,
  Truck: () => <span />,
  Package: () => <span />,
  Certificate: () => <span />,
  Carrot: () => <span />,
  GrainsSlash: () => <span />,
  Barn: () => <span />,
  Medal: () => <span />,
  HandHeart: () => <span />,
  DropSlash: () => <span />,
  Cube: () => <span />,
  Clock: () => <span />,
  Storefront: () => <span />,
  CaretLeft: () => <span />,
  MapPin: () => <span />,
  WhatsappLogo: () => <span />,
  X: () => <span />,
  // MEH-1916: ProductSheet's per-channel CTA icon set loads through this mock.
  Phone: () => <span />,
  Globe: () => <span />,
  EnvelopeSimple: () => <span />,
  InstagramLogo: () => <span />,
  FacebookLogo: () => <span />,
  Receipt: () => <span />,
  // MEH-2264: OrderWindowScheduleBlock's card icon + disclosure chevron.
  CalendarCheck: () => <span />,
  CaretDown: () => <span />,
  Plus: () => <span />,
  Minus: () => <span />,
}));

vi.mock("@/components/DeliveryBlock", () => ({ default: () => <div data-testid="delivery" /> }));
vi.mock("@/components/ReviewsSection", () => ({ default: () => <div data-testid="reviews" /> }));
vi.mock("@/components/OpeningHours", () => ({ default: () => <div data-testid="hours" /> }));
vi.mock("@/components/DirectoryDisclaimer", () => ({ default: () => <div data-testid="disclaimer" /> }));
vi.mock("@/components/ReportButton", () => ({ default: () => <div data-testid="report" /> }));
// MEH-1306: the owner pencil is self-gating chrome irrelevant to these
// assertions — mock it out so its @/i18n/navigation import never loads.
vi.mock("@/components/OwnerSectionEditLink", () => ({ default: () => null }));
vi.mock("@/components/ProducerCard", () => ({ default: () => null }));
vi.mock("@/components/public/RecipeCard", () => ({ default: () => null }));
vi.mock("@/components/FadeInSection", () => ({
  default: ({ children, ...rest }) => <section {...rest}>{children}</section>,
  REVEAL_PRESET: {},
}));

import ProducerSections from "@/app/[locale]/producer/[id]/components/ProducerSections";
import OrderBar from "@/components/public/OrderBar";
import { setQty } from "@/lib/order-cart";

const A = "0a000000-0000-4000-8000-00000000000a";
const B = "0b000000-0000-4000-8000-00000000000b";
const C = "0c000000-0000-4000-8000-00000000000c";

const producer = {
  id: "7e57a6f0-0000-4000-8000-000000000007",
  name: "מאפייה",
  slug: "bakery",
  products: [
    { id: A, name: "חלה", image_url: null, price_min: 25, price_max: 25 },
    { id: B, name: "עוגה", image_url: null, price_min: 60, price_max: 80 },
    { id: C, name: "יין", image_url: null, price_min: 90, price_max: 90 },
    { id: "d", name: "לא להזמנה", image_url: null, price_min: 10, price_max: 10 },
  ],
};

const menuProduct = (id, name, over = {}) => ({
  id,
  name,
  image_url: null,
  price_min_agorot: 2500,
  price_max_agorot: 2500,
  price_unit: "unit",
  price_is_estimate: false,
  in_stock: true,
  contains_alcohol: false,
  ...over,
});

const MENU_PRODUCTS = [
  menuProduct(A, "חלה"),
  menuProduct(B, "עוגה", { price_min_agorot: 6000, price_is_estimate: true, in_stock: false }),
  menuProduct(C, "יין", { contains_alcohol: true }),
];

function Page({ withMenu = true }) {
  const [picks, setPicks] = useState({});
  const orderCart = withMenu
    ? {
        menu: { products: MENU_PRODUCTS },
        byId: new Map(MENU_PRODUCTS.map((p) => [p.id, p])),
        picks,
        change: (id, qty) => setPicks((cur) => setQty(cur, { id, qty })),
      }
    : null;
  return (
    <ProducerSections
      producer={producer}
      events={[]}
      sectionRefs={{ current: {} }}
      reviewsContainerRef={{ current: null }}
      reviewsVisible={false}
      orderCart={orderCart}
    />
  );
}

describe("product rows with ordering (MEH-3216 stage 5b)", () => {
  it("a business without ordering shows no «הוספה» and no open line", () => {
    render(<Page withMenu={false} />);
    expect(screen.getAllByTestId("product-row")).toHaveLength(4);
    expect(screen.queryByTestId("order-add")).toBeNull();
    expect(screen.queryByTestId("order-open-line")).toBeNull();
  });

  it("offers «הוספה» only on products the menu has, and «אזל להיום» on a sold-out one", () => {
    render(<Page />);
    expect(screen.getByTestId("order-open-line")).toBeTruthy();
    // חלה and יין are open; עוגה is sold out; the fourth is not on the menu.
    expect(screen.getAllByTestId("order-add")).toHaveLength(2);
    expect(screen.getAllByTestId("order-sold-out")).toHaveLength(1);
    expect(screen.getAllByTestId("order-alcohol")).toHaveLength(1);
    expect(screen.getAllByTestId("order-estimate")).toHaveLength(1);
  });

  it("the control is a sibling of the row button, never inside it", () => {
    render(<Page />);
    for (const add of screen.getAllByTestId("order-add")) {
      expect(add.closest("[data-testid=product-row]")).toBeNull();
    }
  });

  it("«הוספה» → 1, «+» → 2, «−» twice → back to «הוספה»", () => {
    render(<Page />);
    fireEvent.click(screen.getAllByTestId("order-add")[0]);
    expect(screen.getByTestId("order-qty").textContent).toBe("1");
    fireEvent.click(screen.getByTestId("order-plus"));
    expect(screen.getByTestId("order-qty").textContent).toBe("2");
    fireEvent.click(screen.getByTestId("order-minus"));
    fireEvent.click(screen.getByTestId("order-minus"));
    expect(screen.queryByTestId("order-stepper")).toBeNull();
    expect(screen.getAllByTestId("order-add")).toHaveLength(2);
  });
});

describe("OrderBar (MEH-3216 stage 5b)", () => {
  it("renders nothing at zero picks", () => {
    const { container } = render(<OrderBar producer={producer} count={0} totalAgorot={0} onOpen={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows the bar key and opens the sheet", () => {
    const onOpen = vi.fn();
    render(<OrderBar producer={producer} count={3} totalAgorot={8600} onOpen={onOpen} />);
    const open = screen.getByTestId("order-bar-open");
    expect(open.textContent).toBe("producer.detail.order_cart.bar");
    fireEvent.click(open);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
