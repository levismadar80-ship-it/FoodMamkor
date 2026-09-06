// MEH-1287 chunk B — the render gate on the "עכשיו בעונה" module.
//
// The threshold is the assertion that matters. A curated strip showing ONE
// business reads as an ad for that business rather than as an editorial
// selection, so ADDENDUM-4 set the gate at three — and a gate is only a gate
// if both sides are pinned. 2 → nothing at all (no heading, no empty state),
// 3 → the module. An off-by-one (`> 3`, `>= 2`) reddens exactly one side.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import HomeSeasonalNow, {
  SEASONAL_MIN_PRODUCERS,
} from "@/app/[locale]/home/HomeSeasonalNow";

vi.mock("next-intl", () => ({
  useTranslations: () => (key) =>
    key === "home.seasonal.heading" ? "עכשיו בעונה" : key,
}));

// The card is not the subject here — the gate is — and ProducerCard drags in
// Cloudinary, next/image and the badge registry. Its props ARE the subject of
// one assertion below, so the stub records them rather than rendering nothing.
const cardProps = [];
vi.mock("@/components/ProducerCard", () => ({
  default: (props) => {
    cardProps.push(props);
    return <div data-testid="seasonal-card">{props.producer.name}</div>;
  },
}));

const rows = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `עסק ${i}` }));

describe("HomeSeasonalNow", () => {
  it("keeps the threshold at three", () => {
    // Pinned as a LITERAL, and the boundary cases below count in literals too.
    // Written as `SEASONAL_MIN_PRODUCERS - 1` / `SEASONAL_MIN_PRODUCERS` they
    // would be derived from the very constant under test: lower it to 1 and
    // every case still passes while the module ships as a one-business ad.
    // The number is a product ruling (ADDENDUM-4), so changing it should have
    // to go through a red test and a decision, not a one-character edit.
    expect(SEASONAL_MIN_PRODUCERS).toBe(3);
  });

  it("renders nothing at two businesses, one below the threshold", () => {
    const { container } = render(<HomeSeasonalNow producers={rows(2)} />);
    // Empty container, not merely a missing heading: the card explicitly asks
    // for no empty state ("אם אין בחירה פעילה — המודול לא מרונדר").
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("עכשיו בעונה")).toBeNull();
  });

  it("renders at exactly three, the threshold", () => {
    render(<HomeSeasonalNow producers={rows(3)} />);
    expect(screen.getByTestId("home-seasonal-now")).toBeTruthy();
    expect(screen.getByText("עכשיו בעונה")).toBeTruthy();
    expect(screen.getAllByTestId("seasonal-card")).toHaveLength(3);
  });

  it("renders every business above the threshold, not just the first three", () => {
    render(<HomeSeasonalNow producers={rows(5)} />);
    expect(screen.getAllByTestId("seasonal-card")).toHaveLength(5);
  });

  it("survives a failed fetch without throwing", () => {
    // The server shell fails soft to `null` (page.js), so `null` reaches this
    // component on any backend blip. `null.length` would blow up the whole
    // homepage over a module that is allowed to be absent.
    const { container } = render(<HomeSeasonalNow producers={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(render(<HomeSeasonalNow producers={[]} />).container).toBeEmptyDOMElement();
  });

  it("tags its cards with their own referrer", () => {
    cardProps.length = 0;
    render(<HomeSeasonalNow producers={rows(3)} />);
    // Not cosmetic: `?from=` lands in producer_page_views.referrer, so a
    // shared "home" value would make the module's traffic unmeasurable —
    // and this module exists to be judged on whether it brings anyone back.
    expect(cardProps.map((p) => p.referrer)).toEqual([
      "home-seasonal",
      "home-seasonal",
      "home-seasonal",
    ]);
  });
});
