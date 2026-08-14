/**
 * MEH-1854 chunk 1 — minimal mock backend for the post-merge availability check.
 *
 * /producers is SERVER-rendered (app/[locale]/producers/page.jsx: fetchPage runs
 * on the server against API_URL), so a browser-side page.route() can never
 * intercept its feed — the first version of the harness tried that and its
 * card-count control correctly reported 0 cards. Pointing NEXT_PUBLIC_API_URL at
 * this server is the only way to reach the SSR path.
 *
 * Serves exactly the four availability shapes under test and nothing else.
 */
import { createServer } from "node:http";

const FIXTURES = [
  {
    id: 9001,
    name: "א · enum full_this_week",
    slug: "qa-enum-full",
    availability_state: "full_this_week",
    availability_status: null,
    is_available_today: null,
  },
  {
    id: 9002,
    name: "ב · legacy full — REGRESSION",
    slug: "qa-legacy-full",
    availability_state: null,
    availability_status: "full",
    is_available_today: null,
  },
  {
    id: 9003,
    name: "ג · enum available_today — REGRESSION",
    slug: "qa-enum-today",
    availability_state: "available_today",
    availability_status: null,
    is_available_today: false,
  },
  {
    id: 9004,
    name: "ד · legacy is_available_today",
    slug: "qa-legacy-today",
    availability_state: null,
    availability_status: null,
    is_available_today: true,
  },
].map((f) => ({
  ...f,
  city: "תל אביב",
  description: "בדיקת זמינות MEH-1854",
  short_description: "בדיקת זמינות MEH-1854",
  categories: [{ id: 1, name: "מאפים" }],
  images: [],
  verification_tier: "declared",
  favorites_count: 0,
  delivers: false,
  offers_pickup: false,
  has_delivery: false,
  delivery_count: 0,
  rating: null,
  reviews_count: 0,
}));

// Hardcoded, not read from the environment. `scripts/check_env_drift.sh` scans
// this file too, so an env read here is a genuinely new variable with no
// `.env.example` entry, and it reds the required Env drift gate (measured on
// this PR's first run). A one-off probe does not need to be configurable, and
// documenting a harness knob in the app's env contract would be the wrong fix.
//
// The scanner matches the read pattern anywhere in the file, comments included
// — naming the removed variable in this note was itself enough to keep the gate
// red on the second run. Do not spell it out here.
const PORT = 4010;

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (url.pathname === "/producers/count") {
    return res.end(JSON.stringify({ count: FIXTURES.length }));
  }
  if (url.pathname === "/producers") {
    res.setHeader("x-total-count", String(FIXTURES.length));
    return res.end(JSON.stringify(FIXTURES));
  }
  if (url.pathname === "/categories") {
    return res.end(JSON.stringify([{ id: 1, name: "מאפים", slug: "bakery" }]));
  }
  res.statusCode = 200;
  return res.end(JSON.stringify([]));
}).listen(PORT, () => {
  console.log(`mock api on ${PORT} — ${FIXTURES.length} fixtures`);
});
