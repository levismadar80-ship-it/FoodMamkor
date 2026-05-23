"use client";

import { useLocale, useTranslations } from "next-intl";
import { Globe } from "@phosphor-icons/react";
import { useRouter, usePathname } from "@/i18n/navigation";

/**
 * Module:   LanguageToggle
 * Purpose:  Globe icon button that flips between HE ⇄ EN while preserving
 *           the current pathname AND query params. Replaces the legacy
 *           text-only toggle that lived in Header.jsx mobile drawer
 *           (which dropped query params via `router.replace(pathname)`).
 * Touches:  next-intl router (locale prefix + NEXT_LOCALE cookie via
 *           middleware), URL search params (preserved as-is).
 * Does NOT: Persist to localStorage (next-intl middleware handles cookie
 *           — the localStorage path in lib/language-context.js is a
 *           pre-Wave-1 backward-compat shim, separate concern).
 *           Toggle does NOT lift `Disallow: /en/` from robots.txt —
 *           that's a separate post-Wave-6 PR.
 * Related:  frontend/i18n/routing.js (locales + as-needed prefix),
 *           frontend/i18n/navigation.js (router/pathname exports),
 *           frontend/components/Header.jsx (consumer).
 * History:  MEH-475 (creation, 2026-05-19; closes the language toggle
 *           UI deliverable of Wave 5).
 */
export default function LanguageToggle({ className = "" }) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const nextLocale = locale === "he" ? "en" : "he";
  const ariaLabel = locale === "he" ? t("lang_switch_to_en") : t("lang_switch_to_he");

  const onToggle = () => {
    // Preserve query params + hash on locale flip. Reading window.location
    // here (event handler) rather than useSearchParams() avoids forcing
    // every page that mounts Header into CSR bailout — the hook variant
    // breaks static prerender for /privacy, /admin/producers, and any
    // other statically generated page that includes the global Header.
    // Suspense-wrapping LanguageToggle at the layout level would also
    // work but is overkill for a value that's only needed at click-time.
    // Legacy useLanguage().setLang() at language-context.js:49 dropped
    // query params silently — fixed here.
    if (typeof window !== "undefined") {
      // MEH-475: LanguageProvider's pre-Wave-1 backward-compat shim
      // (lib/language-context.js:35-42) reads `localStorage.lang` on mount
      // and force-redirects if the saved value doesn't match the URL
      // locale. Without writing here, every page navigation after the
      // toggle would flip the user back to the OLD locale (stale shim
      // wins over the just-set NEXT_LOCALE cookie). Write the shim's
      // storage key so both paths agree until MEH-472 deletes the shim.
      try {
        window.localStorage.setItem("lang", nextLocale);
      } catch {
        // private mode / quota — middleware cookie still flips the URL,
        // shim race only matters for users with localStorage enabled.
      }
    }
    const search = typeof window !== "undefined" ? window.location.search : "";
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const href = `${pathname}${search}${hash}`;
    router.replace(href, { locale: nextLocale });
  };

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={ariaLabel}
      data-testid="language-toggle"
      data-current-locale={locale}
      className={`flex items-center justify-center w-9 h-9 rounded-full hover:bg-black/10 transition focus-visible:ring-2 focus-visible:ring-primary/40 ${className}`}
    >
      <Globe size={20} weight="regular" aria-hidden="true" />
    </button>
  );
}
