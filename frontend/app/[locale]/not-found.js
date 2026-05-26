"use client";

import Image from "next/image";
import Link from "next/link";
import { Leaf } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { BRAND_NAME } from "@/lib/constants";

export default function NotFound() {
  const t = useTranslations("errors.not_found");
  return (
    <main className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
      <div className="text-center max-w-md">
        <Link href="/" className="inline-block mb-8" tabIndex={-1} aria-hidden="true">
          <Image src="/logo.png" alt={BRAND_NAME} width={120} height={40} className="mx-auto" />
        </Link>
        <Leaf
          size={72}
          weight="duotone"
          color="#2e6853"
          className="mx-auto mb-5"
          aria-hidden="true"
        />
        <p className="text-primary font-medium text-sm tracking-widest mb-2">404</p>
        <h1 className="font-headline text-4xl font-bold text-site-text mb-3">
          {t("heading")}
        </h1>
        <p className="text-fg-muted text-lg mb-8 leading-relaxed">
          {t("message")}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="bg-primary text-white px-6 py-3 rounded-full hover:bg-primary-light transition font-medium focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {t("home")}
          </Link>
          <Link
            href="/map"
            className="border border-primary text-primary px-6 py-3 rounded-full hover:bg-light transition font-medium"
          >
            {t("discover")}
          </Link>
        </div>
      </div>
    </main>
  );
}
