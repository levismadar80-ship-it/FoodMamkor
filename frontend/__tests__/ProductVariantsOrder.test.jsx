import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

// MEH-3617 — a product with sizes or flavours on the business page: 0 / 1 /
// many variants, one sold out, all sold out. The mocks are OrderCartRows.test.jsx.

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
  // MEH-3824: offer-switch icons (lib/chip-icons.js)
  Basket: () => null,
  UsersThree: () => null,
  CalendarBlank: () => null,
  CookingPot: () => null,
  Info: () => <span />, // MEH-2999: fine-print icon
  ShareNetwork: () => <span />, // MEH-3622: ProductSheet's share button
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
  CaretRight: () => <span />,
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
vi.mock("@/components/public/ProductFacts", () => ({ default: () => null }));

import { pickedLine, pickedTotalAgorot, keepOrderable, rowEstimateAgorot } from "@/lib/order-cart";
import { quoteBody } from "@/lib/order-sheet";
import { lineKey, orderLineName, splitKey, variantPrice } from "@/lib/product-variants";

const A = "0a000000-0000-4000-8000-00000000000a";
const S = "05000000-0000-4000-8000-000000000005";
const L = "06000000-0000-4000-8000-000000000006";

const pageProduct = (variants) => ({ id: A, name: "עוגה", image_url: null, price_min: 60, price_max: 60, variants });
const menuProduct = (variants, over = {}) => ({
  id: A,
  name: "עוגה",
  image_url: null,
  price_min_agorot: 6000,
  price_max_agorot: 6000,
  price_unit: "unit",
  price_is_estimate: false,
  in_stock: true,
  contains_alcohol: false,
  variants,
  ...over,
});
const mv = (id, name, price, in_stock = true) => ({ id, name, price_agorot: price, price_is_estimate: false, in_stock });
const pv = (id, name, price, in_stock = true) => ({ id, name, price_agorot: price, in_stock });

function Page({ page, menu }) {
  const [picks, setPicks] = useState({});
  const orderCart = {
    menu: { products: [menu] },
    byId: new Map([[menu.id, menu]]),
    picks,
    change: (id, qty) => setPicks((cur) => setQty(cur, { id, qty })),
  };
  return (
    <>
      <ProducerSections
        producer={{ id: "7e57a6f0-0000-4000-8000-000000000007", name: "מאפייה", slug: "b", products: [page] }}
        events={[]}
        sectionRefs={{ current: {} }}
        reviewsContainerRef={{ current: null }}
        reviewsVisible={false}
        orderCart={orderCart}
      />
      <output data-testid="picks">{JSON.stringify(picks)}</output>
    </>
  );
}

const picksOf = () => JSON.parse(screen.getByTestId("picks").textContent);

describe("business page rows with variants (MEH-3617)", () => {
  it("0 variants: the row is exactly as before — «הוספה» on the product id", () => {
    render(<Page page={pageProduct([])} menu={menuProduct([])} />);
    expect(screen.queryByTestId("product-variant-names")).toBeNull();
    expect(screen.queryByTestId("order-choose")).toBeNull();
    fireEvent.click(screen.getByTestId("order-add"));
    expect(picksOf()).toEqual({ [A]: 1 });
  });

  it("1 variant: no choice is shown, the row names it at its price, and the line names it", () => {
    render(<Page page={pageProduct([pv(S, "גדולה", 7000)])} menu={menuProduct([mv(S, "גדולה", 7000)])} />);
    // The product's own price is 60; the order is priced at the variant's 70,
    // so the page shows 70 and the name, never 60 alone (rule-5a finding).
    expect(screen.getByTestId("product-variant-names").textContent).toBe("גדולה");
    expect(screen.queryByTestId("product-price-from")).toBeNull();
    expect(screen.getAllByText(/70/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^60/)).toBeNull();
    expect(screen.queryByTestId("order-choose")).toBeNull();
    fireEvent.click(screen.getByTestId("order-add"));
    expect(picksOf()).toEqual({ [lineKey(A, S)]: 1 });
  });

  it("many variants: the row names them, offers «בחירה», and has no «הוספה»", () => {
    render(
      <Page
        page={pageProduct([pv(S, "קטנה", 4000), pv(L, "גדולה", null)])}
        menu={menuProduct([mv(S, "קטנה", 4000), mv(L, "גדולה", 6000)])}
      />,
    );
    expect(screen.getByTestId("product-variant-names").textContent).toBe("קטנה · גדולה");
    expect(screen.queryByTestId("order-add")).toBeNull();
    expect(screen.getByTestId("product-price-from")).toBeTruthy();
    // «בחירה» opens the sheet, where each variant has its own «הוספה».
    fireEvent.click(screen.getByTestId("order-choose"));
    const rows = screen.getAllByTestId("product-variant-row");
    expect(rows).toHaveLength(2);
    fireEvent.click(rows[1].querySelector("[data-testid=order-add]"));
    expect(picksOf()).toEqual({ [lineKey(A, L)]: 1 });
    expect(screen.getByTestId("order-chosen").textContent).toBe("chosen");
  });

  it("one variant sold out: shown disabled, the other can still be added", () => {
    render(
      <Page
        page={pageProduct([pv(S, "קטנה", 4000, false), pv(L, "גדולה", 6000)])}
        menu={menuProduct([mv(S, "קטנה", 4000, false), mv(L, "גדולה", 6000)])}
      />,
    );
    fireEvent.click(screen.getByTestId("order-choose"));
    const [small, large] = screen.getAllByTestId("product-variant-row");
    expect(small.querySelector("[data-testid=order-add]")).toBeNull();
    expect(small.querySelector("[data-testid=order-sold-out]")).toBeTruthy();
    expect(large.querySelector("[data-testid=order-add]")).toBeTruthy();
  });

  it("all variants sold out: the product row is sold out (the menu says so)", () => {
    render(
      <Page
        page={pageProduct([pv(S, "קטנה", 4000, false), pv(L, "גדולה", 6000, false)])}
        menu={menuProduct([mv(S, "קטנה", 4000, false), mv(L, "גדולה", 6000, false)], { in_stock: false })}
      />,
    );
    expect(screen.queryByTestId("order-choose")).toBeNull();
    expect(screen.getByTestId("order-sold-out")).toBeTruthy();
  });
});

