// @ts-check
/**
 * Module:   map-pin-labels
 * Purpose:  The business name next to its pin once the map is zoomed in close
 *           (Google Maps pattern) — so a pin can be read without tapping it.
 *           Labels that would collide with another label or another pin are
 *           hidden for that view; the selected business wins first.
 * Does NOT: build markers or decide which points exist (MapComponent +
 *           producerPoints), style the label (globals.css
 *           `.mehamakor-pin-label`), or label pickup / market points — only a
 *           business's own location pin carries its name, so a business with
 *           several pickup points does not repeat its name (MEH-3054 context).
 * Related:  frontend/components/MapComponent.jsx (bind + install call sites);
 *           frontend/app/globals.css (`.mehamakor-pin-label`, MEH-1682 RTL
 *           tooltip origin).
 * History:  MEH-3066 (creation — big-sites map research, gap 3).
 */

/** Zoom from which names show (≈ a town filling the screen). */
export const PIN_LABEL_MIN_ZOOM = 13;
export const PIN_LABEL_CLASS = "mehamakor-pin-label";
export const PIN_LABEL_HIDDEN_CLASS = "mehamakor-pin-label-hidden";
export const LABELS_ON_CLASS = "mehamakor-labels-on";
/** The class MapComponent puts on the selected business's markers (MEH-1611). */
const FOCUSED_MARKER_CLASS = "mehamakor-marker-focused";
const OBSTACLE_SELECTOR = ".mehamakor-marker-wrap, .mehamakor-cluster, .leaflet-control, .mehamakor-my-location";
/** Floating UI over the map that lives outside the Leaflet container. */
const OVERLAY_SELECTOR = '[data-testid="map-search-this-area"]';
const SHEET_SELECTOR = '[data-testid="map-bottom-sheet"]';
/** The label element carries the business id, so focus never matches by text. */
const PRODUCER_ID_ATTR = "data-producer-id";
/** Breathing room between two labels, px. */
const LABEL_GAP = 2;
/** The label sits this many px away from the pin centre (36px pin / 2 + 4). */
const LABEL_OFFSET_PX = 22;

/**
 * A location is a business's own place unless it is a pickup / market point.
 * REUSES: frontend/components/MapComponent.jsx createLocationIcon — same split.
 * @param {{ kind?: string } | null | undefined} location
 */
export function isPrimaryLocation(location) {
  const kind = location?.kind;
  return kind !== "pickup" && kind !== "market_stand";
}

/**
 * @typedef {{ left: number, right: number, top: number, bottom: number }} Box
 */

/** @param {Box} a @param {Box} b @param {number} [gap] */
export function boxesOverlap(a, b, gap = 0) {
  return a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap;
}

/**
 * Greedy placement: walk the labels in priority order and keep each one that
 * touches neither an already-kept label nor any pin. Returns the indices of
 * the labels to HIDE.
 * @param {Box[]} labels  in priority order
 * @param {Box[]} obstacles  every pin / cluster on screen
 * @param {Box | null} [bounds]  the map's own box — a label not fully inside
 *   it is hidden (a cut-off name at the screen edge reads as a glitch)
 * @returns {Set<number>}
 */
export function labelsToHide(labels, obstacles, bounds = null) {
  const hide = new Set();
  /** @type {Box[]} */
  const kept = [];
  labels.forEach((box, i) => {
    const outside =
      !!bounds && (box.left < bounds.left || box.right > bounds.right || box.top < bounds.top || box.bottom > bounds.bottom);
    const clash =
      outside ||
      kept.some((k) => boxesOverlap(box, k, LABEL_GAP)) || obstacles.some((o) => boxesOverlap(box, o));
    if (clash) hide.add(i);
    else kept.push(box);
  });
  return hide;
}

/**
 * Bind the name label to a business pin. Permanent tooltip; the container
 * class decides from which zoom it is visible.
 * The name goes in as an ELEMENT with textContent, never as a string — Leaflet
 * writes string content with innerHTML, and a business name is user input.
 * The tooltip is born hidden, so a pin added on a pan never flashes an
 * overlapping name for a frame before the placement pass.
 * @param {any} marker  a Leaflet marker
 * @param {string} name
 * @param {string | number} producerId
 */
export function bindPinLabel(marker, name, producerId) {
  const content = document.createElement("span");
  content.textContent = name;
  content.setAttribute(PRODUCER_ID_ATTR, String(producerId));
  // direction "left": in Hebrew the name then STARTS beside the pin.
  marker.bindTooltip(content, {
    permanent: true,
    direction: "left",
    offset: [-LABEL_OFFSET_PX + 6, 0], // Leaflet adds its own 6px for "left"
    className: `${PIN_LABEL_CLASS} ${PIN_LABEL_HIDDEN_CLASS}`,
    interactive: false,
    opacity: 1,
  });
}

/** @param {Element} el */
const visibleBox = (el) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? r : null;
};

/**
 * The part of the map a label may use: the container, cut at the top edge of
 * the phone's bottom sheet when that sheet covers it.
 * @param {HTMLElement} container
 * @returns {Box}
 */
function usableBounds(container) {
  const c = container.getBoundingClientRect();
  const sheet = document.querySelector(SHEET_SELECTOR);
  const s = sheet ? visibleBox(sheet) : null;
  const bottom = s && s.top > c.top && s.top < c.bottom ? s.top : c.bottom;
  return { left: c.left, right: c.right, top: c.top, bottom };
}

/**
 * Keep labels in step with the view. Returns `{ refresh, remove }`.
 * @param {any} map  a Leaflet map
 * @param {() => (string | number | null | undefined)} [getFocusedId]  the
 *   selected business — its label is placed first, so it always shows
 */
export function installPinLabels(map, getFocusedId = () => null) {
  let frame = 0;
  const run = () => {
    frame = 0;
    const container = map.getContainer?.();
    if (!container) return;
    const on = map.getZoom() >= PIN_LABEL_MIN_ZOOM;
    container.classList.toggle(LABELS_ON_CLASS, on);
    if (!on) return;
    /** @type {HTMLElement[]} */
    const labels = [...container.querySelectorAll(`.${PIN_LABEL_CLASS}`)];
    labels.forEach((el) => el.classList.remove(PIN_LABEL_HIDDEN_CLASS));
    const focused = getFocusedId();
    const isFocused = (/** @type {HTMLElement} */ el) =>
      focused != null && el.querySelector(`[${PRODUCER_ID_ATTR}]`)?.getAttribute(PRODUCER_ID_ATTR) === String(focused);
    const ordered = [...labels].sort((a, b) => Number(isFocused(b)) - Number(isFocused(a)));
    const obstacles = [
      ...container.querySelectorAll(OBSTACLE_SELECTOR),
      ...document.querySelectorAll(OVERLAY_SELECTOR),
    ]
      .map(visibleBox)
      .filter((r) => r !== null);
    const hide = labelsToHide(
      ordered.map((el) => el.getBoundingClientRect()),
      /** @type {Box[]} */ (obstacles),
      usableBounds(container),
    );
    ordered.forEach((el, i) => {
      if (hide.has(i)) el.classList.add(PIN_LABEL_HIDDEN_CLASS);
    });
  };
  const refresh = () => {
    if (frame || typeof requestAnimationFrame === "undefined") return;
    frame = requestAnimationFrame(run);
  };
  map.on("zoomend moveend layeradd", refresh);
  refresh();
  return {
    refresh,
    remove: () => {
      map.off("zoomend moveend layeradd", refresh);
      if (frame && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
