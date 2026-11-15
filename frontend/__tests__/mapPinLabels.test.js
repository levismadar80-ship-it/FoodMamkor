/**
 * MEH-3066: the business name beside its pin. The placement rule is a pure
 * function (labelsToHide) — priority order wins, a label touching a kept
 * label or ANY pin is hidden. Only a business's own location carries a name.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import L from "leaflet";

import {
  boxesOverlap,
  labelsToHide,
  isPrimaryLocation,
  bindPinLabel,
  installPinLabels,
  PIN_LABEL_CLASS,
  PIN_LABEL_HIDDEN_CLASS,
  PIN_LABEL_MIN_ZOOM,
  LABELS_ON_CLASS,
} from "@/lib/map-pin-labels";

const box = (left, top, w = 80, h = 18) => ({ left, top, right: left + w, bottom: top + h });

describe("map-pin-labels — placement (MEH-3066)", () => {
  it("0 labels: nothing to hide", () => {
    expect(labelsToHide([], [box(0, 0, 36, 36)]).size).toBe(0);
  });

  it("1 label clear of every pin: shown", () => {
    expect([...labelsToHide([box(100, 100)], [box(0, 0, 36, 36)])]).toEqual([]);
  });

  it("many: two overlapping labels → the first (higher priority) stays, the second hides", () => {
    const hide = labelsToHide([box(100, 100), box(150, 105), box(400, 400)], []);
    expect([...hide]).toEqual([1]);
  });

  it("a label over another business's pin is hidden", () => {
    const hide = labelsToHide([box(100, 100)], [box(120, 95, 36, 36)]);
    expect([...hide]).toEqual([0]);
  });

  it("a hidden label does not block the ones after it", () => {
    // 0 hits a pin and hides; 1 overlaps 0 only — so it must still show.
    const hide = labelsToHide([box(100, 100), box(150, 100)], [box(110, 95, 36, 36)]);
    expect([...hide]).toEqual([0]);
  });

  it("a label not fully inside the map's box is hidden (no name cut off at the edge)", () => {
    const map = { left: 0, top: 0, right: 390, bottom: 600 };
    const hide = labelsToHide([box(-30, 100), box(100, 100), box(350, 300)], [], map);
    expect([...hide]).toEqual([0, 2]);
    // Without bounds the same boxes all show — the bounds are what hide them.
    expect(labelsToHide([box(-30, 100), box(100, 100), box(350, 300)], []).size).toBe(0);
  });

  it("touching edges count as a collision only within the 2px gap", () => {
    expect(boxesOverlap(box(0, 0), box(81, 0), 2)).toBe(true);
    expect(boxesOverlap(box(0, 0), box(83, 0), 2)).toBe(false);
  });
});

describe("map-pin-labels — which pins carry a name (MEH-3066)", () => {
  it("branch / no kind → yes; pickup and market stand → no", () => {
    expect(isPrimaryLocation({ kind: "branch" })).toBe(true);
    expect(isPrimaryLocation({})).toBe(true);
    expect(isPrimaryLocation(null)).toBe(true);
    expect(isPrimaryLocation({ kind: "pickup" })).toBe(false);
    expect(isPrimaryLocation({ kind: "market_stand" })).toBe(false);
  });

  it("bindPinLabel binds a permanent, non-interactive tooltip, born hidden", () => {
    const marker = L.marker([32.1, 34.8]);
    const spy = vi.spyOn(marker, "bindTooltip");
    bindPinLabel(marker, "משק ברק", 7);
    expect(spy).toHaveBeenCalledTimes(1);
    const [, opts] = spy.mock.calls[0];
    expect(opts).toMatchObject({ permanent: true, interactive: false, direction: "left" });
    expect(opts.className.split(" ")).toEqual([PIN_LABEL_CLASS, PIN_LABEL_HIDDEN_CLASS]);
  });

  it("a name with markup is shown as text, never parsed as HTML", () => {
    const marker = L.marker([32.1, 34.8]);
    const spy = vi.spyOn(marker, "bindTooltip");
    const name = '<img src=x onerror="alert(1)">גבינות & יין';
    bindPinLabel(marker, name, 7);
    const [content] = spy.mock.calls[0];
    expect(content).toBeInstanceOf(HTMLElement);
    expect(content.textContent).toBe(name);
    expect(content.querySelector("img")).toBeNull();
    expect(content.getAttribute("data-producer-id")).toBe("7");
  });
});

describe("map-pin-labels — installPinLabels on a live container (MEH-3066)", () => {
  // A stand-in map: the container holds two labels; jsdom boxes are all 0×0 at
  // the origin, so the two labels collide and only the first placed one shows.
  const makeMap = (zoom) => {
    const container = document.createElement("div");
    for (const id of ["1", "2"]) {
      const tip = document.createElement("div");
      tip.className = `${PIN_LABEL_CLASS} ${PIN_LABEL_HIDDEN_CLASS}`;
      const span = document.createElement("span");
      span.setAttribute("data-producer-id", id);
      span.textContent = `עסק ${id}`;
      tip.appendChild(span);
      container.appendChild(tip);
    }
    document.body.appendChild(container);
    const handlers = new Map();
    return {
      container,
      handlers,
      getContainer: () => container,
      getZoom: () => zoom,
      on: (ev, fn) => handlers.set(ev, fn),
      off: (ev, fn) => handlers.get(ev) === fn && handlers.delete(ev),
    };
  };
  let frames;
  beforeEach(() => {
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (cb) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });
  const flush = () => frames.splice(0).forEach((cb) => cb());
  const shown = (map) =>
    [...map.container.querySelectorAll(`.${PIN_LABEL_CLASS}`)]
      .filter((el) => !el.classList.contains(PIN_LABEL_HIDDEN_CLASS))
      .map((el) => el.textContent);

  it("below the min zoom: no labels-on class, every label stays hidden", () => {
    const map = makeMap(PIN_LABEL_MIN_ZOOM - 1);
    installPinLabels(map);
    flush();
    expect(map.container.classList.contains(LABELS_ON_CLASS)).toBe(false);
    expect(shown(map)).toEqual([]);
  });

  it("at the min zoom: labels on; of two colliding labels the first shows", () => {
    const map = makeMap(PIN_LABEL_MIN_ZOOM);
    installPinLabels(map);
    flush();
    expect(map.container.classList.contains(LABELS_ON_CLASS)).toBe(true);
    expect(shown(map)).toEqual(["עסק 1"]);
  });

  it("the selected business (by id) is placed first and wins the collision", () => {
    const map = makeMap(PIN_LABEL_MIN_ZOOM);
    installPinLabels(map, () => 2);
    flush();
    expect(shown(map)).toEqual(["עסק 2"]);
  });

  it("remove() detaches the view listener", () => {
    const map = makeMap(PIN_LABEL_MIN_ZOOM);
    const labels = installPinLabels(map);
    expect(map.handlers.has("zoomend moveend layeradd")).toBe(true);
    labels.remove();
    expect(map.handlers.has("zoomend moveend layeradd")).toBe(false);
  });
});
