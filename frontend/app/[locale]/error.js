"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { WarningCircle } from "@phosphor-icons/react";
import * as Sentry from "@sentry/nextjs";
import { useTranslations } from "next-intl";
import { BRAND_NAME } from "@/lib/constants";

export default function GlobalError({ error, reset }) {
  const t = useTranslations("errors.boundary");
  useEffect(() => {
    Sentry.captureException(error);
    if (process.env.NODE_ENV === "development") {
      console.error("[global error]", error);
    }
  }, [error]);

  return (
    <main className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
      <div className="text-center max-w-md">
        <Link href="/" className="inline-block mb-8" tabIndex={-1} aria-hidden="true">
          <Image src="/logo.png" alt={BRAND_NAME} width={120} height={40} className="mx-auto" />
        </Link>
        <WarningCircle
          size={72}
          color="#2e6853"
          className="mx-auto mb-5"
          aria-hidden="true"
        />
        <h1 className="font-headline-lg text-4xl font-bold text-text mb-3">
          {t("heading")}
        </h1>
        <p className="text-fg-muted text-lg mb-8 leading-relaxed">
          {t("message")}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="bg-primary text-white px-6 py-3 rounded-full hover:bg-primary-dark transition font-medium focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {t("retry")}
          </button>
          <Link
            href="/"
            className="border border-primary text-primary px-6 py-3 rounded-full hover:bg-green-50 transition font-medium focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {t("home")}
          </Link>
        </div>
        <p className="mt-6 text-sm text-fg-muted">
          {t("contact_prefix")}{" "}
          <Link href="/contact" className="text-primary underline underline-offset-2 hover:text-primary-dark transition">
            {t("contact_link")}
          </Link>
        </p>
        {process.env.NODE_ENV === "development" && error?.message && (
          <pre className="mt-8 text-left text-xs text-fg-muted bg-white border border-border rounded-[8px] p-4 overflow-auto max-h-40">
            {error.message}
          </pre>
        )}
      </div>
    </main>
  );
}
