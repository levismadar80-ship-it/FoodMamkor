// @ts-check
/**
 * Module:   card-image-priority
 * Purpose:  How a grid card's photo loads, by its position in the grid. One
 *           owner, so /producers and the category/region landing grids agree.
 * Does NOT: render anything — ProducerCard turns the answer into next/image's
 *           `loading` / `fetchPriority` (components/ProducerCard.jsx).
 * History:  MEH-2233 (creation). On /producers and /producers/<cat>/<region>
 *           the LCP element is a first-row card photo, and every card photo
 *           was lazy, so its request waited for layout (staging 20/11, slow
 *           4G + CPU x4: median LCP 5.4–5.5s).
 *
 * The industry rule (Chrome «Optimize image priority», web.dev «lazy loading
 * effects», Etsy's priority-hints trial): never lazy-load what is in the first
 * viewport, and give `fetchpriority="high"` to one or two images at most —
 * more than that and they compete with each other for the same bandwidth.
 */

// The first screen of the grid: one row at xl (4 columns), two rows on a phone.
export const EAGER_CARD_IMAGES = 4;
// The first row on a phone (2 columns) — where the LCP card sits.
export const HIGH_PRIORITY_CARD_IMAGES = 2;

/**
 * @param {number} index  the card's position in the grid, from 0
 * @returns {"high" | "eager" | undefined}  undefined = next/image's lazy default
 */
export function cardImagePriority(index) {
  if (index < HIGH_PRIORITY_CARD_IMAGES) return "high";
  if (index < EAGER_CARD_IMAGES) return "eager";
  return undefined;
}
