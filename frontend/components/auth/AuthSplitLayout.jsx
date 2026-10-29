"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { optimizeCloudinary } from "@/lib/cloudinary";

/**
 * Module:   AuthSplitLayout
 * Purpose:  The account-page template /login set (MEH-788 split editorial,
 *           MEH-839 "Two Doors" open form on cream, MEH-2397 no image band on
 *           phones): form pane at the inline-start, photo pane with the
 *           «טרי · מקומי · מהמקור» overlay at the inline-end from lg up only.
 *           MEH-2568 moves /forgot-password and /reset-password onto it — they
 *           were a white card with a leaf badge, a third look for the same
 *           family of pages.
 *
 * Props:    title (h1), subtitle, children (the form), testIds, heroSrc
 *           (defaults to the /login photo).
 * Does NOT: own any form logic or copy beyond the shared overlay key.
 */
const DEFAULT_HERO = "https://res.cloudinary.com/dfzpscjks/image/upload/login/hero-produce-crate.jpg";

export default function AuthSplitLayout({ title, subtitle, children, heroSrc = DEFAULT_HERO, testId }) {
  const t = useTranslations("auth.login");
  return (
    <div
      className="min-h-[calc(100vh-180px)] flex flex-col bg-background lg:grid lg:grid-cols-2"
      data-testid={testId}
    >
      <div className="relative hidden lg:block lg:order-2 overflow-hidden" data-testid="auth-hero-pane">
        <Image src={optimizeCloudinary(heroSrc)} alt="" fill sizes="(min-width: 1024px) 50vw" className="object-cover" />
        <div
          className="absolute inset-0 bg-gradient-to-t from-green-900/90 via-green-900/30 to-transparent"
          aria-hidden="true"
        />
        <div className="absolute inset-x-0 bottom-0 p-6 lg:p-10">
          <p className="font-headline-display font-black text-2xl lg:text-4xl leading-tight text-green-50">
            {t("hero_overlay")}
          </p>
        </div>
      </div>

      <div className="lg:order-1 flex items-center justify-center px-4 py-12 md:py-16">
        <div className="w-full max-w-[416px] mx-auto grid gap-6" data-testid="auth-form-pane">
          {(title || subtitle) && (
            <div className="grid gap-2 text-start">
              {title && (
                <h1 className="font-headline-lg font-black text-headline-lg leading-tight text-text">{title}</h1>
              )}
              {subtitle && <p className="text-fg-muted text-sm">{subtitle}</p>}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
