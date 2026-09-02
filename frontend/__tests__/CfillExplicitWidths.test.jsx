/**
 * MEH-2010 — every c_fill call site carries an explicit width.
 *
 * MEH-2001 capped the c_limit path with DEFAULT_MAX_WIDTH. The aspectRatio
 * path was deliberately left out, and `lib/cloudinary.js:58-66` says why:
 * with `aspectRatio` the `w_` rides `c_fill`, and c_fill + w_1200 UPSCALES an
 * original narrower than 1200 — measured at +68% bytes for zero extra detail
 * on a 768px source. So the cap for those call sites cannot come from the
 * helper; it has to come from each call site, sized to what that surface
 * actually renders.
 *
 * This file asserts the EMITTED URL at each of the three sites, not that the
 * prescribed edit was made (ADR-032 §3.6). Each one renders the real
 * component and reads the `src` the component produced.
 *
 * The last test is the one that keeps this closed: a source-level sweep
 * asserting there are ZERO remaining `optimizeCloudinary` calls with an
 * `aspectRatio` and no `width`. A per-site test cannot see a NEW uncapped
 * site; that one can.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

import ProducerCard from "@/components/ProducerCard";
import RecipeCard from "@/components/public/RecipeCard";
import MapComponent from "@/components/MapComponent";

const CLOUDINARY = "https://res.cloudinary.com/demo/image/upload/v1/hero.jpg";

// The widths this ticket derived. Each is justified in a comment at its call
// site; asserted here so a silent change to any of them fails loudly.
const EXPECTED = {
  producerCard: 828,
  recipeCard: 750,
  mapMarker: 72,
};

vi.mock("next-intl", () => ({
  useTranslations: () => (k) => k,
  useLocale: () => "he",
}));

vi.mock("next/image", () => ({
  default: ({ alt, src }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} data-testid="cloudinary-img" />
  ),
}));

// ProducerCard pulls in BadgeRow, which imports next-intl's locale-aware
// wrapper. Mocking the wrapper directly (BottomNav.test.jsx / BadgeRow.test.jsx
// convention) keeps next-intl's ESM navigation stack out of jsdom entirely.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock("@/lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/post-login-action", () => ({ enqueueFavoriteOnLogin: vi.fn() }));
vi.mock("@/lib/favorites-cache", () => ({
  ensureFavoritesLoaded: () => Promise.resolve(new Set()),
  isFavorited: () => false,
  setFavoritedLocal: vi.fn(),
  subscribeFavorites: () => () => {},
}));

vi.mock("@/components/BusinessCtaLink", () => ({ default: () => null }));
vi.mock("@/components/FadeInSection", () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock("@/hooks/useScrollAffordance", () => ({
  default: () => ({ scrollRef: { current: null }, canScrollStart: false, canScrollEnd: false }),
  ScrollArrows: () => null,
}));
vi.mock("@/hooks/useUserLocation", () => ({ useUserLocation: () => null, default: () => null }));

// ── Leaflet stub, per repo convention (MapMarkerColorEscape.test.jsx) ────────
vi.mock("@/lib/category-registry", () => ({
  styleForProducer: () => ({ color: "#2e6853", icon: () => null }),
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

const producer = {
  id: "p-1",
  name: "עסק בדיקה",
  slug: "test-business",
  lat: 32.0853,
  lng: 34.7818,
  // MEH-1938 chunk 5a: the pin comes from the row; the columns above pin nothing.
  locations: [{ kind: "branch", is_primary: true, lat: 32.0853, lng: 34.7818, precision: "exact" }],
  images: [CLOUDINARY],
  categories: [{ name: "בשר" }],
};

function srcOfRenderedImage() {
  return screen.getByTestId("cloudinary-img").getAttribute("src");
}

describe("MEH-2010 — the c_fill call sites deliver an explicitly-sized image", () => {
  beforeEach(() => {
    recorder.icons.length = 0;
  });

  it(`ProducerCard emits w_${EXPECTED.producerCard} on the c_fill URL`, () => {
    render(<ProducerCard producer={producer} />);
    const src = srcOfRenderedImage();

    expect(src).toContain("c_fill");
    expect(src).toContain(`w_${EXPECTED.producerCard}`);
    // The ratio is load-bearing (MEH-1229) and must survive the width.
    expect(src).toContain("ar_4:3");
    expect(src).toContain("g_auto");
    // c_limit must NOT appear — that would mean the crop silently changed.
    expect(src).not.toContain("c_limit");
  });

  it(`RecipeCard emits w_${EXPECTED.recipeCard} on the c_fill URL`, () => {
    render(<RecipeCard slug="test-business" recipe={{ id: 1, title: "מתכון", image_url: CLOUDINARY }} />);
    const src = srcOfRenderedImage();

    expect(src).toContain("c_fill");
    expect(src).toContain(`w_${EXPECTED.recipeCard}`);
    expect(src).toContain("ar_4:3");
    expect(src).toContain("g_auto");
    expect(src).not.toContain("c_limit");
  });

  it(`the map marker emits w_${EXPECTED.mapMarker} on the c_fill URL`, () => {
    render(<MapComponent producers={[producer]} />);

    const markerSrcs = recorder.icons
      .filter(Boolean)
      .flatMap((icon) => {
        const doc = new DOMParser().parseFromString(icon.__divIcon?.html ?? "", "text/html");
        return [...doc.querySelectorAll("img[src]")].map((el) => el.getAttribute("src"));
      })
      .filter((src) => src.includes("res.cloudinary.com"));

    // Guard the guard: an empty list satisfies every `for` assertion below,
    // and an empty list is exactly what a broken Leaflet stub produces.
    expect(markerSrcs.length).toBeGreaterThan(0);

    for (const src of markerSrcs) {
      expect(src).toContain("c_fill");
      expect(src).toContain(`w_${EXPECTED.mapMarker}`);
      expect(src).toContain("ar_1:1");
      expect(src).not.toContain("c_limit");
    }
  });

  // ── the absence assertion ──────────────────────────────────────────────────
  //
  // The three tests above prove the three known sites are capped. They say
  // nothing about a FOURTH site added tomorrow, which is the way this
  // regresses. This sweep is what actually holds the invariant closed.
  it("no optimizeCloudinary call anywhere passes aspectRatio without a width", () => {
    const root = path.resolve(__dirname, "..");
    const SKIP = new Set(["node_modules", ".next", "__tests__", "e2e", "coverage", ".git"]);

    const files = [];
    (function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (!SKIP.has(entry.name)) walk(path.join(dir, entry.name));
        } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
          files.push(path.join(dir, entry.name));
        }
      }
    })(root);

    // Control: the sweep must actually have found the source tree. A zero-file
    // walk would report "no offenders" — the reassuring answer — while having
    // inspected nothing at all.
    expect(files.length).toBeGreaterThan(100);

    const offenders = [];
    let inspected = 0;

    for (const file of files) {
      if (file.endsWith(path.join("lib", "cloudinary.js"))) continue;
      const src = fs.readFileSync(file, "utf8");
      let from = 0;
      for (;;) {
        const at = src.indexOf("optimizeCloudinary(", from);
        if (at === -1) break;
        from = at + 1;
        // Balance parentheses from the call's opening paren.
        let depth = 0;
        let i = at + "optimizeCloudinary".length;
        for (; i < src.length; i += 1) {
          if (src[i] === "(") depth += 1;
          else if (src[i] === ")") {
            depth -= 1;
            if (depth === 0) break;
          }
        }
        const call = src.slice(at, i + 1);
        if (!call.includes("aspectRatio")) continue;
        inspected += 1;
        if (!/\bwidth\s*:/.test(call)) {
          offenders.push(`${path.relative(root, file)} :: ${call.replace(/\s+/g, " ").slice(0, 100)}`);
        }
      }
    }

    // Second control, and the one that discriminates: if the parser stopped
    // matching the repo's call shape it would inspect zero calls and report
    // zero offenders — identical output to a clean sweep.
    expect(
      inspected,
      "the sweep found no aspectRatio call sites at all — the parser is broken, " +
        "and its empty offender list below means nothing",
    ).toBeGreaterThanOrEqual(3);

    expect(offenders, `uncapped c_fill call site(s):\n${offenders.join("\n")}`).toEqual([]);
  });
});
