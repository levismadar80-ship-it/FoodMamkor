/**
 * MEH-2173 — minimal mock backend for the homepage promoted-chips self-QA.
 *
 * The homepage first paint is SERVER-rendered (app/[locale]/page.js:42 →
 * serverFetch(`${API_URL}/producers`)), so a browser-side page.route() cannot
 * intercept it — the cards would be missing and every meta-row measurement
 * would be taken against an empty grid. Pointing NEXT_PUBLIC_API_URL at this
 * server covers BOTH paths at once: the SSR fetch (lib/env.js API_URL) and the
 * client fetches, which go to `/api/*` and are proxied here by
 * next.config.js:168's rewrite target.
 *
 * It FILTERS for real rather than echoing a fixed list. That is the point: the
 * harness asserts that toggling a chip changes the rendered result set, and a
 * mock that ignores its query params would report success for a build in which
 * the filter state never reached the API.
 */
import { createServer } from "node:http";

// A CLI flag, not an env var — see the note in qa-meh2173-promoted-filters.mjs:
// check_env_drift.sh blocks undocumented `process.env` reads, and widening its
// exclude list would remove coverage rather than add it (workflow rule 32).
const portFlag = process.argv.slice(2).find((a) => a.startsWith("--port="));
const PORT = Number(portFlag ? portFlag.slice(7) : 8799);

// `emoji` is a STRING, never null. ProducerListSchema declares
// categories[].emoji as a required string, and the client parse is
// all-or-nothing (`safeParse` → `[]` on any issue, use-home-page.js:402), so a
// null here silently emptied the grid on every CLIENT fetch while the SSR path
// — which only checks Array.isArray — still painted 12 cards. That is exactly
// the two-causes green this harness's C3 control exists to catch, and it did.
const CATEGORIES = [
  { id: 1, name: "מאפים", emoji: "" },
  { id: 2, name: "ירקות ופירות", emoji: "" },
];

/**
 * Twelve businesses, so `producers.length` (12) > PAGE_SIZE (8) and the grid
 * renders its "load more" state exactly as production does.
 *
 * The attribute spread is deliberate, not decorative:
 *   verified   → 6   (a promoted axis that must narrow the set visibly)
 *   delivers   → 7   (the other promoted axis)
 *   vegan      → 5   (a NON-promoted axis — the tag-row case under test)
 * `has_no_added_sugar_products` is left FALSE on every row so the MEH-1934
 * runtime gate (DIET_CHIP_MIN = 5) keeps `no_added_sugar` out of the sheet —
 * the harness asserts the gate still governs the sheet, not just the old row.
 */
const BASE = Array.from({ length: 12 }, (_, i) => {
  const n = i + 1;
  return {
    id: 9100 + n,
    name: `עסק בדיקה ${n}`,
    slug: `qa-meh2173-${n}`,
    city: "תל אביב",
    description: "בדיקת MEH-2173",
    short_description: "בדיקת MEH-2173",
    categories: [CATEGORIES[i % 2]],
    images: [],
    verification_tier: n <= 6 ? "verified" : "declared",
    is_verified: n <= 6,
    favorites_count: 0,
    delivers: n <= 7,
    has_delivery: n <= 7,
    offers_pickup: false,
    delivery_count: n <= 7 ? 3 : 0,
    rating: null,
    rating_count: 0,
    is_recommended: false,
    has_vegan_products: n <= 5,
    has_vegetarian_products: false,
    has_gluten_free_products: false,
    has_lactose_free_products: false,
    has_no_added_sugar_products: false,
    order_window: null,
    kosher: false,
    kosher_verified_at: null,
    grass_fed: false,
  };
});

// key → the predicate the real backend applies. Kept beside the fixtures so a
// reader can see what "filtered" means here without cross-referencing.
const PREDICATE = {
  verified: (p) => p.is_verified,
  has_delivery: (p) => p.has_delivery,
  delivery: (p) => p.has_delivery, // home's own short param name
  vegan: (p) => p.has_vegan_products,
  vegetarian: (p) => p.has_vegetarian_products,
  gluten_free: (p) => p.has_gluten_free_products,
  lactose_free: (p) => p.has_lactose_free_products,
  no_added_sugar: (p) => p.has_no_added_sugar_products,
  kosher: (p) => p.kosher,
  pickup_points: (p) => p.offers_pickup,
};

const TRUTHY = new Set(["1", "true", "True"]);

function filterProducers(params) {
  let rows = BASE;
  for (const [key, predicate] of Object.entries(PREDICATE)) {
    const raw = params.get(key);
    if (raw !== null && TRUTHY.has(raw)) rows = rows.filter(predicate);
  }
  return rows;
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const send = (body, status = 200) => {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    });
    res.end(JSON.stringify(body));
  };

  if (url.pathname === "/categories") return send(CATEGORIES);
  if (url.pathname === "/stats") {
    return send({ producers: BASE.length, categories: CATEGORIES.length });
  }
  if (url.pathname === "/producers/random") return send(BASE[0]);
  if (url.pathname === "/producers") return send(filterProducers(url.searchParams));
  if (url.pathname.startsWith("/producers/")) return send(BASE[0]);
  if (url.pathname === "/health") return send({ status: "ok" });
  return send([], 200);
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`qa-mock listening on ${PORT}\n`);
});
