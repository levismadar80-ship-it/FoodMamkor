"use client";

import Link from "next/link";
import { Leaf, MapTrifold, House } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

export default function ProducerNotFound() {
  const t = useTranslations("errors.producer_not_found");
  return (
    <main className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <Leaf
          size={72}
          weight="duotone"
          color="#2e6853"
          className="mx-auto mb-4"
          aria-hidden="true"
        />
        <h1 className="font-headline text-3xl font-bold text-site-text mb-3">
          {t("heading")}
        </h1>
        <p className="text-fg-muted mb-8">
          {t("message")}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/map"
            className="inline-flex items-center justify-center gap-2 bg-primary text-white px-6 py-3 rounded-full hover:bg-primary-dark transition font-medium focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <MapTrifold size={18} weight="duotone" />
            {t("discover")}
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 border border-primary text-primary px-6 py-3 rounded-full hover:bg-green-50 transition font-medium"
          >
            <House size={18} weight="duotone" />
            {t("home")}
          </Link>
        </div>
      </div>
    </main>
  );
}
