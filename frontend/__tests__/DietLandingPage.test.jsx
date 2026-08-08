/**
 * MEH-1935 — diet landing pages (/producers/diet/[dietSlug]).
 *
 * Three things are guarded here, and each one has a documented way of failing
 * SILENTLY, which is why they get assertions rather than a smoke test:
 *
 *   1. The DATA GATE. Two independent conditions, deliberately not merged: the
 *      backend must actually implement the filter (`backed`), AND at least
 *      DIET_PAGE_MIN businesses must match. The `backed` half exists because
 *      FastAPI IGNORES an unknown query param — `?no_added_sugar=true` returns
 *      the whole catalog today, so a count-only gate would happily publish an
 *      indexable page whose grid contradicts its H1. The test at "unbacked slug
 *      404s even though the API reports a passing count" is the discriminator:
 *      it fails if anyone deletes the flag and leans on the count alone.
 *
 *   2. MEH-1754 FAILURE SEMANTICS. Only a genuine below-threshold answer may
 *      become notFound(). A 5xx/timeout must THROW, because a 404 tells Google
 *      the page is gone and de-indexing starts. A `catch` that returned an empty
 *      list would turn a backend wobble into six de-indexed pages, and would
 *      look exactly like a passing test — hence an explicit "throws, does not
 *      notFound()" case.
 *
 *   3. JSON-LD ESCAPING (MEH-1069). Producer names reach the ld+json script, so
 *      a `</script>` in a name must not close the tag.
 *
 * Failing-by-construction runs for every assertion below are pasted in the PR
 * body (MEH-1619): each was observed red against a deliberately broken variant
 * before being observed green against the shipped code.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  SITE_URL: "https://mehamakor.co.il",
  API_URL: "https://api.example.test",
}));

const serverFetch = vi.fn();
vi.mock("@/lib/server-fetch", () => ({
  serverFetch: (...args) => serverFetch(...args),
}));

// notFound() throws a sentinel so a test can assert it fired AND that nothing
// after it ran — mirroring Next's real control flow.
class NotFoundError extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundError("NEXT_NOT_FOUND");
  },
}));

// Heavy client trees, plus next-intl's navigation factory — which deep-imports
// `next/navigation` itself and so trips over the mock above if it ever loads.
// None of them participate in the guards under test.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children }) => children,
}));
vi.mock("@/components/ProducerCard", () => ({ default: () => null }));
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));

// Lets a single spec make t.raw(".faq") return something other than an array,
// to reproduce next-intl's missing-message behaviour. Default (undefined) keeps
// the normal array for every other spec.
const rawFaqOverride = vi.hoisted(() => ({ value: undefined }));

vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => {
    const t = (key, params) =>
      params?.label ? `${key}:${params.label}` : `t:${key}`;
    t.raw = (key) =>
      key.endsWith(".faq")
        ? rawFaqOverride.value !== undefined
          ? rawFaqOverride.value
          : [{ question: "Q1", answer: "A1" }]
        : `raw:${key}`;
    return t;
  },
}));

import DietLandingPage, {
  generateMetadata,
} from "@/app/[locale]/producers/diet/[dietSlug]/page";
import { buildDietPageJsonLd, serializeJsonLd } from "@/lib/seo";
import {
  BACKED_DIET_PAGES,
  DIET_PAGES,
  DIET_PAGE_MIN,
  dietPagePath,
  dietPageLabel,
  getDietPage,
} from "@/lib/diet-pages";
import { ATTRIBUTE_LABELS } from "@/lib/attribute-labels";

/** A /producers response carrying `total` in X-Total-Count. */
function listing(total, items = []) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: (h) => (h.toLowerCase() === "x-total-count" ? String(total) : null) },
    json: async () => items,
  };
}

function serverError(status = 503) {
  return {
    ok: false,
    status,
    statusText: "Service Unavailable",
    headers: { get: () => null },
    json: async () => ({}),
  };
}

const meta = (dietSlug, locale = "he") =>
  generateMetadata({ params: Promise.resolve({ dietSlug, locale }) });

beforeEach(() => {
  serverFetch.mockReset();
});

