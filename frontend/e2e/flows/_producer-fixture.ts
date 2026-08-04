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
import type { APIRequestContext } from "@playwright/test";

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
