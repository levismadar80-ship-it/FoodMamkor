/**
 * MEH-2850 option C (Sapir 09/11): the homepage mini-map (Leaflet + tiles) is
 * fetched only when the visitor scrolls near it. Until then the skeleton holds
 * the same box (data-testid="home-minimap", no wrapper element — the home specs
 * read it as the businesses grid's next block).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));
// The dynamic() import is what pulls Leaflet; a marker stands in for the map.
const importCalls = vi.hoisted(() => ({ n: 0 }));
vi.mock("next/dynamic", () => ({
  default: () => {
    importCalls.n += 1;
    return function LoadedMap() {
      return <div data-testid="minimap-loaded" />;
    };
  },
}));

let observers = [];
class FakeIO {
  constructor(cb, opts) {
    this.cb = cb;
    this.opts = opts;
    this.observed = [];
    this.disconnected = false;
    observers.push(this);
  }
  observe(el) { this.observed.push(el); }
  disconnect() { this.disconnected = true; }
  fire(isIntersecting) { this.cb([{ isIntersecting, target: this.observed[0] }]); }
}

beforeEach(() => {
  observers = [];
  window.IntersectionObserver = FakeIO;
});
afterEach(() => {
  delete window.IntersectionObserver;
});

describe("homepage mini-map loads only near the viewport (MEH-2850 C)", () => {
  it("first paint: the skeleton box, no map, one observer on the skeleton itself", async () => {
    const { default: Lazy, MINIMAP_PRELOAD_MARGIN } = await import("@/components/HomepageMiniMapLazy");
    render(<Lazy />);
    const box = screen.getByTestId("home-minimap");
    expect(box.tagName).toBe("SECTION");
    expect(screen.queryByTestId("minimap-loaded")).toBeNull();
    expect(observers).toHaveLength(1);
    expect(observers[0].observed[0], "observes the skeleton's own section, no wrapper").toBe(box);
    expect(observers[0].opts.rootMargin).toBe(MINIMAP_PRELOAD_MARGIN);
  });

  it("not yet near: stays a skeleton", async () => {
    const { default: Lazy } = await import("@/components/HomepageMiniMapLazy");
    render(<Lazy />);
    act(() => observers[0].fire(false));
    expect(screen.queryByTestId("minimap-loaded")).toBeNull();
  });

  it("near the viewport: renders the map and stops observing", async () => {
    const { default: Lazy } = await import("@/components/HomepageMiniMapLazy");
    render(<Lazy />);
    act(() => observers[0].fire(true));
    expect(screen.getByTestId("minimap-loaded")).toBeTruthy();
    expect(observers[0].disconnected).toBe(true);
  });

  it("no IntersectionObserver (old browser): loads at once, as before", async () => {
    delete window.IntersectionObserver;
    const { default: Lazy } = await import("@/components/HomepageMiniMapLazy");
    render(<Lazy />);
    expect(screen.getByTestId("minimap-loaded")).toBeTruthy();
  });

  it("the home page renders the gated component, not the map directly", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../app/[locale]/home/HomeClient.jsx"), "utf8");
    expect(src).toMatch(/<HomepageMiniMapLazy \/>/);
    expect(src).not.toMatch(/import\("@\/components\/HomepageMiniMap"\)/);
  });
});
