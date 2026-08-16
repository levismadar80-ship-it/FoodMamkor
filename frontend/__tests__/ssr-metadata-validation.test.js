/**
 * MEH-1885 — the four SSR metadata fetches validate and report instead of
 * swallowing.
 *
 * `app/[locale]/{producer,events,group-buys,experiences}/[id]/page.js` each
 * ran `if (!res.ok) return null` + `catch { return null }` and handed
 * `res.json()` straight to `generateMetadata` and the JSON-LD builders. A
 * contract change or a network failure produced no log line at all.
 *
 * The failure behaviour is DECIDED in
 * `docs/audits/producer-detail-page-validation.md` §6 and is not re-opened
 * here: safeParse, report to Sentry, then render the RAW payload. Never throw,
 * never `notFound()` — that is the MEH-1754 indexing-risk class.
 *
 * Four assertions per route, and the third is the one that matters most:
 *   1. A conforming payload reports NOTHING. Without this the "reports once"
 *      assertion below would pass just as well against code that reports on
 *      every request — a green with two causes (.claude/rules/testing.md).
 *   2. A violating payload still yields renderable metadata, and Sentry is
 *      called EXACTLY once (count, not truthiness).
 *   3. The object handed to the JSON-LD builder still carries keys the schema
 *      does NOT declare. This is the anti-stripping guard: it goes red the
 *      moment someone "tidies" `return data` into `return parsed.data`, which
 *      would delete 30 of ProducerDetailOut's 81 fields from the JSON-LD input
 *      — the MEH-901 class, reintroduced by the very ticket meant to observe it.
 *   4. A thrown fetch error reports exactly once and still returns cleanly.
 *
 * Plus one static assertion covering all four files at once: none of them
 * imports or calls `notFound`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const captureMessage = vi.fn();
const captureException = vi.fn();
const serverFetch = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...a) => captureMessage(...a),
  captureException: (...a) => captureException(...a),
}));
vi.mock("@/lib/server-fetch", () => ({ serverFetch: (...a) => serverFetch(...a) }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key) => key,
}));

// The page modules import their client trees; none of that is under test.
vi.mock("@/app/[locale]/producer/[id]/ProducerDetail", () => ({ default: () => null }));
vi.mock("@/app/[locale]/events/[id]/EventDetailClient", () => ({ default: () => null }));
vi.mock("@/app/[locale]/group-buys/[id]/GroupBuyDetailClient", () => ({ default: () => null }));
vi.mock("@/app/[locale]/experiences/[id]/ExperienceDetailClient", () => ({ default: () => null }));

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

/**
 * Pull the payload the page handed to its JSON-LD child out of the returned
 * element tree. Reading the props rather than rendering keeps the assertion on
 * the one thing under test — what `getX()` returned — with no React runtime in
 * the way.
 */
function jsonLdPayloadFrom(element) {
  const kids = element?.props?.children;
  const list = Array.isArray(kids) ? kids : [kids];
  return list
    .map((child) => child?.props?.producer ?? child?.props?.event)
    .filter(Boolean);
}

const sentryCalls = () => captureMessage.mock.calls.length + captureException.mock.calls.length;

beforeEach(() => {
  captureMessage.mockClear();
  captureException.mockClear();
  serverFetch.mockReset();
});

// Conforming payloads, then the same payload with ONE contract violation.
// `undeclared` on each is a key the minimal schema does not model — it is what
// assertion 3 looks for on the far side of the parse.
const PRODUCER_OK = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "מאפיית רוח השדה",
  slug: "ruach-hasade",
  city: "כפר סבא",
  avg_rating: 4.8,
  whatsapp_group: "https://chat.whatsapp.com/x", // declared by ProducerDetailOut, NOT by the Zod schema
};
const EVENT_OK = {
  id: "22222222-2222-2222-2222-222222222222",
  producer_id: "33333333-3333-3333-3333-333333333333",
  title: "סדנת אפייה",
  event_date: "2026-09-01",
  price: 120,
  category: "workshop", // on EventOut, not modelled by the minimal schema
};
const GROUP_BUY_OK = {
  id: "44444444-4444-4444-4444-444444444444",
  title: "רכישה קבוצתית — שמן זית",
  product_name: "שמן זית", // on GroupBuyOut, not modelled
};
const EXPERIENCE_OK = {
  id: "55555555-5555-5555-5555-555555555555",
  title: "קטיף בכרם",
  description: "בוקר בכרם",
  location_type: "on_site", // on ExperienceDetailOut, not modelled
};

