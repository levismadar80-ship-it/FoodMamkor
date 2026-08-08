/**
 * MEH-1920 — hub-tile preview composition.
 *
 * The MEH-1408 hub tile packs its MEH-1158 preview nodes into one narrow flex
 * row. Every chip carries `truncate`, whose `overflow: hidden` zeroes a flex
 * item's automatic minimum size — so a preview node holding unbounded owner
 * prose (description / product name / price line) does not merely clip itself,
 * it shrinks the structured chips beside it to a single glyph. Measured in
 * Chromium at 375px with only the free-text node as the variable: the category
 * chips went 58px→33px and 49px→30px, rendering as "ת…" / "ט…".
 *
 * This suite pins the composition rule that prevents it: only fixed-shape
 * previews reach a hub tile, free text never does. It asserts BEHAVIOUR (what
 * the tile renders), not that a particular allowlist constant exists — an
 * inert refactor that reintroduces a free-text node still reds it
 * (.claude/rules/workflow.md §3.6).
 *
 * The per-card accordion headers are out of scope and unchanged: they own a
 * full row and still show the description preview (EditAccordionCardPreview).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import EditPage from "@/app/[locale]/producer/dashboard/edit/page";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));
const authStub = { user: { id: 1, role: "producer" }, loading: false };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authStub }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/producer/dashboard/edit",
  Link: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
}));
vi.mock("@/components/ProductsSection", () => ({ default: () => null }));

// The free-text values a hub tile must never render. Each is owner-typed and
// unbounded in length — the property that breaks the row, not the wording.
const DESCRIPTION =
  "מבית היוצר שלנו — כל מה שאנחנו מגדלות ומייצרות בעבודת יד, בלי חומרים משמרים";
const PRODUCT_NAME = "טחינה גולמית משומשום אתיופי מבית הבד שלנו";
const TOP_PRODUCT = "מארז טחינות מתנה";
const PRICE_RANGE = "25-60 ₪";

// A producer whose profile group is filled on BOTH axes: two structured
// category chips AND three free-text fields competing for the same row.
const FILLED = {
  id: 1,
  name: "משק",
  images: [],
  categories: [
    { id: 1, name: "תבלינים" },
    { id: 2, name: "טחינה" },
  ],
  products: [{ id: 9, name: PRODUCT_NAME }],
  description: DESCRIPTION,
  top_product_name: TOP_PRODUCT,
  price_range: PRICE_RANGE,
  has_physical_location: true,
  city: "מודיעין",
  producer_license_number: "1234567",
  custom_questions: [],
  kashrut_badges: [],
  // METHOD_FIELD backs the whatsapp channel with `phone` (page.js:141).
  phone: "0500000000",
  primary_contact_method: "whatsapp",
};

function mount(profile) {
  api.get.mockImplementation((url) =>
    url === "/producers/me"
      ? Promise.resolve({ data: profile })
      : Promise.resolve({ data: [] }),
  );
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <EditPage />
    </NextIntlClientProvider>,
  );
  return screen.findByTestId("edit-hub");
}

beforeEach(() => {
  vi.clearAllMocks();
  api.put.mockResolvedValue({ data: {} });
});

describe("hub tile preview composition (MEH-1920)", () => {
  it("keeps every free-text field out of the profile tile", async () => {
    await mount(FILLED);
    const tile = screen.getByTestId("hub-card-profile");

    for (const freeText of [DESCRIPTION, PRODUCT_NAME, TOP_PRODUCT, PRICE_RANGE]) {
      expect(tile).not.toHaveTextContent(freeText);
    }
  });

  it("shows the structured category chips instead, each label intact", async () => {
    await mount(FILLED);
    const tile = screen.getByTestId("hub-card-profile");

    const chipRow = within(tile).getByTestId("preview-chips");
    expect([...chipRow.children].map((c) => c.textContent)).toEqual([
      "תבלינים",
      "טחינה",
    ]);
  });

  it("renders thumbs when the gallery is filled — still no free text", async () => {
    await mount({
      ...FILLED,
      images: ["https://res.cloudinary.com/demo/image/upload/v1/a.jpg"],
    });
    const tile = screen.getByTestId("hub-card-profile");

    expect(within(tile).getByTestId("preview-thumbs")).toBeInTheDocument();
    expect(tile).not.toHaveTextContent(DESCRIPTION);
  });

  it("falls back to the empty placeholder when only free-text cards are filled", async () => {
    // Description written, but nothing structured to show: no gallery, no
    // categories. The tile keeps its preview row rather than dropping it.
    await mount({ ...FILLED, images: [], categories: [] });
    const tile = screen.getByTestId("hub-card-profile");

    expect(within(tile).getByTestId("preview-empty")).toBeInTheDocument();
    expect(tile).not.toHaveTextContent(DESCRIPTION);
    expect(within(tile).queryByTestId("preview-chips")).not.toBeInTheDocument();
  });

  it("leaves the other three tiles showing their structured previews", async () => {
    await mount(FILLED);

    // license → masked chip; city → MapPin row; contact → channel label. These
    // are the previews MEH-1408 already put on those tiles; the fix must not
    // touch them.
    expect(screen.getByTestId("hub-card-trust")).toHaveTextContent("•••4567");
    expect(screen.getByTestId("hub-card-location")).toHaveTextContent("מודיעין");
    expect(screen.getByTestId("hub-card-contact")).toHaveTextContent(
      he.dashboard.producer.edit_accordion.channel_whatsapp,
    );
  });
});
