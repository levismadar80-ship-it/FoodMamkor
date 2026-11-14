// @ts-check
"use client";
/**
 * Module:   use-dashboard-title
 * Purpose:  give every owner-dashboard screen its own <title> (WCAG 2.4.2):
 *           «<tab label> | <brand>». The dashboard pages are client pages
 *           with no metadata of their own, so every screen used to carry the
 *           generic site title and a screen reader could not tell them apart.
 * Does NOT: decide which tab is active (DashboardLayoutClient's isActive).
 * History:  MEH-3191 (creation).
 */
import { useEffect } from "react";
import { BRAND_NAME, BRAND_NAME_LATIN } from "@/lib/constants";

/**
 * @param {string | null | undefined} label  the active tab's visible label
 * @param {string} locale
 * @returns {string | null}  null when there is no label (keep the page's title)
 */
export function dashboardTitle(label, locale) {
  if (!label) return null;
  return `${label} | ${locale === "en" ? BRAND_NAME_LATIN : BRAND_NAME}`;
}

/**
 * @param {string | null | undefined} label
 * @param {string} locale
 * @param {string} pathname  re-run on every navigation (a defensive re-apply;
 *                           not observed that Next resets it)
 */
export function useDashboardTitle(label, locale, pathname) {
  useEffect(() => {
    const title = dashboardTitle(label, locale);
    if (!title) return undefined;
    const previous = document.title;
    document.title = title;
    // A screen with no tab (or leaving the dashboard) must not keep the last
    // tab's title: restore what was there before this tab set it.
    return () => {
      if (document.title === title) document.title = previous;
    };
  }, [label, locale, pathname]);
}