const ROUTES = [
  {
    name: "producer",
    load: () => import("@/app/[locale]/producer/[id]/page"),
    valid: PRODUCER_OK,
    // avg_rating: number in the contract. A string is a real drift signal and
    // leaves every metadata input intact, so the render assertion stays honest.
    invalid: { ...PRODUCER_OK, avg_rating: "excellent" },
    params: { id: PRODUCER_OK.id, locale: "he" },
    undeclaredKey: "whatsapp_group",
    rendersJsonLd: true,
  },
  {
    name: "events",
    load: () => import("@/app/[locale]/events/[id]/page"),
    valid: EVENT_OK,
    invalid: { ...EVENT_OK, price: "חינם" }, // price: float on EventOut
    params: { id: EVENT_OK.id, locale: "he" },
    undeclaredKey: "category",
    rendersJsonLd: true,
  },
  {
    name: "group-buys",
    load: () => import("@/app/[locale]/group-buys/[id]/page"),
    valid: GROUP_BUY_OK,
    invalid: (() => {
      const { id, ...rest } = GROUP_BUY_OK; // id is required on GroupBuyOut
      return rest;
    })(),
    params: { id: GROUP_BUY_OK.id, locale: "he" },
    rendersJsonLd: false,
  },
  {
    name: "experiences",
    load: () => import("@/app/[locale]/experiences/[id]/page"),
    valid: EXPERIENCE_OK,
    invalid: (() => {
      const { description, ...rest } = EXPERIENCE_OK; // required on ExperienceDetailOut
      return rest;
    })(),
    params: { id: EXPERIENCE_OK.id, locale: "he" },
    rendersJsonLd: false,
  },
];

describe.each(ROUTES)("MEH-1885 — $name SSR metadata validation", (route) => {
  it("reports NOTHING for a conforming payload", async () => {
    serverFetch.mockResolvedValue(ok(route.valid));
    const { generateMetadata } = await route.load();
    const meta = await generateMetadata({ params: Promise.resolve(route.params) });
    expect(sentryCalls()).toBe(0);
    expect(meta.title).toBeDefined();
  });

  it("reports EXACTLY once on a schema violation and still renders metadata", async () => {
    serverFetch.mockResolvedValue(ok(route.invalid));
    const { generateMetadata } = await route.load();
    const meta = await generateMetadata({ params: Promise.resolve(route.params) });

    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledTimes(0);
    expect(captureMessage.mock.calls[0][0]).toBe("SSR payload failed schema validation");
    // The route is attached, so the operator can tell the four apart.
    expect(captureMessage.mock.calls[0][1].extra.route).toContain(route.name.replace(/s$/, ""));
    expect(captureMessage.mock.calls[0][1].extra.issues.length).toBeGreaterThan(0);

    // Still renderable: a title exists and the page is NOT marked noindex,
    // i.e. the validation result did not degrade the page.
    expect(meta.title).toBeDefined();
    expect(meta.robots?.index).not.toBe(false);
  });

  it("never throws and never returns a 404-shaped result for a validation failure", async () => {
    serverFetch.mockResolvedValue(ok(route.invalid));
    const mod = await route.load();
    await expect(
      mod.generateMetadata({ params: Promise.resolve(route.params) }),
    ).resolves.toBeDefined();
    if (mod.default.constructor.name === "AsyncFunction") {
      await expect(mod.default({ params: Promise.resolve(route.params) })).resolves.toBeDefined();
    }
  });

  it("reports EXACTLY once when the fetch throws, and still returns", async () => {
    serverFetch.mockRejectedValue(new Error("ECONNRESET"));
    const { generateMetadata } = await route.load();
    const meta = await generateMetadata({ params: Promise.resolve(route.params) });
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledTimes(0);
    expect(meta).toBeDefined();
  });

  if (route.rendersJsonLd) {
    it("hands the RAW payload to the JSON-LD child — undeclared keys survive", async () => {
      serverFetch.mockResolvedValue(ok(route.valid));
      const mod = await route.load();
      const payloads = jsonLdPayloadFrom(await mod.default({ params: Promise.resolve(route.params) }));
      expect(payloads.length).toBeGreaterThan(0);
      // `return parsed.data` instead of `return data` would strip this key.
      expect(payloads[0]).toHaveProperty(route.undeclaredKey);
    });
  }
});

describe("MEH-1885 — no SSR route answers a validation failure with notFound()", () => {
  const FILES = [
    "app/[locale]/producer/[id]/page.js",
    "app/[locale]/events/[id]/page.js",
    "app/[locale]/group-buys/[id]/page.js",
    "app/[locale]/experiences/[id]/page.js",
  ];

  // `notFound` can only come from next/navigation, so the import is the
  // precise thing to forbid. Matching the bare identifier would also hit the
  // comments in these files that say "never notFound()" — a guard that reds on
  // its own rationale is not a guard.
  it.each(FILES)("%s does not import from next/navigation", (rel) => {
    const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    expect(src).not.toMatch(/from\s+["']next\/navigation["']/);
  });

  it.each(FILES)("%s contains no notFound() call", (rel) => {
    const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    const executable = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(executable).not.toMatch(/\bnotFound\s*\(/);
  });

  it.each(FILES)("%s reports to Sentry", (rel) => {
    const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    expect(src).toMatch(/Sentry\.(captureException|captureMessage)/);
  });
});
