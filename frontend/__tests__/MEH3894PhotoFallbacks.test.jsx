import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

// MEH-3894: (1) an experience falls back to its host business's photo, like an
// event (MEH-2546); (2) a photo the browser cannot load gives the no-photo
// tile, not an empty box, on the rows drawn with a CSS background-image.
vi.mock("next-intl", () => ({ useLocale: () => "he", useTranslations: () => (k) => k }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/SaveButton", () => ({ default: () => null }));

import EventEntryRow, { toEventEntry } from "@/components/EventEntryRow";
import EntityCover from "@/components/EntityCover";

const t = (k) => k;
const EXP = {
  id: 9,
  title: "סדנת לחם",
  event_date: "2099-01-03",
  event_time: "10:00:00",
  category: "בישול",
  price_per_person: 100,
  image_url: null,
  host: { producer_name: "מאפיית הכפר" },
};
const OWNER = "https://res.cloudinary.com/x/image/upload/owner.jpg";

// A window.Image whose load fails for every URL in `dead`.
function failImages(dead) {
  const made = [];
  class FakeImage {
    set src(v) {
      this._src = v;
      made.push(this);
    }
    get src() {
      return this._src;
    }
  }
  vi.stubGlobal("Image", FakeImage);
  return () =>
    act(() => {
      made.filter((i) => dead.some((d) => i._src.includes(d))).forEach((i) => i.onerror?.());
    });
}

afterEach(() => vi.unstubAllGlobals());

describe("experience rows fall back to the host business photo", () => {
  it("owner_image_url → the row shows it (kind owner)", () => {
    render(<EventEntryRow entry={toEventEntry({ ...EXP, owner_image_url: OWNER }, "experiences", t)} freeLabel="" />);
    const thumb = screen.getAllByTestId("event-row-image")[0];
    expect(thumb).toHaveAttribute("data-kind", "owner");
    expect(thumb.style.backgroundImage).toContain("owner.jpg");
  });

  it("no owner photo → the category tile", () => {
    render(<EventEntryRow entry={toEventEntry(EXP, "experiences", t)} freeLabel="" />);
    expect(screen.getAllByTestId("event-row-image")[0]).toHaveAttribute("data-kind", "category");
  });
});

describe("a photo that fails to load", () => {
  it("event row: dead URL → category tile; a live one stays", () => {
    const fire = failImages(["dead.jpg"]);
    const { rerender } = render(
      <EventEntryRow entry={toEventEntry({ ...EXP, owner_image_url: OWNER }, "experiences", t)} freeLabel="" />,
    );
    fire();
    expect(screen.getAllByTestId("event-row-image")[0]).toHaveAttribute("data-kind", "owner");
    rerender(
      <EventEntryRow
        entry={toEventEntry({ ...EXP, owner_image_url: "https://res.cloudinary.com/x/image/upload/dead.jpg" }, "experiences", t)}
        freeLabel=""
      />,
    );
    fire();
    const thumb = screen.getAllByTestId("event-row-image")[0];
    expect(thumb).toHaveAttribute("data-kind", "category");
    expect(thumb.style.backgroundImage).toBe("");
  });

  it("cover: dead URL → the band", () => {
    const fire = failImages(["dead.jpg"]);
    render(<EntityCover imageUrl="https://res.cloudinary.com/x/image/upload/dead.jpg" alt="" testIdPrefix="ex" />);
    expect(screen.getByTestId("ex-cover")).toBeInTheDocument();
    fire();
    expect(screen.queryByTestId("ex-cover")).toBeNull();
    expect(screen.getByTestId("ex-cover-band")).toBeInTheDocument();
  });
});
