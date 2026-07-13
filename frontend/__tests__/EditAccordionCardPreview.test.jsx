/**
 * MEH-1158 — header content-preview variants.
 *
 * Covers the three preview primitives (PreviewThumbs / PreviewChips /
 * PreviewEmpty) + the EditAccordionCard `preview` prop contract: additive,
 * default-off (no prop → header identical to before), rendered inside the
 * single header <button> without touching the aria wiring.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import EditAccordionCard, {
  PreviewThumbs,
  PreviewChips,
  PreviewEmpty,
} from "@/components/EditAccordionCard";

vi.mock("@phosphor-icons/react", () => ({
  CaretDown: (props) => <span data-testid="icon-caret" {...props} />,
}));

const CLOUD = "https://res.cloudinary.com/demo/image/upload/v1/";

function renderCard(extra = {}) {
  return render(
    <EditAccordionCard
      anchorId="images"
      title="תמונות"
      summary="3 תמונות"
      open={false}
      onToggle={() => {}}
      {...extra}
    >
      <div />
    </EditAccordionCard>,
  );
}

describe("EditAccordionCard preview (MEH-1158)", () => {
  it("default-off: no preview prop → no preview nodes in the header", () => {
    renderCard();
    expect(screen.queryByTestId("preview-thumbs")).not.toBeInTheDocument();
    expect(screen.queryByTestId("preview-empty")).not.toBeInTheDocument();
  });

  it("populated: preview renders INSIDE the single header button, aria intact", () => {
    renderCard({ preview: <PreviewThumbs urls={[`${CLOUD}a.jpg`]} /> });
    const btn = screen.getByTestId("accordion-images");
    expect(btn.querySelector("[data-testid='preview-thumbs']")).toBeTruthy();
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(btn).toHaveAttribute("aria-controls", "images-panel");
    // still exactly one button in the header
    expect(document.querySelectorAll("#images button").length).toBe(1);
  });

  it("empty state: PreviewEmpty renders the dashed placeholder, no text", () => {
    renderCard({ preview: <PreviewEmpty /> });
    const empty = screen.getByTestId("preview-empty");
    expect(empty).toHaveAttribute("aria-hidden", "true");
    expect(empty.textContent).toBe("");
  });
});

describe("PreviewThumbs", () => {
  it("caps at 3 thumbs and shows a +N chip for the rest", () => {
    const urls = ["a", "b", "c", "d", "e"].map((n) => `${CLOUD}${n}.jpg`);
    render(<PreviewThumbs urls={urls} />);
    const thumbs = screen.getByTestId("preview-thumbs").querySelectorAll("img");
    expect(thumbs.length).toBe(3);
    expect(screen.getByTestId("preview-overflow").textContent).toBe("+2");
  });

  it("applies the square Cloudinary fill transform via the helper", () => {
    render(<PreviewThumbs urls={[`${CLOUD}a.jpg`]} />);
    const img = screen.getByTestId("preview-thumbs").querySelector("img");
    expect(img.src).toContain("c_fill");
    expect(img.src).toContain("ar_1:1");
    expect(img.src).toContain("w_80");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("aria-hidden", "true");
  });

  it("no overflow chip at exactly 3", () => {
    render(<PreviewThumbs urls={["a", "b", "c"].map((n) => `${CLOUD}${n}.jpg`)} />);
    expect(screen.queryByTestId("preview-overflow")).not.toBeInTheDocument();
  });
});

describe("PreviewChips", () => {
  it("caps at 3 chips and shows +N for the rest", () => {
    render(<PreviewChips items={["גבינות", "יין", "דבש", "לחם"]} />);
    const chips = screen.getByTestId("preview-chips");
    expect(chips.textContent).toContain("גבינות");
    expect(chips.textContent).toContain("דבש");
    expect(chips.textContent).not.toContain("לחם");
    expect(screen.getByTestId("preview-overflow").textContent).toBe("+1");
  });

  it("single item renders without an overflow chip", () => {
    render(<PreviewChips items={["ריבת משמש"]} />);
    expect(screen.getByTestId("preview-chips").textContent).toBe("ריבת משמש");
    expect(screen.queryByTestId("preview-overflow")).not.toBeInTheDocument();
  });
});
