"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

const LanguageContext = createContext(null);

const STORAGE_KEY = "lang";

/**
 * Foundation-layer translations. Only covers navigation, hero, CTAs,
 * footer column headers, and search — per the spec. Producer names,
 * cities, product data, micro-copy (🌿 flourishes), loading/error
 * states all stay in Hebrew.
 */
const translations = {
  he: {
    // Header + BottomNav
    nav_discover: "גלה",
    nav_map: "מפה",
    nav_events: "אירועים",
    nav_neighbor: "מהשכן",
    nav_about: "אודות",
    nav_favorites: "מועדפים",
    nav_admin: "אדמין",
    nav_login: "כניסה לחשבון",
    nav_logout: "התנתק",
    nav_add_business: "הוסיפי את העסק שלך",
    nav_mobile_label: "ניווט מובייל",
    nav_profile: "פרופיל",

    // Hero
    hero_title: "האוכל הכי טוב קרוב אלייך. פשוט לא ידעת איפה.",
    hero_subtitle: "בתי עסק מקומיים, כולם במקום אחד.",
    search_placeholder: "לחם מחמצת, ביצים אורגניות, ירקות ופירות",
    search_sr_label: "חיפוש בתי עסק וערים",
    search_submit: "חיפוש",

    // Footer columns
    footer_discover: "לגלות",
    footer_community: "קהילה",
    footer_businesses: "בתי עסק",
    footer_trust: "שקיפות ואמון",
    footer_home: "דף הבית",
    footer_map: "מפה",
    footer_all_businesses: "כל העסקים",
    footer_new_businesses: "עסקים חדשים",
    footer_events: "אירועים",
    footer_neighbor_kitchen: "מהמטבח של השכן",
    footer_about: "אודות",
    footer_add_business: "הוסיפי את העסק שלך",
    footer_login: "כניסה לחשבון",
    footer_manage: "ניהול העסק",
    footer_terms: "תנאי שימוש",
    footer_privacy: "מדיניות פרטיות",
    footer_accessibility: "הצהרת נגישות",
    footer_contact: "יצירת קשר",
    footer_copyright: "מהמקור. כל הזכויות שמורות.",
    footer_made_with_love: "נעשה באהבה בישראל 🌿",

    // Main CTAs
    cta_show_on_map: "הצג במפה",
    cta_more_info: "לפרופיל המלא",
  },
  en: {
    // Header + BottomNav
    nav_discover: "Discover",
    nav_map: "Map",
    nav_events: "Events",
    nav_neighbor: "Neighbor",
    nav_about: "About",
    nav_favorites: "Favorites",
    nav_admin: "Admin",
    nav_login: "Sign In",
    nav_logout: "Sign Out",
    nav_add_business: "Add Your Business",
    nav_mobile_label: "Mobile navigation",
    nav_profile: "Profile",

    // Hero
    hero_title: "Real Food, Straight From the Source",
    hero_subtitle: "Local businesses, all in one place.",
    search_placeholder: "Search fresh veggies, grass-fed beef...",
    search_sr_label: "Search businesses and cities",
    search_submit: "Search",

    // Footer columns
    footer_discover: "Discover",
    footer_community: "Community",
    footer_businesses: "Businesses",
    footer_trust: "Trust & Transparency",
    footer_home: "Home",
    footer_map: "Map",
    footer_all_businesses: "All Businesses",
    footer_new_businesses: "New Businesses",
    footer_events: "Events",
    footer_neighbor_kitchen: "Neighbor's Kitchen",
    footer_about: "About",
    footer_add_business: "Add Your Business",
    footer_login: "Sign In",
    footer_manage: "Manage Business",
    footer_terms: "Terms of Service",
    footer_privacy: "Privacy Policy",
    footer_accessibility: "Accessibility",
    footer_contact: "Contact Us",
    footer_copyright: "Mehamakor. All rights reserved.",
    footer_made_with_love: "Made with love in Israel 🌿",

    // Main CTAs
    cta_show_on_map: "Show on Map",
    cta_more_info: "More Info",
  },
};

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState("he");

  // Read saved preference on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "he") {
      setLangState(saved);
    }
  }, []);

  // Sync <html> lang + dir whenever language changes
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback((newLang) => {
    setLangState(newLang);
    localStorage.setItem(STORAGE_KEY, newLang);
  }, []);

  const t = useCallback(
    (key) => translations[lang]?.[key] ?? translations.he[key] ?? key,
    [lang],
  );

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
