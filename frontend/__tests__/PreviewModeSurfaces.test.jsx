/**
 * MEH-2916 — what the owner's preview hides, on BOTH gallery arms.
 *
 * The first pass gated `ImageGallery`'s imageless arm and left the imaged one
 * ungated, and nothing caught it: the preview probe's fixture had
 * `images: []`, so only one of the two arms was ever rendered. A business
 * with photos saw a heart and a share button in her own preview.
 *
 * So the cases below are parameterised over the arm rather than written for
 * one, and the no-images / with-images pair is the point of the file.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PreviewModeProvider } from "@/lib/preview-mode";
import ImageGallery from "@/components/ImageGallery";

vi.mock("next-intl", () => {
  const t = (key) => key;
  t.rich = (key) => key;
  return { useTranslations: () => t };
});
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/favorites-cache", () => ({
  ensureFavoritesLoaded: vi.fn(),
  isFavorited: () => false,
  setFavoritedLocal: vi.fn(),
  subscribeFavorites: () => () => {},
}));

const IMAGES = ["https://res.cloudinary.com/demo/image/upload/v1/a.jpg"];
// aria-pressed is deliberate: the real ProducerUpdatesButton carries it too
// (`ProducerUpdatesButton.jsx:231`, `aria-pressed={on}`), so a stub without it
// would make the `favourites()` exclusion clause below a no-op. This stub is
// the case that clause is for — an earlier probe counted the real bell as a
// favourite and reported two favourites on a page that had none.
// `updates-bell` is the STUB's testid and the house convention here
// (ImageGalleryUpdatesSlot.test.jsx:21 uses the same); production's is
// `producer-updates-button`. Both are excluded below so the clause keeps
// working if this ever renders the real component.
const BELL = (
  <button data-testid="updates-bell" aria-pressed="false">
    bell
  </button>
);

const gallery = (images) => (
  <ImageGallery
    images={images}
    producerId="p-1"
    producerName="הבית של דנה"
    shareUrl="https://mehamakor.co.il/p/dana"
    updatesButton={BELL}
  />
);

// FavoriteButton carries no testid, and `t` is mocked to echo keys here, so its
// aria-label is not Hebrew — matching on copy would pass for the wrong reason
// (zero matches everywhere, controls included, which is how the first version
// of this file "passed" its preview cases while proving nothing). Counted
// instead by what the DOM really carries: aria-pressed, minus the bell, which
// carries it too. Counting aria-pressed alone is what made an earlier probe
// report two favourites on a page with none.
const favourites = () =>
  screen
    .queryAllByRole("button")
    .filter(
      (b) =>
        b.hasAttribute("aria-pressed") &&
        !["updates-bell", "producer-updates-button"].includes(b.getAttribute("data-testid")),
    ).length;
// `share-overlay`, not `share-outline`: the latter is the event-page variant
// and is absent from both gallery arms, so it counted 0 everywhere — including
// on the public page, which is what caught it.
const shares = () => screen.queryAllByTestId("share-overlay").length;
const bells = () => screen.queryAllByTestId("updates-bell").length;

describe.each([
  ["no images (the imageless arm)", []],
  ["with images (the imaged arm)", IMAGES],
])("MEH-2916 · preview hides the visitor actions — %s", (_label, images) => {
  it("hides favourite, share and the updates bell inside the preview", () => {
    render(<PreviewModeProvider>{gallery(images)}</PreviewModeProvider>);
    expect(favourites(), "favourite").toBe(0);
    expect(shares(), "share").toBe(0);
    expect(bells(), "updates bell").toBe(0);
  });

  it("control — shows all three on the public page", () => {
    // Without this the case above passes against a gallery that renders no
    // actions at all, on either arm.
    render(gallery(images));
    // Exact counts, not `toBeGreaterThan(0)`. With `> 0` the bell exclusion in
    // `favourites()` is VACUOUS — measured: deleting the clause leaves this
    // file 4/4 green either way, because the control reads 1 with it and 2
    // without, and both are "> 0". An exact 1 is falsifiable by the very
    // thing the clause exists to prevent (the bell counted as a heart), and
    // by a duplicated control, which `> 0` can never see.
    expect(favourites(), "favourite").toBe(1);
    expect(shares(), "share").toBe(1);
    expect(bells(), "updates bell").toBe(1);
  });
});
