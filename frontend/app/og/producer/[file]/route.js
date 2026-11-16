// @ts-check
/**
 * Module:   og/producer/[file]/route
 * Purpose:  GET /og/producer/<slug>.png — the branded link-preview image of a
 *           business page with no photo (MEH-3329): a typographic card, ~50KB
 *           PNG, under WhatsApp's 300KB. lib/seo.js points og:image here
 *           with `?v=<updated_at>`, so an edited page gets a new URL and
 *           Facebook's cache cannot serve the old card.
 * Touches:  GET /producers/by-slug/{slug} (backend).
 * Does NOT: decide which URL the page advertises (lib/seo.js), or lay out the
 *           card (lib/og-producer-card.js). Any failure — unknown slug, gone
 *           business, backend down — redirects to the site image rather than
 *           erroring: a broken preview is worse than a generic one.
 * Related:  app/[locale]/[slug]/page.js getProducerBySlug (same endpoint).
 * History:  MEH-3329 (creation).
 */
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { API_URL } from "@/lib/env";
import { serverFetch } from "@/lib/server-fetch";
import { isSlugShaped, decodeSlugParam } from "@/lib/slug";
import { OG_SIZE, producerCard, markSrc } from "@/lib/og-producer-card";

const FALLBACK = "/og-image.png";
const CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

const FONT_DIR = join(process.cwd(), "app", "og", "producer", "[file]", "fonts");

// Static assets, read once per server instance, lazily — a failed read lands
// in the request's catch (→ site image), never as an unhandled rejection.
// Paths built from process.cwd(), as in the Next opengraph-image guide, so
// output tracing ships the files with the route.
let assets = null;
function loadAssets() {
  assets ??= Promise.all([
    readFile(join(FONT_DIR, "FrankRuhlLibre-Bold.ttf")),
    readFile(join(FONT_DIR, "Heebo-Regular.ttf")),
    readFile(join(process.cwd(), "public", "favicon.svg"), "utf8"),
  ]).catch((err) => {
    assets = null;
    throw err;
  });
  return assets;
}

async function getProducer(slug) {
  if (!isSlugShaped(slug)) return null;
  const res = await serverFetch(`${API_URL}/producers/by-slug/${encodeURIComponent(slug)}`, {
    next: { revalidate: 3600 },
  });
  return res.ok ? res.json() : null;
}

/** @param {Request} request @param {{ params: Promise<{ file: string }> }} ctx */
export async function GET(request, ctx) {
  const { file } = await ctx.params;
  const slug = decodeSlugParam(String(file || "").replace(/\.png$/i, ""));
  try {
    const producer = await getProducer(slug);
    if (!producer?.name) return Response.redirect(new URL(FALLBACK, request.url), 302);
    const [frank, heebo, mark] = await loadAssets();
    const element = producerCard({
      name: producer.name,
      type: producer.categories?.[0]?.name || "",
      city: producer.city || "",
      // Photo template parked: a photo card is ~690KB as PNG, over WhatsApp's
      // 300KB, and needs a JPEG encoder (see MEH-3329 PR). Only the
      // typographic card ships; a business with a photo keeps its photo.
      photo: null,
      mark: markSrc(mark),
    });
    const png = Buffer.from(
      await new ImageResponse(/** @type {any} */ (element), {
        ...OG_SIZE,
        fonts: [
          { name: "Frank", data: frank, weight: 700, style: "normal" },
          { name: "Heebo", data: heebo, weight: 400, style: "normal" },
        ],
      }).arrayBuffer(),
    );
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": CACHE } });
  } catch {
    return Response.redirect(new URL(FALLBACK, request.url), 302);
  }
}
