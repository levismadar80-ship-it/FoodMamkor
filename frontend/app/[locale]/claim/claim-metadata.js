// @ts-check
import { getTranslations } from "next-intl/server";
import { API_URL } from "@/lib/env";
import { serverFetch } from "@/lib/server-fetch";
import { ogImage } from "@/lib/seo";
import { BRAND_NAME } from "@/lib/constants";

// MEH-2324: shared by /claim and /claim/[token]. The page is a private
// invitation, so it is never indexed and never followed. It sets no alternates
// of its own, because they would print the path, and on /claim/[token] the
// path is the credential. The layout's (the home page) are inherited, which is
// harmless on a noindex page.
//
// MEH-3403: the link is sent on WhatsApp, and its preview is the first thing
// the owner sees. With a token that still works, the preview names HER
// business and shows its main photo. The token goes to the backend in a POST
// body (the same /producer-claim/preview the page itself calls) and is written
// into no tag: no og:url, no canonical — the path is the credential. An
// expired, revoked or unreadable token, or any backend failure, keeps the
// generic card of before, with no business name.

const PREVIEW_TIMEOUT_MS = 3000;
// The layout's own default cards (app/[locale]/layout.js), per locale.
const SITE_OG_IMAGE = { he: "/og-image.jpg", en: "/og-image-en.jpg" };

/** Only a Cloudinary photo becomes the card: the crawler fetches whatever
 * host is named here, and the photo of a draft is ours, never a third party's.
 * @param {unknown} url */
function cloudinaryOnly(url) {
  if (typeof url !== "string") return null;
  try {
    return new URL(url).hostname === "res.cloudinary.com" ? ogImage(url) : null;
  } catch {
    return null;
  }
}

/** @param {string | undefined} token */
async function claimPreview(token) {
  if (!token) return null;
  try {
    const res = await serverFetch(
      `${API_URL}/producer-claim/preview`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        cache: "no-store",
      },
      { timeoutMs: PREVIEW_TIMEOUT_MS, retries: 0 },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.name === "string" && data.name.trim() ? data : null;
  } catch {
    return null;
  }
}

/** @param {Promise<{ locale: string, token?: string }>} params */
export async function claimMetadata(params) {
  const { locale, token } = await params;
  const t = await getTranslations({ locale, namespace: "seo.claim" });
  const base = {
    // MEH-2853: plain title — the layout template `%s | <brand>` adds the brand.
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
  const preview = await claimPreview(token);
  if (!preview) return base;

  // The named title already says «במהמקור», so it skips the brand template.
  const title = t("title_named", { name: preview.name.trim() });
  const image =
    cloudinaryOnly(preview.image) || (locale === "en" ? SITE_OG_IMAGE.en : SITE_OG_IMAGE.he);
  return {
    ...base,
    title: { absolute: title },
    openGraph: {
      title,
      description: t("description"),
      images: [{ url: image, width: 1200, height: 630 }],
      type: "website",
      locale: locale === "en" ? "en_US" : "he_IL",
      siteName: BRAND_NAME,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: t("description"),
      images: [image],
    },
  };
}
