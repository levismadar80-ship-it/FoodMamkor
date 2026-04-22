"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { WarningCircle } from "@phosphor-icons/react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({ error, reset }) {
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
          <Image src="/logo.png" alt="מהמקור" width={120} height={40} className="mx-auto" />
        </Link>
        <WarningCircle
          size={72}
          weight="duotone"
          color="#2e6853"
          className="mx-auto mb-5"
          aria-hidden="true"
        />
        <h1 className="font-headline text-4xl font-bold text-site-text mb-3">
          משהו השתבש — נסי שוב
        </h1>
        <p className="text-site-muted text-lg mb-8 leading-relaxed">
          הדף לא הצליח להיטען הפעם. לרוב זה עובד בפעם השנייה.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="bg-primary text-white px-6 py-3 rounded-full hover:bg-primary-light transition font-medium focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            נסי שוב
          </button>
          <Link
            href="/"
            className="border border-primary text-primary px-6 py-3 rounded-full hover:bg-light transition font-medium"
          >
            חזרי לדף הבית
          </Link>
        </div>
        <p className="mt-6 text-sm text-site-muted">
          אם זה ממשיך,{" "}
          <Link href="/contact" className="text-primary underline underline-offset-2 hover:text-primary-light transition">
            כתבי לנו
          </Link>
        </p>
        {process.env.NODE_ENV === "development" && error?.message && (
          <pre className="mt-8 text-left text-xs text-site-muted bg-white border border-border rounded-[8px] p-4 overflow-auto max-h-40">
            {error.message}
          </pre>
        )}
      </div>
    </main>
  );
}
