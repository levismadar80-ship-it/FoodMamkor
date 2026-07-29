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
 * Related:  frontend/i18n/routing.js (locales + as-needed prefix),
 *           frontend/i18n/navigation.js (router/pathname exports),
 *           frontend/components/Header.jsx:400-402 (desktop pill —
 *           `variant="default"`, behind `hidden md:inline-flex`),
 *           frontend/components/AccountSheet.jsx:191 (mobile menu row —
 *           `variant="bare"`). TWO live consumers, one per viewport.
 * History:  MEH-475 (creation, 2026-05-19; closes the language toggle
 *           UI deliverable of Wave 5);
 *           MEH-1279 (variant="bare" — drops the 36px circle so the toggle
 *           sits flush inside a menu row next to size-19 sibling icons);
 *           MEH-1698 (desktop mount restored — MEH-896 removed it 21/06
 *           "until the EN i18n wave (MEH-472)" and MEH-472 never did, so
 *           /en was a one-way door on desktop for five weeks. This block
 *           also carried two claims that had gone false: robots.txt was
 *           said to hold `Disallow: /en/` — it does not and did not
 *           (frontend/public/robots.txt; flagged stale in
 *           docs/audits/2026-06-13-seo-meta.md:223) — and AccountSheet was
 *           called the sole consumer, which the restore ended).
 */
export default function LanguageToggle({ variant = "default", className = "", children }) {
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

  // MEH-1279: `variant="bare"` strips the standalone 36px circle chip so the
  // toggle can live inside a menu row flush with sibling bare icons (size 19),
  // with the caller owning the row layout via `className`. `children` render
  // after the Globe (e.g. AccountSheet's "עב / EN" affordance label), making
  // the whole row a single tap target. The default circular chip is unchanged.
  const bare = variant === "bare";
  const shellCls = bare
    ? ""
    : "flex items-center justify-center w-9 h-9 rounded-full hover:bg-black/10 transition focus-visible:ring-2 focus-visible:ring-primary/40";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={ariaLabel}
      data-testid="language-toggle"
      data-current-locale={locale}
      className={`${shellCls} ${className}`.trim()}
    >
      <Globe size={bare ? 19 : 20} weight="regular" aria-hidden="true" />
      {children}
    </button>
  );
}
