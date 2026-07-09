import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["he", "en"],
  defaultLocale: "he",
  localePrefix: "as-needed",
  // MEH-1045: without this, next-intl's default (true) Accept-Language
  // negotiation 307-redirects cookie-less clients (i.e. most bots) from
  // "/" to "/en" — every root hit costs ×2 edge requests. SEO stays
  // intact: hreflang alternates are emitted per page (MEH-476) and /en
  // stays directly reachable via its prefix.
  localeDetection: false,
});
