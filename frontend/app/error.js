"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Global error boundary (LAUNCH_CHECKLIST week 3).
 * Next.js App Router renders this file as a fallback when a client-side
 * error escapes any nested error boundary. Must be a client component.
 *
 * Keeps the warm brand aesthetic even in an error state.
 */
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    // Log to stderr in dev; in production this would send to Sentry.
    if (typeof console !== "undefined") {
      console.error("[global error]", error);
    }
  }, [error]);

  return (
    <main className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-7xl mb-4" aria-hidden="true">
          🌱
        </div>
        <h1 className="font-headline text-4xl font-bold text-site-text mb-3">
          משהו השתבש
        </h1>
        <p className="text-site-muted text-lg mb-8 leading-relaxed">
          הדף הזה לא הצליח להיטען הפעם. אפשר לנסות שוב — לרוב זה עובד בפעם השנייה 🌿
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
            חזרה לדף הבית
          </Link>
        </div>
        {process.env.NODE_ENV === "development" && error?.message && (
          <pre className="mt-8 text-left text-xs text-site-muted bg-white border border-border rounded-[8px] p-4 overflow-auto max-h-40">
            {error.message}
          </pre>
        )}
      </div>
    </main>
  );
}