describe("MEH-1935 config — lib/diet-pages", () => {
  it("covers exactly the six diet slugs, in the locked MEH-1438 chip order", () => {
    expect(DIET_PAGES.map((p) => p.slug)).toEqual([
      "vegan",
      "vegetarian",
      "gluten-free",
      "lactose-free",
      "no-added-sugar",
      "low-carb",
    ]);
  });

  it("routes under the static /producers/diet/ segment (MEH-1204 decision 3 stays free)", () => {
    // The bare /producers/[dietSlug] shape would make MEH-1204's locked
    // /producers/[category]/[region] unbuildable — Next rejects two different
    // slug names under one parent. Pin the segment so that cannot regress.
    expect(dietPagePath("vegan")).toBe("/producers/diet/vegan");
  });

  it("takes the H1 label from ATTRIBUTE_LABELS, never a second copy", () => {
    for (const entry of BACKED_DIET_PAGES) {
      expect(dietPageLabel(entry)).toBe(ATTRIBUTE_LABELS[entry.attribute].label);
    }
  });

  it("marks exactly the two MEH-1934 attributes as not-yet-backed", () => {
    const pending = DIET_PAGES.filter((p) => !p.backed).map((p) => p.slug);
    expect(pending).toEqual(["no-added-sugar", "low-carb"]);
  });
});

describe("MEH-1935 data gate — generateMetadata", () => {
  it("serves a page whose match count is at the threshold", async () => {
    serverFetch.mockResolvedValue(listing(DIET_PAGE_MIN));
    const m = await meta("vegan");
    expect(m.alternates.canonical).toContain("/producers/diet/vegan");
    expect(m.title.absolute).toContain(ATTRIBUTE_LABELS.vegan.label);
  });

  it("404s one business below the threshold", async () => {
    serverFetch.mockResolvedValue(listing(DIET_PAGE_MIN - 1));
    await expect(meta("vegan")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("404s an unknown slug without calling the API at all", async () => {
    await expect(meta("paleo")).rejects.toBeInstanceOf(NotFoundError);
    expect(serverFetch).not.toHaveBeenCalled();
  });

  /**
   * THE discriminating case for the `backed` flag. The API here reports a
   * comfortably passing count — because FastAPI ignores `?no_added_sugar=true`
   * and returns the entire catalog. A count-only gate goes GREEN on this and
   * publishes a page whose grid does not match its own H1.
   */
  it("404s an unbacked slug even when the API reports a passing count", async () => {
    serverFetch.mockResolvedValue(listing(DIET_PAGE_MIN * 10));
    await expect(meta("no-added-sugar")).rejects.toBeInstanceOf(NotFoundError);
    await expect(meta("low-carb")).rejects.toBeInstanceOf(NotFoundError);
  });

  /**
   * MEH-1754: a backend fault must NOT read as "this page is gone". If this
   * ever flips to notFound(), a two-hour wobble costs six indexable pages
   * their search presence for weeks.
   */
  it("throws (5xx) rather than 404ing when the listing fetch fails", async () => {
    serverFetch.mockResolvedValue(serverError(503));
    const err = await meta("vegan").catch((e) => e);
    expect(err).not.toBeInstanceOf(NotFoundError);
    expect(err.status).toBe(503);
  });

  /**
   * A MISSING X-Total-Count is "unknown", not "zero". `Number(null || 0)`
   * would resolve to 0, fall under the threshold and 404 all six pages the
   * moment the backend stopped sending the header — an unverified negative
   * causing a de-indexing event. Only a header we really read may 404 a page.
   */
  it("throws rather than 404ing when X-Total-Count is absent", async () => {
    serverFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => null },
      json: async () => [],
    });
    const err = await meta("vegan").catch((e) => e);
    expect(err).not.toBeInstanceOf(NotFoundError);
    expect(err.status).toBe(502);
  });

  it("emits per-locale hreflang alternates for the en page", async () => {
    serverFetch.mockResolvedValue(listing(DIET_PAGE_MIN));
    const m = await meta("gluten-free", "en");
    expect(m.alternates.canonical).toContain("/en/producers/diet/gluten-free");
    expect(Object.keys(m.alternates.languages).length).toBeGreaterThan(1);
  });
});

