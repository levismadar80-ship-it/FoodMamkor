"use client";

// MEH-2534: what the URL of a DELETED business shows. The backend answers 410
// for a slug held by an ownerless `retired_slugs` tombstone (MEH-2528), so the
// visitor is told the business left the site rather than "page not found" —
// the link she followed was real. Same layout as producer/[id]/not-found.js;
// the two buttons reuse its keys.
// MEH-2422: locale-aware Link, so the buttons keep /en on /en/… pages.
import { Link } from "@/i18n/navigation";
import { Leaf, MapTrifold, House } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

export default function ProducerGone() {
  const t = useTranslations("errors.producer_gone");
  const nav = useTranslations("errors.producer_not_found");
  return (
    <main
      data-testid="producer-gone"
      className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4"
    >
      <div className="text-center max-w-md">
        <Leaf size={72} className="mx-auto mb-4 text-primary" aria-hidden="true" />
        <h1 className="font-headline-lg text-3xl font-bold text-text mb-3">
          {t("heading")}
        </h1>
        <p className="text-fg-muted mb-8">{t("message")}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/map"
            className="inline-flex items-center justify-center gap-2 bg-primary text-white px-6 py-3 rounded-full hover:bg-primary-dark transition font-medium focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <MapTrifold size={18} aria-hidden="true" />
            {nav("discover")}
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 border border-primary text-primary px-6 py-3 rounded-full hover:bg-green-50 transition font-medium"
          >
            <House size={18} aria-hidden="true" />
            {nav("home")}
          </Link>
        </div>
      </div>
    </main>
  );
}