describe("cart sums and lines with variants (MEH-3617)", () => {
  const many = menuProduct([mv(S, "קטנה", 4000), mv(L, "גדולה", 6500, false)]);
  const byId = new Map([[A, many]]);

  it("prices a variant line at the variant's price", () => {
    expect(pickedTotalAgorot({ [lineKey(A, S)]: 2 }, [many])).toBe(8000);
  });

  it("a product with many variants and no variant in the key is not a line", () => {
    expect(pickedLine(byId, A)).toBeNull();
  });

  it("drops a sold-out variant and an unknown one, keeps the rest", () => {
    const picks = { [lineKey(A, S)]: 1, [lineKey(A, L)]: 1, [lineKey(A, "nope")]: 1 };
    expect(keepOrderable(picks, [many])).toEqual({ [lineKey(A, S)]: 1 });
  });

  it("0 variants: a key with a variant is not a line, the bare id is", () => {
    const plain = menuProduct([]);
    expect(pickedLine(new Map([[A, plain]]), lineKey(A, S))).toBeNull();
    expect(pickedLine(new Map([[A, plain]]), A)?.unitAgorot).toBe(6000);
  });

  it("sends variant_id on a variant line and never a price", () => {
    const body = quoteBody({ producerId: "p", picks: { [lineKey(A, S)]: 2, X: 1 }, fulfilment: "pickup", city: "" });
    expect(body.items).toEqual([
      { product_id: A, variant_id: S, qty: 2 },
      { product_id: "X", qty: 1 },
    ]);
  });

  it("splitKey reverses lineKey", () => {
    expect(splitKey(lineKey(A, S))).toEqual({ productId: A, variantId: S });
    expect(splitKey(A)).toEqual({ productId: A, variantId: null });
  });

  it("the row estimate: none for many variants, the variant's for one", () => {
    expect(rowEstimateAgorot(many)).toBeNull();
    expect(rowEstimateAgorot(menuProduct([{ ...mv(S, "x", 4500), price_is_estimate: true }]))).toBe(4500);
    expect(rowEstimateAgorot(menuProduct([], { price_is_estimate: true, price_max_agorot: 7000 }))).toBe(7000);
  });

  it("«מ-X» is the lowest in-stock variant price, a variant without one counting at the product's", () => {
    expect(variantPrice(pageProduct([]))).toBeNull();
    expect(variantPrice(pageProduct([pv(S, "a", 7000), pv(L, "b", null)]))).toEqual({ shekels: 60, from: true });
    expect(variantPrice(pageProduct([pv(S, "a", 4000), pv(L, "b", null)]))).toEqual({ shekels: 40, from: true });
    // One variant: its own price, no «מ-».
    expect(variantPrice(pageProduct([pv(S, "a", 4000)]))).toEqual({ shekels: 40, from: false });
    // All the same price: no «מ-».
    expect(variantPrice(pageProduct([pv(S, "a", 6000), pv(L, "b", null)]))).toEqual({ shekels: 60, from: false });
    // None with a price of its own: the product's own price, as before.
    expect(variantPrice(pageProduct([pv(S, "a", null), pv(L, "b", null)]))).toBeNull();
    expect(variantPrice(pageProduct([pv(S, "a", null)]))).toBeNull();
    // A sold-out cheaper one does not set the price, unless all are sold out.
    expect(variantPrice(pageProduct([pv(S, "a", 3000, false), pv(L, "b", 5000)]))).toEqual({ shekels: 50, from: false });
    expect(variantPrice(pageProduct([pv(S, "a", 3000, false), pv(L, "b", 5000, false)]))).toEqual({ shekels: 30, from: true });
  });

  // MEH-3968: a size with no price of its own, on a product with no price,
  // has no number. Pre-fix it was dropped and the one priced size read as
  // THE price («40₪» flat) for every size.
  it("a variant with no price at all is not dropped: the priced one reads «מ-», never flat", () => {
    const noBase = (variants) => ({ ...pageProduct(variants), price_min: null, price_max: null });
    expect(variantPrice(noBase([pv(S, "a", 4000), pv(L, "b", null)]))).toEqual({ shekels: 40, from: true });
    expect(variantPrice(noBase([pv(S, "a", 4000)]))).toEqual({ shekels: 40, from: false });
  });

  it("a bare key on a product that has variants is dropped, so no twin line is sent", () => {
    const one = menuProduct([mv(S, "x", 4500)]);
    const byId = new Map([[one.id, one]]);
    expect(pickedLine(byId, A)).toBeNull();
    expect(pickedLine(byId, lineKey(A, S))?.unitAgorot).toBe(4500);
    expect(keepOrderable({ [A]: 2, [lineKey(A, S)]: 1 }, [one])).toEqual({ [lineKey(A, S)]: 1 });
  });

  it("an order line reads «{product} · {variant}»", () => {
    expect(orderLineName({ name: "עוגה", variant_name: "גדולה" })).toBe("עוגה · גדולה");
    expect(orderLineName({ name: "עוגה", variant_name: null })).toBe("עוגה");
  });
});
