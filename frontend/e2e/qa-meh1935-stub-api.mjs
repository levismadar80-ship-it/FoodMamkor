/**
 * Minimal stand-in for GET /producers, for MEH-1935 self-QA only.
 *
 * The CC sandbox cannot reach *.up.railway.app (documented egress block), and
 * the Vercel preview is SSO-protected, so neither the real backend nor the
 * preview is drivable from here. This serves just enough of the listing
 * contract — a JSON array plus the X-Total-Count header the diet-page gate
 * reads — to render the page under a real browser.
 *
 * NOT a fixture for the e2e suite and NOT wired into CI. Throwaway QA scaffolding.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.STUB_PORT || 8899);

const NAMES = [
  ["רוח השדה", "ruach-hasadeh", "כרמיאל"],
  ["לחם וזמן", "lehem-vezman", "תל אביב"],
  ["מחלבת עמק האלה", "machlevet-emek-haela", "בית שמש"],
  ["כוורת אייל", "kaveret-ayal", "רמת ישי"],
  ["הגינה של רותם", "hagina-rotem", "פרדס חנה"],
  ["כבושים של סבתא מרים", "kvushim-savta-miriam", "חיפה"],
  ["סבון עז נעמה", "sabon-ez-naama", "צפת"],
];

const producers = NAMES.map(([name, slug, city], i) => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  name,
  slug,
  city,
  description: `בית עסק מקומי מ${city} — תיאור לצורכי QA בלבד.`,
  categories: [{ id: i + 1, name: "מאפים" }],
  images: [],
  status: "approved",
  verified: i % 2 === 0,
  has_delivery: i % 3 === 0,
  avg_rating: null,
  review_count: 0,
}));

// Which filters the stub "implements" — mirrors the real backend today.
const SUPPORTED = new Set(["vegan", "vegetarian", "gluten_free", "lactose_free"]);

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (!url.pathname.startsWith("/producers")) {
    res.writeHead(404, { "content-type": "application/json" });
    return res.end("[]");
  }

  // Every supported diet filter returns the full set (7 ≥ DIET_PAGE_MIN of 5).
  // An UNSUPPORTED param is ignored, exactly as FastAPI ignores an unknown
  // query param — which is the behaviour the `backed` flag exists to defend
  // against, so the stub must reproduce it rather than 400.
  const limit = Number(url.searchParams.get("limit") || 100);
  const rows = producers.slice(0, limit);
  res.writeHead(200, {
    "content-type": "application/json",
    "x-total-count": String(producers.length),
    "access-control-allow-origin": "*",
  });
  res.end(JSON.stringify(rows));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`stub api on http://127.0.0.1:${PORT} (supported: ${[...SUPPORTED].join(",")})`);
});
