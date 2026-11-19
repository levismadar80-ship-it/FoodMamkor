// @ts-check
"use client";

/**
 * Module:   OrdersIntroCard
 * Purpose:  «חדש: הזמנות מראש מהעמוד שלכם» — tells a business that on-site
 *           ordering exists and takes it to the «הזמנות» tab. Shown once, on
 *           the dashboard home, until she closes it, taps through, or turns
 *           ordering on. Copy approved word for word by Sapir 19/11.
 * Touches:  GET /producers/me/order-settings (404 = ordering off on this
 *           server → no card) · window.localStorage (the close).
 * Does NOT: decide the home slot's order — page.js does: welcome → first
 *           moment → this → «חדש במהמקור». Renders `fallback` whenever it
 *           has nothing to say, so the slot never goes empty because of it.
 * History:  MEH-3216 (creation)
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Basket } from "@phosphor-icons/react";
import { Link } from "@/i18n/navigation";
import { loadSettings } from "@/lib/product-orders";

export const ORDERS_INTRO_KEY = "mehamakor.orders_intro_closed";
const ORDERS_HREF = "/producer/dashboard/orders";

function wasClosed() {
  try {
    return window.localStorage.getItem(ORDERS_INTRO_KEY) === "1";
  } catch {
    return false;
  }
}

function close() {
  try {
    window.localStorage.setItem(ORDERS_INTRO_KEY, "1");
  } catch {
    // Private mode: the card comes back next visit, nothing breaks.
  }
}

/** @param {{ fallback?: import("react").ReactNode }} props */
export default function OrdersIntroCard({ fallback = null }) {
  const t = useTranslations("dashboard.producer.orders.intro");
  const [show, setShow] = useState(/** @type {boolean | null} */ (null));
  useEffect(() => {
    if (wasClosed()) return setShow(false);
    let live = true;
    loadSettings()
      .then((settings) => live && setShow(Boolean(settings) && !settings?.enabled))
      .catch(() => live && setShow(false));
    return () => {
      live = false;
    };
  }, []);
  if (show === null) return null;
  if (!show) return <>{fallback}</>;
  const dismiss = () => {
    close();
    setShow(false);
  };
  return (
    <section data-testid="orders-intro-card" aria-labelledby="orders-intro-heading" className="bg-surface border border-primary rounded-lg p-4 mb-6 space-y-2">
      <h2 id="orders-intro-heading" className="flex items-center gap-2 font-semibold text-text">
        <Basket size={22} aria-hidden="true" className="shrink-0 text-primary" />
        {t("title")}
      </h2>
      <p className="text-sm text-text">{t("body")}</p>
      <div className="flex items-center gap-3">
        <Link
          href={ORDERS_HREF}
          onClick={close}
          data-testid="orders-intro-cta"
          className="min-h-touch inline-flex items-center rounded-full px-4 bg-primary text-background text-sm font-medium hover:bg-primary-dark transition focus-ring"
        >
          {t("cta")}
        </Link>
        <button type="button" onClick={dismiss} data-testid="orders-intro-later" className="min-h-touch inline-flex items-center px-2 rounded text-sm text-fg-muted hover:text-text focus-ring">
          {t("later")}
        </button>
      </div>
    </section>
  );
}