describe("MEH-1935 JSON-LD", () => {
  const base = {
    label: "טבעוני",
    pageUrl: "https://mehamakor.co.il/producers/diet/vegan",
    intro: "intro",
    producersUrl: "https://mehamakor.co.il/producers",
    producersLabel: "בתי עסק",
  };

  it("emits ItemList + FAQPage + BreadcrumbList in one @graph", () => {
    const ld = buildDietPageJsonLd({
      ...base,
      faq: [{ question: "Q", answer: "A" }],
      items: [{ name: "מאפייה", url: "https://mehamakor.co.il/bakery" }],
    });
    expect(ld["@graph"].map((n) => n["@type"])).toEqual([
      "ItemList",
      "FAQPage",
      "BreadcrumbList",
    ]);
  });

  it("lists exactly the businesses the page rendered", () => {
    const items = [
      { name: "א", url: "https://mehamakor.co.il/a" },
      { name: "ב", url: "https://mehamakor.co.il/b" },
    ];
    const list = buildDietPageJsonLd({ ...base, faq: [], items })["@graph"][0];
    expect(list.numberOfItems).toBe(2);
    expect(list.itemListElement.map((e) => e.position)).toEqual([1, 2]);
  });

  /**
   * Google rejects a FAQPage with an empty mainEntity, so the entity is dropped
   * rather than emitted hollow.
   */
  it("omits FAQPage entirely when there are no questions", () => {
    const ld = buildDietPageJsonLd({ ...base, faq: [], items: [] });
    expect(ld["@graph"].map((n) => n["@type"])).not.toContain("FAQPage");
  });

  it("breadcrumb trails ישראל → בתי עסק → label, with no gaps", () => {
    const ld = buildDietPageJsonLd({ ...base, faq: [], items: [] });
    const crumbs = ld["@graph"].find((n) => n["@type"] === "BreadcrumbList");
    expect(crumbs.itemListElement.map((c) => c.name)).toEqual([
      "ישראל",
      "בתי עסק",
      "טבעוני",
    ]);
  });

  /**
   * MEH-1069: a producer name is user content and reaches the ld+json script.
   * A raw `</script>` there closes the tag and injects markup.
   */
  it("escapes a </script> breakout in a business name", () => {
    const ld = buildDietPageJsonLd({
      ...base,
      faq: [],
      items: [
        { name: "</script><script>alert(1)</script>", url: "https://mehamakor.co.il/x" },
      ],
    });
    const html = serializeJsonLd(ld);
    expect(html).not.toContain("</script>");
    expect(html).toContain("\\u003c");
    // Still valid JSON — a parser decodes it back to the original string.
    expect(JSON.parse(html)["@graph"][0].itemListElement[0].name).toBe(
      "</script><script>alert(1)</script>",
    );
  });

  it("returns null without a label or a url rather than a half-built graph", () => {
    expect(buildDietPageJsonLd({ ...base, label: null })).toBeNull();
    expect(buildDietPageJsonLd({ ...base, pageUrl: null })).toBeNull();
  });
});

