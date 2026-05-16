"use client";

/**
 * MEH-471 (Wave 1): LanguageProvider is now a delegating shim over
 * next-intl. Old API preserved for backward-compatibility with
 * unmigrated consumers — useLanguage() still returns {lang, setLang, t}.
 *
 * Internally:
 *   - lang     ← useLocale() from next-intl
 *   - setLang  → next-intl router replace (URL flip) + localStorage write
 *   - t(key)   → useTranslations() with old-key remap (lib/i18n-key-map.js)
 *
 * @deprecated Wave 2 (MEH-472) deletes this file entirely. Migrate any
 * remaining consumer to: useLocale() / useTranslations() / useRouter()
 * from next-intl directly.
 */

import { createContext, useCallback, useContext, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { mapKey } from "@/lib/i18n-key-map";

const LanguageContext = createContext(null);
const STORAGE_KEY = "lang";

export function LanguageProvider({ children }) {
  const lang = useLocale();
  const intlT = useTranslations();
  const router = useRouter();
  const pathname = usePathname();

  // One-time hydration: if user previously chose EN via the homegrown
  // toggle (localStorage.lang === "en"), redirect once to honor it.
  // Wave 2 deletes this entire effect once the cookie path is sole.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if ((saved === "en" || saved === "he") && saved !== lang) {
      router.replace(pathname, { locale: saved });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLang = useCallback(
    (newLang) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, newLang);
      }
      router.replace(pathname, { locale: newLang });
    },
    [router, pathname],
  );

  const t = useCallback((oldKey) => intlT(mapKey(oldKey)), [intlT]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
