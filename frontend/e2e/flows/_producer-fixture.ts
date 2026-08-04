/**
 * Module:   _producer-fixture
 * Purpose:  Pick the producer a flow spec will exercise by an EXPLICIT stated
 *           requirement, deterministically, instead of taking whatever the
 *           shared staging feed happens to render first.
 * Does NOT: assert anything about the page, and does NOT skip. A requirement it
 *           cannot satisfy is a seeding regression and throws — the specs own
 *           their own assertions.
 * Related:  e2e/flows/03-view-producer-detail.spec.ts, 04-whatsapp-click.spec.ts,
 *           06-lightbox.spec.ts
 * History:  MEH-1717 (creation)
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `e2e.yml:142` points the suite at the LIVE Railway staging backend, so these
 * specs read shared, mutable, production-shaped data. Three of them took "the
 * first card on /producers" and then skipped whenever that particular business
 * lacked what the spec needed. Two consequences, both measured:
 *
 *   1. The outcome tracked which businesses were visible tonight. MEH-1883
 *      documents a nightly window in which the backend disagreed with Israel
 *      about the date and default-hid every business whose vacation had just
 *      ended; MEH-1785 recorded the same three specs red on a PR and green on
 *      the identical code post-merge. A spec whose verdict moves with the
 *      vacation calendar is not testing the product.
 *   2. The skips were silent, so the suite reported green for runs in which
 *      these flows never executed — MEH-1717's "כיסוי מזויף" (fake coverage),
 *      and the same skip-green family as MEH-1582 / MEH-1799.
 *
 * ── THE RULE THIS ENCODES ──────────────────────────────────────────────────
 * Per MEH-1717's 04/08 addendum: skip is legitimate only on an explicit ENV
 * condition, never on a data condition. Missing seed data is a FAILURE with a
 * name, because that is a real regression someone must fix — silently skipping
 * it is how it survived six consecutive runs unnoticed (PR #2580).
 *
 * Note the shape deliberately avoids the trap `.claude/rules/testing.md`
 * describes: a guard that consults its own subject and converts "the thing is
 * gone" into "nothing to check". Here, absence throws.
 */
import { expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

export type FeedProducer = {
  id: string;
  slug?: string | null;
  name?: string | null;
  phone?: string | null;
  contact_email?: string | null;
  primary_contact_method?: string | null;
  images?: string[] | null;
};

/**
 * `ProducerCard.jsx:173` links to `/{slug}` when the producer has one and
 * `/producer/{id}` otherwise. Both are real detail routes served by DIFFERENT
 * resolvers — MEH-1712 §2 is the cautionary tale: a negative control that
 * probed the id route "proved" health while the slug route was 404ing for
 * every business. Specs must therefore follow the SAME preference the card
 * uses, or they test a route no user reaches.
 */
export function detailPath(p: FeedProducer): string {
  return p.slug ? `/${p.slug}` : `/producer/${p.id}`;
}

/**
 * Fetch the public feed and return the producers matching `requirement`,
 * ordered deterministically.
 *
 * Sorting by `id` is the whole point: the API's own ordering is a product
 * decision that changes with ranking, availability and the vacation calendar,
 * so consuming it makes every spec a hostage to it. `id` is stable for the
 * lifetime of the row.
 */
export async function pickProducer(
  request: APIRequestContext,
  requirement: { label: string; matches: (p: FeedProducer) => boolean },
): Promise<FeedProducer> {
  const res = await request.get("/api/producers");
  if (!res.ok()) {
    throw new Error(
      `GET /producers returned ${res.status()} — the E2E backend is unreachable or erroring. ` +
        "This is infrastructure, not a UI regression, and it must not be skipped past.",
    );
  }

  const feed = (await res.json()) as FeedProducer[];
  if (!Array.isArray(feed) || feed.length === 0) {
    throw new Error(
      "GET /producers returned an empty feed — the staging seed is missing. " +
        "Seed it rather than skipping: a suite that skips on no data reports green for runs that tested nothing.",
    );
  }

  // Lexicographic BY DESIGN — the goal is determinism, not numeric order. Two
  // runs against the same feed must choose the same producer; whether "9" sorts
  // after "10" is irrelevant to that, and these ids are UUIDs in any case.
  const matching = feed
    .filter((p) => p && p.id && requirement.matches(p))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  if (matching.length === 0) {
    throw new Error(
      `No producer in the staging feed satisfies: ${requirement.label}. ` +
        `The feed has ${feed.length} producer(s), none matching. ` +
        "This is a SEED regression — fix the data, do not relax the spec. " +
        "(Silently skipping here is what hid this class for six consecutive runs, PR #2580.)",
    );
  }

  return matching[0];
}

/**
 * Start collecting uncaught page errors. Call BEFORE the first navigation.
 *
 * Diagnostics only — nothing asserts on the returned array. It exists because
 * `#__next_error__` is rendered for BOTH a deliberate `notFound()` and a crash
 * in the tree, and the two need opposite fixes. A red that says only "landed on
 * Next's error page" sends the next reader to the wrong half.
 */
export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e?.message ?? String(e)}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/**
 * Assert the producer-detail route actually rendered, and — when it did not —
 * throw a report that names WHICH failure it was.
 *
 * MEH-1712 §2 is why the report probes the sibling route: the slug resolver was
 * 404ing for every business while `/producer/{id}` stayed healthy, and a check
 * that only knew "the detail page didn't render" could not have said so. The
 * probe runs exclusively inside the failure branch — it cannot turn a red green.
 */