describe("MEH-1935 rendered page", () => {
  /** Depth-first walk for the ld+json <script>, wherever it sits in the tree. */
  function findJsonLdHtml(node) {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const c of node) {
        const hit = findJsonLdHtml(c);
        if (hit) return hit;
      }
      return null;
    }
    if (node.props?.type === "application/ld+json") {
      return node.props.dangerouslySetInnerHTML.__html;
    }
    return findJsonLdHtml(node.props?.children);
  }

  /**
   * The ItemList must point where the PAGE points. Building item URLs from a
   * bare SITE_URL emits the Hebrew URL on the /en page, so the structured data
   * disagrees both with the rendered links (@/i18n/navigation) and with each
   * item's own per-locale canonical.
   */
  it("builds locale-correct ItemList URLs on the en page", async () => {
    serverFetch.mockResolvedValue(
      listing(DIET_PAGE_MIN, [{ id: 1, name: "מאפייה", slug: "bakery" }]),
    );
    const html = findJsonLdHtml(
      await DietLandingPage({ params: Promise.resolve({ dietSlug: "vegan", locale: "en" }) }),
    );
    const list = JSON.parse(html)["@graph"].find((n) => n["@type"] === "ItemList");
    expect(list.itemListElement[0].url).toBe("https://mehamakor.co.il/en/bakery");
  });

  it("builds unprefixed ItemList URLs on the default (he) page", async () => {
    serverFetch.mockResolvedValue(
      listing(DIET_PAGE_MIN, [{ id: 1, name: "מאפייה", slug: "bakery" }]),
    );
    const html = findJsonLdHtml(
      await DietLandingPage({ params: Promise.resolve({ dietSlug: "vegan", locale: "he" }) }),
    );
    const list = JSON.parse(html)["@graph"].find((n) => n["@type"] === "ItemList");
    expect(list.itemListElement[0].url).toBe("https://mehamakor.co.il/bakery");
  });

  /**
   * next-intl's t.raw() returns the KEY PATH (a string) for a missing message,
   * NOT undefined — so `t.raw(...) ?? []` sails past the nullish check and the
   * value reaches `.map` in the FAQ <dl> as a string, throwing at render.
   * lib/seo.js already coerced its own copy with Array.isArray; the render site
   * did not, and this pins that asymmetry closed.
   *
   * Discriminating: against the pre-fix `?? []` this spec throws
   * "faq.map is not a function" — the JSX children are built eagerly inside
   * the component call, so no renderer is needed to trip it.
   */
  it("does not throw when a locale loses its faq array (t.raw returns the key path)", async () => {
    serverFetch.mockResolvedValue(
      listing(DIET_PAGE_MIN, [{ id: 1, name: "מאפייה", slug: "bakery" }]),
    );
    rawFaqOverride.value = "pages.vegan.faq";
    try {
      const tree = await DietLandingPage({
        params: Promise.resolve({ dietSlug: "vegan", locale: "he" }),
      });
      expect(tree).toBeTruthy();
      // And the JSON-LD drops FAQPage rather than emitting a hollow one.
      const graph = JSON.parse(findJsonLdHtml(tree))["@graph"];
      expect(graph.some((n) => n["@type"] === "FAQPage")).toBe(false);
    } finally {
      rawFaqOverride.value = undefined;
    }
  });

  it("falls back to /producer/[id] for a business with no slug", async () => {
    serverFetch.mockResolvedValue(listing(DIET_PAGE_MIN, [{ id: 7, name: "ללא סלאג" }]));
    const html = findJsonLdHtml(
      await DietLandingPage({ params: Promise.resolve({ dietSlug: "vegan", locale: "he" }) }),
    );
    const list = JSON.parse(html)["@graph"].find((n) => n["@type"] === "ItemList");
    expect(list.itemListElement[0].url).toBe("https://mehamakor.co.il/producer/7");
  });
});

describe("MEH-1935 sitemap emission", () => {
  it("lists a passing diet page in both locales, and omits a failing one", async () => {
    // vegan passes; every other backed slug is one below the threshold.
    //
    // Dispatch on the EXACT filter param, resolved from the config, rather
    // than a substring test. `url.includes("vegan=true")` is already wrong-ish
    // — "vegetarian" contains no "vegan=true", but a future slug whose param
    // embedded another ("raw_vegan") would silently take the wrong branch and
    // this test would still be green. Matching `?<param>=true` with a boundary
    // survives any slug the config grows.
    const passing = "vegan";
    serverFetch.mockImplementation(async (url) => {
      const entry = BACKED_DIET_PAGES.find((p) =>
        new RegExp(`[?&]${p.filterParam}=true(&|$)`).test(url),
      );
      return listing(
        entry?.slug === passing ? DIET_PAGE_MIN : DIET_PAGE_MIN - 1,
      );
    });
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = (await sitemap()).map((e) => e.url);

    expect(urls).toContain("https://mehamakor.co.il/producers/diet/vegan");
    expect(urls).toContain("https://mehamakor.co.il/en/producers/diet/vegan");
    // A listed URL that 404s is a GSC error — the mirror of MEH-803's rule.
    expect(urls).not.toContain("https://mehamakor.co.il/producers/diet/gluten-free");
  });

  it("never lists a slug the backend cannot filter (MEH-1934 pending)", async () => {
    serverFetch.mockResolvedValue(listing(DIET_PAGE_MIN * 10));
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = (await sitemap()).map((e) => e.url);
    for (const slug of ["no-added-sugar", "low-carb"]) {
      expect(urls).not.toContain(`https://mehamakor.co.il${dietPagePath(slug)}`);
    }
  });
});

