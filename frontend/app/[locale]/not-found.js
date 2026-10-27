"use client";

// MEH-2422: locale-aware Link — next/link dropped /en (localePrefix
// as-needed), so "back to home" on /en/… landed on the Hebrew home.
import { Link } from "@/i18n/navigation";
import { Leaf } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

// MEH-2422: no logo of its own — the site header above already carries it
// (here and in the global 404, which now renders the same chrome).
export default function NotFound() {
  const t = useTranslations("errors.not_found");
  return (
    // A <div>, not <main>: both callers already wrap this in #main-content.
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
      <div className="text-center max-w-md">
        <Leaf
          size={72}
          color="#2e6853"
          className="mx-auto mb-5"
          aria-hidden="true"
        />
        <p className="text-primary font-medium text-sm tracking-widest mb-2">404</p>
        <h1 className="font-headline-lg text-4xl font-bold text-text mb-3">
          {t("heading")}
        </h1>
        <p className="text-fg-muted text-lg mb-8 leading-relaxed">
          {t("message")}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="bg-primary text-white px-6 py-3 rounded-full hover:bg-primary-dark transition font-medium focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {t("home")}
          </Link>
          <Link
            href="/map"
            className="border border-primary text-primary px-6 py-3 rounded-full hover:bg-green-50 transition font-medium focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {t("discover")}
          </Link>
        </div>
      </div>
    </div>
  );
}
