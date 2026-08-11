/**
 * MEH-1998 — the category colour reaches the marker's `onerror` handler as JS
 * source, so it is validated (not escaped) before interpolation.
 *
 * WHY A VALIDATOR AND NOT AN ESCAPE — the thing this file actually guards.
 * The colour lands in a nested context: an HTML attribute whose decoded value
 * is then parsed as JavaScript. The browser resolves character references
 * BEFORE the JS parser runs, so `&#39;` becomes a bare `'` and terminates the
 * string literal exactly as an unescaped quote does. HTML-attribute escaping
 * is therefore INERT here — measured, not reasoned: running the payload below
 * through `escapeHtmlAttr` yields a handler byte-identical to the unescaped
 * one. That is why the assertion is written against the PARSED handler source
 * rather than against the presence of an escape call: a test that asserted
 * "the colour was escaped" would pass on a fix that changes nothing
 * (ADR-032 §3.6 — assert behaviour, never that the prescribed edit was made).
 *
 * Leaflet is stubbed per repo convention (MapMarkerFanOut.test.jsx,
 * MapGeolocationPersist.test.jsx): real Leaflet never mounts under jsdom.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import MapComponent from "@/components/MapComponent";

vi.mock("next-intl", () => ({
  useTranslations: () => (k) => k,
}));

// The hostile value. `#fff` keeps it colour-shaped so nothing rejects it for
// being obviously junk; the quote is the whole attack.
const PAYLOAD = "#fff';alert(1);'";
// Flipped per-test so one stub can serve both the attack and the control.
const style = vi.hoisted(() => ({ color: "#fff" }));

vi.mock("@/lib/category-registry", () => ({
  styleForProducer: () => ({ color: style.color, icon: () => null }),
}));
vi.mock("@/lib/marker-glyph", () => ({ categoryGlyphSvg: () => "<svg></svg>" }));

const recorder = vi.hoisted(() => ({ icons: [] }));

vi.mock("leaflet", () => {
  const makeStub = () => {
    const base = {
      whenReady: (fn) => {
        if (fn) fn();
        return proxy;
      },
      getBounds: () => ({
        getNorth: () => 0,
        getSouth: () => 0,
        getEast: () => 0,
        getWest: () => 0,
      }),
      getContainer: () => document.createElement("div"),
    };
    const proxy = new Proxy(base, {
      get(target, prop) {
        if (prop in target) return target[prop];
        return () => proxy;
      },
    });
    return proxy;
  };
  return {
    default: {
      map: () => makeStub(),
      tileLayer: () => makeStub(),
      markerClusterGroup: () => makeStub(),
      marker: (latlng, opts = {}) => {
        recorder.icons.push(opts.icon);
        const m = {
          latlng,
          on: () => m,
          setIcon: (icon) => {
            recorder.icons.push(icon);
            return m;
          },
          getLatLng: () => ({ lat: latlng[0], lng: latlng[1] }),
          getElement: () => null,
        };
        return m;
      },
      circleMarker: () => makeStub(),
      divIcon: (o) => ({ __divIcon: o }),
    },
  };
});
vi.mock("leaflet-defaulticon-compatibility", () => ({}));
vi.mock("leaflet.markercluster", () => ({}));

// images[0] is what selects the <img onerror=...> branch over the glyph div.
const producer = {
  id: "p-1",
  name: "עסק בדיקה",
  lat: 32.0853,
  lng: 34.7818,
  images: ["https://res.cloudinary.com/demo/image/upload/v1/x.jpg"],
  categories: [{ name: "בשר" }],
};

/**
 * The handler as the BROWSER sees it: character references already resolved.
 * Reading the raw markup instead would miss the entire defect — `&#39;` looks
 * escaped in the string and is a live quote by the time JS runs.
 */
function parsedOnErrorHandlers() {
  return recorder.icons
    .filter(Boolean)
    .flatMap((icon) => {
      const doc = new DOMParser().parseFromString(icon.__divIcon?.html ?? "", "text/html");
      return [...doc.querySelectorAll("[onerror]")].map((el) => el.getAttribute("onerror"));
    });
}

describe("MEH-1998 — marker colour cannot break out of the onerror JS string", () => {
  beforeEach(() => {
    recorder.icons.length = 0;
    style.color = "#fff";
  });

  it("neutralises a colour carrying a quote — no statement escapes the string literal", () => {
    style.color = PAYLOAD;
    render(<MapComponent producers={[producer]} />);

    const handlers = parsedOnErrorHandlers();
    // Guard the guard: an empty list would satisfy every assertion below.
    expect(handlers.length).toBeGreaterThan(0);

    for (const src of handlers) {
      // The payload's statement must not survive anywhere in the JS source.
      expect(src).not.toContain("alert(1)");
      // …and every quoted value in the handler is still a plain hex colour,
      // which is what "the string literal was never closed" looks like.
      for (const [, quoted] of src.matchAll(/'([^']*)'/g)) {
        expect(quoted).toMatch(/^(none|#[0-9a-fA-F]{3,8})$/);
      }
    }
  });

  // Every colour the real palette can produce, not a representative one. The
  // validator's whole risk is rejecting a value it should have passed, and a
  // single-colour control cannot see that — it would stay green while eight
  // of the nine pins silently fell back to the primary token.
  // Mirrors category-registry.js CATEGORY_STYLES + DEFAULT_CATEGORY_STYLE.
  const REAL_PALETTE = [
    "#c04040", // בשר · דגים
    "#2e6853", // ירקות, פירות ומשקים · DEFAULT_CATEGORY_STYLE
    "#4a90d9", // חלב וגבינות
    "#896714", // לחמים ואפייה
    "#e8a020", // שמנים
    "#C8821E", // דבש — note the uppercase hex, which the regex must accept
    "#9b59b6", // טיפוח וסבונים
    "#3b72ad", // חלב וגבינות textColor
    "#A8681A", // דבש textColor
  ];

  it.each(REAL_PALETTE)(
    "leaves the legitimate palette colour %s byte-identical (no behaviour change)",
    (colour) => {
      style.color = colour;
      render(<MapComponent producers={[producer]} />);

      const handlers = parsedOnErrorHandlers();
      expect(handlers.length).toBeGreaterThan(0);
      for (const src of handlers) {
        expect(src).toContain(`background='${colour}'`);
      }
    },
  );
});
