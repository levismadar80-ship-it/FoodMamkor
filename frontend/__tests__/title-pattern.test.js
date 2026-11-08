/**
 * MEH-2853 — one search-result title pattern: «{page title} | מהמקור»
 * (en «{page title} | Mehamakor»), and the brand comes from ONE place — the
 * layout template `%s | <brand>` (app/[locale]/layout.js) — never typed into a
 * string, never twice, never after «—» / «-» / «·». Home keeps its own title.
 *
 * How the title is "rendered": each page's real generateMetadata runs against
 * the REAL messages (next-intl's createTranslator), and the result goes
 * through the same rule Next.js applies — a string title is put into the
 * layout's template, `{ absolute }` is used as is. The template is read from
 * the real layout, not restated here, so a template change is seen too.
 *
 * Routes: every entry in app/sitemap.js's static list (the three hubs, the
 * producers index, one diet and one region landing page), one of each dynamic
 * type (business by id and by slug, event, experience, group buy, recipe, and
 * the three entity fallbacks), plus every other page whose title this card
 * touched.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import fs from "node:fs";
import { createTranslator } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";

const MESSAGES = { he, en };
const BRAND = { he: "מהמקור", en: "Mehamakor" };

// Pages that call getTranslations("ns") without a locale read it from the
// request; the test sets it per case.
let requestLocale = "he";
function translatorFor(arg) {
  const opts = typeof arg === "string" ? { namespace: arg } : arg || {};
  const locale = opts.locale || requestLocale;
  return createTranslator({ locale, messages: MESSAGES[locale], namespace: opts.namespace });
}

vi.mock("next-intl/server", () => ({
  getTranslations: async (arg) => translatorFor(arg),
  getMessages: async () => ({}),
  setRequestLocale: () => {},
}));
vi.mock("@sentry/nextjs", () => ({ captureMessage: () => {}, captureException: () => {} }));
vi.mock("@/lib/env", async (orig) => ({
  ...(await orig()),
  SITE_URL: "https://mehamakor.co.il",
  API_URL: "https://api.example.test",
}));
class NotFoundError extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundError("NEXT_NOT_FOUND");
  },
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
  permanentRedirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
  useRouter: () => ({ push() {}, replace() {}, prefetch() {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock("@/lib/listing-supply", async (orig) => ({
  ...(await orig()),
  getHubCount: async () => 3,
}));
// The layout's own tree, and the pages' client trees: none of it is metadata.
vi.mock("../app/globals.css", () => ({}));
vi.mock("@/app/fonts", () => ({ FONT_VARIABLES: "" }));
vi.mock("../app/fonts", () => ({ FONT_VARIABLES: "" }));
for (const m of [
  "@/components/Header", "@/components/VerifyBanner", "@/components/FooterSlot", "@/components/BottomNav",
  "@/components/Toaster", "@/components/CookieBanner", "@/components/IosViewportPin",
  "@/components/SmoothScrollProvider", "@/components/CustomCursor", "@/components/ChatWidgetLazy",
  "@/components/InstallPrompt", "@/components/PrehydrationInputReplay", "@/components/ClarityScript",
  "@/components/SpeedInsightsRedacted",
]) vi.doMock(m, () => ({ default: () => null }));
vi.mock("@/app/[locale]/producer/[id]/ProducerDetail", () => ({ default: () => null }));
vi.mock("@/app/[locale]/events/[id]/EventDetailClient", () => ({ default: () => null }));
vi.mock("@/app/[locale]/group-buys/[id]/GroupBuyDetailClient", () => ({ default: () => null }));
vi.mock("@/app/[locale]/experiences/[id]/ExperienceDetailClient", () => ({ default: () => null }));
vi.mock("@/components/public/RecipeDetail", () => ({ default: () => null }));
vi.mock("@/components/ProducerCard", () => ({ default: () => null }));
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));

// --- backend fixtures -------------------------------------------------------
const PRODUCER = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "מאפיית רוח השדה",
  slug: "ruach-hasade",
  city: "כפר סבא",
  categories: [{ name: "לחמים ואפייה" }],
  status: "approved",
};
const EVENT = { id: "22222222-2222-2222-2222-222222222222", producer_id: PRODUCER.id, title: "סדנת אפייה", event_date: "2026-12-01" };
const EXPERIENCE = { id: "55555555-5555-5555-5555-555555555555", title: "קטיף בכרם", description: "בוקר בכרם" };
const GROUP_BUY = { id: "44444444-4444-4444-4444-444444444444", title: "שמן זית מהגליל" };
const RECIPE = { id: "66666666-6666-6666-6666-666666666666", title: "לחם מחמצת", description: "מתכון" };
const BREAD = { id: 7, slug: "bread", name: "לחמים ואפייה" };
const ORGANIZER = { id: "77777777-7777-7777-7777-777777777777", slug: "shuk-hacarmel", name: "שוק האיכרים בכרמל" };

const json = (body, headers = {}) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  headers: { get: (h) => headers[h.toLowerCase()] ?? null },
  json: async () => body,
});

let entityOverride = null; // the fallback cases serve an entity with no title
vi.mock("@/lib/server-fetch", () => ({
  serverFetch: async (url) => {
    const href = String(url);
    if (href.includes("/recipes/")) return json(RECIPE);
    if (href.includes("/producers/by-slug/")) return json(PRODUCER);
    if (href.includes("/categories")) return json([BREAD]);
    if (href.includes("/producers?")) return json([PRODUCER], { "x-total-count": "40" });
    if (href.includes("/producers/")) return json(PRODUCER);
    if (href.includes("/events/")) return json(entityOverride ?? EVENT);
    if (href.includes("/experiences/")) return json(entityOverride ?? EXPERIENCE);
    if (href.includes("/group-buys/")) return json(entityOverride ?? GROUP_BUY);
    if (href.includes("/organizers/")) return json(ORGANIZER);
    // Anything unrouted is a fixture gap — fail loudly rather than hand a page
    // an empty body it would render as a fallback title.
    throw new Error(`title-pattern: unrouted fetch ${href}`);
  },
}));

// --- routes -----------------------------------------------------------------
const p = (extra = {}) => (locale) => ({ params: Promise.resolve({ locale, ...extra }), searchParams: Promise.resolve({}) });
const ROUTES = [
  // app/sitemap.js static list
  ["/map", () => import("@/app/[locale]/map/page"), p()],
  ["/about", () => import("@/app/[locale]/about/page"), p()],
  ["/about/process", () => import("@/app/[locale]/about/process/page"), p()],
  ["/about/for-businesses", () => import("@/app/[locale]/about/for-businesses/page"), p()],
  ["/about/why-local", () => import("@/app/[locale]/about/why-local/page"), p()],
  ["/about/badges", () => import("@/app/[locale]/about/badges/page"), p()],
  ["/register/producer", () => import("@/app/[locale]/register/producer/page"), p()],
  ["/terms", () => import("@/app/[locale]/terms/page"), p()],
  ["/events", () => import("@/app/[locale]/events/page"), p()],
  ["/experiences", () => import("@/app/[locale]/experiences/page"), p()],
  ["/group-buys", () => import("@/app/[locale]/group-buys/page"), p()],
  ["/producers", () => import("@/app/[locale]/producers/page"), p()],
  ["/producers/diet/[dietSlug]", () => import("@/app/[locale]/producers/diet/[dietSlug]/page"), p({ dietSlug: "vegan" })],
  ["/producers/[category]/[region]", () => import("@/app/[locale]/producers/[category]/[region]/page"), p({ category: "bread", region: "haifa" })],
  // one of each dynamic type
  ["/producer/[id]", () => import("@/app/[locale]/producer/[id]/page"), p({ id: PRODUCER.id })],
  ["/[slug]", () => import("@/app/[locale]/[slug]/page"), p({ slug: PRODUCER.slug })],
  ["/events/[id]", () => import("@/app/[locale]/events/[id]/page"), p({ id: EVENT.id })],
  ["/experiences/[id]", () => import("@/app/[locale]/experiences/[id]/page"), p({ id: EXPERIENCE.id })],
  ["/group-buys/[id]", () => import("@/app/[locale]/group-buys/[id]/page"), p({ id: GROUP_BUY.id })],
  ["/[slug]/recipes/[recipe_id]", () => import("@/app/[locale]/[slug]/recipes/[recipe_id]/page"), p({ slug: PRODUCER.slug, recipe_id: RECIPE.id })],
  ["/organizers/[slug]", () => import("@/app/[locale]/organizers/[slug]/page"), p({ slug: ORGANIZER.slug })],
  ["/events/[id] (fallback)", () => import("@/app/[locale]/events/[id]/page"), p({ id: EVENT.id }), { id: EVENT.id }],
  ["/experiences/[id] (fallback)", () => import("@/app/[locale]/experiences/[id]/page"), p({ id: EXPERIENCE.id }), { id: EXPERIENCE.id, description: "x" }],
  ["/group-buys/[id] (fallback)", () => import("@/app/[locale]/group-buys/[id]/page"), p({ id: GROUP_BUY.id }), { id: GROUP_BUY.id }],
  // every other page whose title this card touched
  ["/privacy", () => import("@/app/[locale]/privacy/page"), p()],
  ["/accessibility", () => import("@/app/[locale]/accessibility/page"), p()],
  ["/contact", () => import("@/app/[locale]/contact/page"), p()],
  ["/login", () => import("@/app/[locale]/login/page"), p()],
  ["/register", () => import("@/app/[locale]/register/page"), p()],
  ["/register/organizer", () => import("@/app/[locale]/register/organizer/page"), p()],
  ["/forgot-password", () => import("@/app/[locale]/forgot-password/page"), p()],
  ["/reset-password", () => import("@/app/[locale]/reset-password/page"), p()],
  ["/verify-email", () => import("@/app/[locale]/verify-email/page"), p()],
  ["/favorites", () => import("@/app/[locale]/favorites/page"), p()],
  ["/join", () => import("@/app/[locale]/join/page"), p()],
  ["/recommend", () => import("@/app/[locale]/recommend/page"), p()],
  ["/claim", () => import("@/app/[locale]/claim/page"), p()],
  ["/messages", () => import("@/app/[locale]/messages/page"), p()],
  ["/rescue", () => import("@/app/[locale]/rescue/page"), p()],
  ["/newsletter/unsubscribe", () => import("@/app/[locale]/newsletter/unsubscribe/page"), p()],
  ["/delivery-waitlist/unsubscribe", () => import("@/app/[locale]/delivery-waitlist/unsubscribe/page"), p()],
  ["/delivery-waitlist/host-confirm", () => import("@/app/[locale]/delivery-waitlist/host-confirm/page"), p()],
  ["/registration/[token]", () => import("@/app/[locale]/registration/[token]/page"), p({ token: "t" })],
  ["/about/for-businesses/guides", () => import("@/app/[locale]/about/for-businesses/guides/page"), p()],
  ["/about/for-businesses/guides/business-story", () => import("@/app/[locale]/about/for-businesses/guides/business-story/page"), p()],
  ["/about/for-businesses/guides/customer-messages", () => import("@/app/[locale]/about/for-businesses/guides/customer-messages/page"), p()],
  ["/about/for-businesses/guides/product-photography", () => import("@/app/[locale]/about/for-businesses/guides/product-photography/page"), p()],
];

// STOPPED for Sapir (listed in the PR): making these follow the pattern needs
// new or removed words, which this card does not allow. They stay as they
// were, and this list is the only place they are excused.
//   /about — «החזון שלנו — על מהמקור» / «About Mehamakor — our vision and
//   values»: the brand is inside the words, not a trailing suffix.
const TITLE_STOPPED = new Set(["/about"]);
// og/twitter titles whose WORDS already carry the brand («צרו קשר עם מהמקור»,
// «המועדפים שלי במהמקור»). Appending « | מהמקור» would say it twice, so they
// are left as they were and listed in the PR. The business and organizer pages'
// share title is the bare name (card: business titles already uniform — no change).
const SOCIAL_STOPPED = new Set([
  "/about", "/contact", "/login", "/register", "/forgot-password", "/reset-password",
  "/verify-email", "/favorites", "/producer/[id]", "/[slug]", "/organizers/[slug]",
]);

// Next.js's rule for a page title under a parent template.
function render(title, template, homeTitle) {
  if (title == null) return homeTitle;
  if (typeof title === "string") return template.replace(/%s/g, title);
  if (title.absolute != null) return title.absolute;
  if (title.default != null) return template.replace(/%s/g, title.default);
  throw new Error(`unrecognised title shape: ${JSON.stringify(title)}`);
}

const count = (s, sub) => s.split(sub).length - 1;
const BAD_SEPARATORS = (brand) => [` — ${brand}`, ` - ${brand}`, ` – ${brand}`, ` · ${brand}`];

const LAYOUT = {};
const RESULTS = { he: [], en: [] };

beforeAll(async () => {
  const { generateMetadata } = await import("@/app/[locale]/layout");
  for (const locale of ["he", "en"]) {
    requestLocale = locale;
    LAYOUT[locale] = await generateMetadata({ params: Promise.resolve({ locale }) });
  }
});

describe.each(["he", "en"])("MEH-2853 title pattern (%s)", (locale) => {
  const brand = BRAND[locale];
  const suffix = ` | ${brand}`;

  it("home keeps its own full title (seo.site.title), not the template", () => {
    expect(LAYOUT[locale].title.template).toBe(`%s${suffix}`);
    expect(LAYOUT[locale].title.default).toBe(MESSAGES[locale].seo.site.title);
  });

  it.each(ROUTES)("%s", async (route, load, args, entity) => {
    requestLocale = locale;
    entityOverride = entity ?? null;
    const mod = await load();
    const meta = mod.generateMetadata ? await mod.generateMetadata(args(locale)) : mod.metadata;
    entityOverride = null;
    const { template, default: homeTitle } = LAYOUT[locale].title;
    const title = render(meta.title, template, homeTitle);
    RESULTS[locale].push([route, title]);
    // Optional: TITLE_PATTERN_DUMP=<file> appends every rendered title, for the
    // PR's before → after table.
    if (process.env.TITLE_PATTERN_DUMP) {
      const row = [locale, route, title, meta.openGraph?.title ?? null, meta.twitter?.title ?? null];
      fs.appendFileSync(process.env.TITLE_PATTERN_DUMP, `${JSON.stringify(row)}\n`);
    }

    if (!TITLE_STOPPED.has(route)) {
      expect(title, "brand suffix exactly once").not.toBe(homeTitle);
      expect(title.endsWith(suffix), `ends with "${suffix}": ${title}`).toBe(true);
      expect(count(title, suffix), `"${suffix}" once: ${title}`).toBe(1);
      expect(title.length, "no empty page part").toBeGreaterThan(suffix.length);
      // the brand string is typed into the template, never into the page part
      expect(meta.title?.absolute, `title.absolute is home-only: ${title}`).toBeUndefined();
    }
    for (const bad of BAD_SEPARATORS(brand)) {
      expect(title.includes(bad), `no "${bad.trim()}" brand separator: ${title}`).toBe(false);
    }

    // og / twitter titles get no template from Next.js — when a page sets
    // one, it must carry the brand itself, at the end, once.
    for (const social of [meta.openGraph?.title, meta.twitter?.title]) {
      if (social == null) continue;
      for (const bad of BAD_SEPARATORS(brand)) {
        expect(social.includes(bad), `no "${bad.trim()}" in share title: ${social}`).toBe(false);
      }
      expect(count(social, suffix), `share title "${suffix}" at most once: ${social}`).toBeLessThanOrEqual(1);
      if (!SOCIAL_STOPPED.has(route)) {
        expect(social.endsWith(suffix), `share title ends with "${suffix}": ${social}`).toBe(true);
      }
    }
  });

  it("reports titles over 65 characters (reported, not reworded)", () => {
    const long = RESULTS[locale].filter(([, t]) => t.length > 65);
    for (const [route, t] of long) console.info(`[MEH-2853] ${locale} ${route} — ${t.length} chars: ${t}`);
    expect(RESULTS[locale].length).toBe(ROUTES.length);
  });
});
