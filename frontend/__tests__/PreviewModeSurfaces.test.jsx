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
// aria-pressed is deliberate: the real ProducerUpdatesButton carries it, so a
// stub without it would make the `favourites()` exclusion clause below a no-op
// that passes whatever the filter does. This stub is the case that clause is
// for — an earlier probe counted the real bell as a favourite and reported two
// favourites on a page that had none.
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
      (b) => b.hasAttribute("aria-pressed") && b.getAttribute("data-testid") !== "updates-bell",
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
    expect(favourites(), "favourite").toBeGreaterThan(0);
    expect(shares(), "share").toBeGreaterThan(0);
    expect(bells(), "updates bell").toBe(1);
  });
});
