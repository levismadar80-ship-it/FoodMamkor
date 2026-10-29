import { buildEntityTitle } from "@/lib/i18n-seo";
import ProducerGone from "../[slug]/ProducerGone";

// MEH-2576: the middleware rewrites the URL of a DELETED business here (the
// browser keeps the old URL). It cannot be the [slug] page: that page reads
// the business through Next's Data Cache, which only stores 200s — after the
// delete, the revalidating 410 is discarded and the cached 200 keeps serving
// the live business page. The middleware's own lookup is uncached, so it is
// the one that knows. Not a status rewrite: on Vercel a 410 from middleware
// is served as the platform's own "deployment removed" page.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return {
    title: { absolute: buildEntityTitle(null, locale) },
    robots: { index: false, follow: false },
  };
}

export default function BusinessGonePage() {
  return <ProducerGone />;
}