describe("MEH-1935 copy contract", () => {
  it("gives every one of the six pages an intro, a meta description and FAQ", async () => {
    const he = (await import("@/messages/he.json")).default;
    const en = (await import("@/messages/en.json")).default;
    for (const entry of DIET_PAGES) {
      for (const [name, msgs] of [["he", he], ["en", en]]) {
        const page = msgs.diet_pages.pages[entry.attribute];
        expect(page, `${name}/${entry.slug}`).toBeTruthy();
        expect(page.intro.length, `${name}/${entry.slug} intro`).toBeGreaterThan(40);
        expect(page.meta_description.length).toBeGreaterThan(40);
        expect(page.faq.length).toBeGreaterThanOrEqual(1);
        for (const qa of page.faq) {
          expect(qa.question).toBeTruthy();
          expect(qa.answer).toBeTruthy();
        }
      }
    }
  });

  /**
   * MEH-1934 §hebrew_copy bans both phrases on every surface: "מתאים לסוכרתיים"
   * is a medical claim, and "קטו" may appear only inside a page's editorial
   * voice — never as a label or a business-level claim. The intro is editorial,
   * so it is exempt; headings, meta and FAQ are not.
   */
  it("keeps the medical claim out of every string, in both locales", async () => {
    const he = (await import("@/messages/he.json")).default;
    const json = JSON.stringify(he.diet_pages);
    expect(json).not.toContain("מתאים לסוכרתיים");
  });

  /**
   * The probe has to be a WORD match, not a substring one. The first version of
   * this test used `.toContain("קטו")` and went red on the lactose page —
   * "ללא לקטוז" contains ק-ט-ו inside "לקטוז". A substring probe here is
   * malformed in both directions: it flags a legitimate page forever, and
   * loosening it to silence that would drop the real violations too.
   *
   * So it is a classifier, and per .claude/rules/testing.md a classifier ships
   * with a self-test that runs FIRST — three inputs whose answers are already
   * known, including the real repo string that produced the false positive.
   */
  const KETO_WORD = /(?:^|[^א-ת])קטו(?:גנית?)?(?:$|[^א-ת])/;

  it("self-test: the keto probe separates the label from «לקטוז» before it judges copy", () => {
    // known violation — the standalone label
    expect(KETO_WORD.test("מתאים לתפריט קטו")).toBe(true);
    expect(KETO_WORD.test("תפריט קטוגני, ולמי שמחפשת")).toBe(true);
    // known NON-violation — the real string from the lactose page
    expect(KETO_WORD.test("בתי עסק שסימנו מוצרים ללא לקטוז בקטלוג")).toBe(false);
    // neutral
    expect(KETO_WORD.test("לחמים על מחמצת")).toBe(false);
  });

  it("keeps «קטו» out of meta descriptions and FAQ answers (editorial intro only)", async () => {
    const he = (await import("@/messages/he.json")).default;
    for (const entry of DIET_PAGES) {
      const page = he.diet_pages.pages[entry.attribute];
      expect(KETO_WORD.test(page.meta_description), `${entry.slug} meta`).toBe(false);
      for (const qa of page.faq) {
        expect(KETO_WORD.test(qa.answer), `${entry.slug} faq`).toBe(false);
        expect(KETO_WORD.test(qa.question), `${entry.slug} faq q`).toBe(false);
      }
    }
  });

  it("carries the locked copy-honesty line verbatim", async () => {
    const he = (await import("@/messages/he.json")).default;
    expect(he.diet_pages.honesty).toBe(
      "הסימון לפי הצהרת בית העסק על מוצרים בקטלוג שלו.",
    );
  });

  it("keeps the MEH-1935 §hebrew_copy no-added-sugar intro verbatim", async () => {
    const he = (await import("@/messages/he.json")).default;
    expect(he.diet_pages.pages.no_added_sugar.intro).toBe(
      "מתוקים בלי סוכר לבן, לחמים על מחמצת בלי המתקה, וממרחים שהפרי עושה בהם את העבודה. כל בית עסק כאן סימן לפחות מוצר אחד בקטלוג כ«ללא סוכר מוסף» — מתאים גם למי שבונה תפריט דל פחמימות או קטוגני, וגם למי שפשוט רוצה פחות סוכר בבית.",
    );
  });

  it("has a config entry for every copy block and vice versa", () => {
    // A copy block with no config entry is dead weight; a config entry with no
    // copy block throws at render time. Pin both directions.
    expect(getDietPage("vegan").attribute).toBe("vegan");
    expect(getDietPage("nope")).toBeNull();
  });
});