export async function assertDetailRendered(
  page: Page,
  producer: FeedProducer,
  requested: string,
  pageErrors: string[],
  httpStatus?: number,
): Promise<void> {
  try {
    // The real assertion, with the config's 20s retry budget — an instantaneous
    // count() here would read a still-navigating page as healthy.
    await expect(page.locator("#__next_error__")).toHaveCount(0);
    return;
  } catch (e) {
    // Playwright throws from that same call for faults that are NOT "the
    // boundary is present" — navigation timeout mid-assert, page crash, context
    // closed — and every one of them arrives wrapped as a matcher failure, so
    // inspecting the error object cannot tell them apart (measured: the
    // closed-page case in 00-producer-fixture-selftest carries `matcherResult`
    // exactly like a genuine count mismatch).
    //
    // So confirm against the page instead. This read is safe here in a way it
    // would NOT be on the pass path: the 20s retry has already elapsed, so a
    // zero now means the assertion failed for some other reason — rethrow the
    // original. And on a dead page the read itself throws the real fault, which
    // propagates untouched. Reporting "the detail route did not render" about a
    // page whose actual problem was something else is worse than no diagnosis:
    // a confident wrong cause is what the next reader acts on.
    if ((await page.locator("#__next_error__").count()) === 0) throw e;
  }

  const bodyText = (await page.locator("body").innerText().catch(() => ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);

  let siblingRoute = "n/a — this producer has no slug, so the requested URL WAS the id route";
  let bySlug = "n/a — no slug to look up";
  let slugBytes = "n/a";
  if (producer.slug) {
    siblingRoute = await page.request
      .get(`/producer/${producer.id}`)
      .then((r) => `GET /producer/${producer.id} → HTTP ${r.status()}`)
      .catch((e) => `GET /producer/${producer.id} → probe failed: ${String(e)}`);

    // THE decisive datum. middleware.js:47-48 returns `res.ok` from exactly this
    // endpoint, so ANY non-2xx — 404, 500, 429 — rewrites to /__mm_not_found__
    // with status 404 (middleware.js:98-103). The 404 the browser sees therefore
    // carries no information about which it was, and the middleware logs nothing.
    // Sampling it here, for THIS slug, at the moment of failure, is what splits:
    //   404 → the slug genuinely does not resolve in the DB (compare slugBytes)
    //   5xx → a backend fault turned into a false 404 on the canonical, indexable
    //         URL — not a not-found at all
    // `/api/*` proxies to the same backend the middleware queries
    // (next.config.js:154-173), so this reaches the same resolver.
    bySlug = await page.request
      .get(`/api/producers/by-slug/${encodeURIComponent(producer.slug)}`)
      .then((r) => `GET /api/producers/by-slug/${producer.slug} → HTTP ${r.status()}`)
      .catch((e) => `by-slug probe failed: ${String(e)}`);

    // Codepoints, not the rendered string. A trailing space or a Hebrew-lookalike
    // character passes the middleware's isSlugShaped() and still fails the DB
    // comparison, and by eye the two spellings are identical.
    slugBytes = [...producer.slug]
      .map((c) => (/[a-z0-9-]/.test(c) ? c : `U+${c.codePointAt(0)!.toString(16).toUpperCase()}`))
      .join("");
  }

  throw new Error(
    [
      `The detail route did not render for producer ${producer.id} (${producer.name ?? "unnamed"}), ` +
        "which the /producers feed is serving right now.",
      `  requested ......... ${requested}`,
      `  http status ....... ${httpStatus ?? "n/a (navigated by click)"}`,
      `  landed on ......... ${page.url()}`,
      `  sibling route ..... ${siblingRoute}`,
      `  backend by-slug ... ${bySlug}`,
      `  slug codepoints ... ${slugBytes}`,
      `  page errors ....... ${pageErrors.length ? pageErrors.join(" | ").slice(0, 600) : "none"}`,
      `  page text ......... ${bodyText || "(empty)"}`,
      "",
      "Read the `backend by-slug` line FIRST — it is the one that discriminates.",
      "middleware.js:47-48 returns res.ok, so any non-2xx from that endpoint becomes a hard",
      "404 rewrite (middleware.js:98-103) and app/[locale]/[slug]/page.js never runs. The 404",
      "in the browser is therefore the middleware's, and it looks identical whether the backend",
      "said 404, 500 or 429:",
      "  by-slug 404 → the slug does not resolve; compare `slug codepoints` against the DB row",
      "  by-slug 5xx → a backend fault presented as a not-found on the canonical, indexable URL",
      "  by-slug 200 → the failure was transient, or the fault is downstream of the middleware",
      "Either way it is a product defect, not a data condition to skip past.",
    ].join("\n"),
  );
}

/** Navigate straight to a producer's detail page and assert it rendered. */
export async function openDetail(
  page: Page,
  producer: FeedProducer,
  pageErrors: string[],
): Promise<void> {
  const path = detailPath(producer);
  const res = await page.goto(path);
  await assertDetailRendered(page, producer, path, pageErrors, res?.status());
}

/** Requirements the flow specs select on, named once so they read the same everywhere. */
export const REQUIREMENTS = {
  contactable: {
    label: "has phone or contact_email (so the detail page renders a contact CTA)",
    matches: (p: FeedProducer) => Boolean(p.phone || p.contact_email),
  },
  whatsappPrimary: {
    label: 'primary_contact_method === "whatsapp" (the beacon fires only for that method)',
    matches: (p: FeedProducer) => p.primary_contact_method === "whatsapp",
  },
  hasGalleryImage: {
    label: "has at least one gallery image (the lightbox only exists with a photo)",
    matches: (p: FeedProducer) => Array.isArray(p.images) && p.images.length > 0,
  },
} as const;
