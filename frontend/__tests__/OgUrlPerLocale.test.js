/**
 * MEH-0000 — og:url is the page's OWN locale, and the shared openGraph object
 * owns no `url` at all.
 *
 * The defect: `BASE_METADATA.openGraph` in app/[locale]/layout.js carried a
 * static `url: SITE_URL`. Next merges metadata per FIELD, so a page that sets
 * no `openGraph` of its own inherits that whole object — and claimed the
 * Hebrew HOME as its og:url, /en included. A shared /en link previewed, and
 * for a crawler that trusts og:url canonicalised, to the wrong page.
 *
 * This is the same shape MEH-2853 fixed for `title` and `twitter.title` two
 * fields away in the same object; `url` is the field that fix missed. The
 * per-locale cases live in LayoutMetadataLocale.test.js's neighbourhood
 * conceptually, but keep their own file so a grep for og:url lands here.
 *
 * Mocks are the set LayoutMetadataLocale.test.js established: layout.js pulls
 * in globals.css and next/font/local through app/fonts, neither of which a
 * vitest environment can evaluate.
 */
import { describe, it, expect, vi } from "vitest";
import { createTranslator } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";

const MESSAGES = { he, en };
vi.mock("../app/globals.css", () => ({}));
vi.mock("@/app/fonts", () => ({ FONT_VARIABLES: "" }));
vi.mock("../app/fonts", () => ({ FONT_VARIABLES: "" }));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }) =>
    createTranslator({ locale, messages: MESSAGES[locale], namespace }),
  getMessages: async () => ({}),
  setRequestLocale: () => {},
}));
for (const m of [
  "@/components/Header", "@/components/VerifyBanner", "@/components/FooterSlot",
  "@/components/BottomNav", "@/components/Toaster", "@/components/CookieBanner",
  "@/components/IosViewportPin", "@/components/SmoothScrollProvider",
  "@/components/CustomCursor", "@/components/ChatWidgetLazy",
  "@/components/InstallPrompt", "@/components/PrehydrationInputReplay",
  "@/components/ClarityScript", "@/components/SpeedInsightsRedacted",
]) vi.doMock(m, () => ({ default: () => null }));

describe("og:url is the page's own locale", () => {
  // The control, and it runs first. Every other case here reads a field off
  // generateMetadata's return value — if an import or a mock broke, that object
  // would be empty and "og:url is not the Hebrew home" would be vacuously true.
  it("generateMetadata returns a populated openGraph and alternates", async () => {
    const { generateMetadata } = await import("@/app/[locale]/layout");
    const m = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });
    expect(m.openGraph).toBeTruthy();
    expect(m.alternates).toBeTruthy();
    expect(typeof m.openGraph.url).toBe("string");
    expect(m.openGraph.url.length).toBeGreaterThan(0);
  });

  it("en: og:url is the en home, not the Hebrew home", async () => {
    const { urlForLocalePath } = await import("@/lib/i18n-seo");
    const { generateMetadata } = await import("@/app/[locale]/layout");
    const m = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });
    expect(m.openGraph.url).toBe(urlForLocalePath("/", "en"));
    // The discriminating half: before the fix this WAS the bare SITE_URL,
    // which is the he home.
    expect(m.openGraph.url).not.toBe(urlForLocalePath("/", "he"));
  });

  it("he: og:url is the he home", async () => {
    const { urlForLocalePath } = await import("@/lib/i18n-seo");
    const { generateMetadata } = await import("@/app/[locale]/layout");
    const m = await generateMetadata({ params: Promise.resolve({ locale: "he" }) });
    expect(m.openGraph.url).toBe(urlForLocalePath("/", "he"));
  });

  it("og:url and canonical agree, in both locales", async () => {
    const { generateMetadata } = await import("@/app/[locale]/layout");
    for (const locale of ["he", "en"]) {
      const m = await generateMetadata({ params: Promise.resolve({ locale }) });
      expect(m.openGraph.url).toBe(m.alternates.canonical);
    }
  });
});

describe("og:url has one owner", () => {
  // Read the SOURCE, because an inherited value only appears on a page that
  // sets no openGraph, and this file renders none. Without this case a future
  // edit could put `url` back on the shared object and every assertion above
  // would still pass.
  it("the shared BASE_METADATA.openGraph sets no url", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(
      path.join(here, "..", "app", "[locale]", "layout.js"),
      "utf8",
    );
    const from = src.indexOf("const BASE_METADATA");
    const to = src.indexOf("export async function generateMetadata");
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    const base = src.slice(from, to);
    const ogAt = base.indexOf("  openGraph: {");
    // Two controls for this case, because the assertion below is a NEGATIVE
    // and both a missing slice and a renamed key would satisfy it silently.
    expect(ogAt).toBeGreaterThan(-1);
    const og = base.slice(ogAt);
    expect(og).toContain("siteName");

    // A DIRECT property of that object sits at 4 spaces. `images:` nests one
    // whose own `url:` is at 8 — that one is the og:image and must stay. An
    // earlier draft matched /^\s*url:/ and reddened on exactly that, which is
    // why the depth is pinned rather than the word.
    const directProps = og
      .split("\n")
      .filter((l) => /^ {4}\w/.test(l))
      .map((l) => l.trim().split(":")[0]);
    expect(directProps).toContain("siteName");
    expect(directProps).not.toContain("url");
  });
});
