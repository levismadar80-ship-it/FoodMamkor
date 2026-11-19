// @ts-check
"use client";

/**
 * Module:   OrderSetupChecklist
 * Purpose:  «מה חסר כדי לקבל הזמנות» — the four things a business needs
 *           before customers can order, each with a ✓ once done, at the top of
 *           the «הזמנות» tab. Copy approved word for word by Sapir 19/11.
 * Does NOT: save anything or read the server. The page hands it the state it
 *           already loaded; the cards below it are where each step is done.
 *           Renders nothing while the products are unknown, and nothing when
 *           everything was already done on arrival (0 steps left). When the
 *           last step is done here, it says «הכל מוכן» instead.
 * Related:  app/[locale]/producer/dashboard/orders/page.js · lib/product-orders.js isSetUp
 * History:  MEH-3216 (creation; the business was not told what is missing)
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle, Circle } from "@phosphor-icons/react";
import { Link } from "@/i18n/navigation";

const EDIT_HREF = "/producer/dashboard/edit";

/**
 * The steps, in the order the cards ask for them.
 * @param {{ settings: any, windowsCount: number, orderableCount: number, hasProducts?: boolean }} state
 *   hasProducts false: the products card is not on this page (it renders
 *   nothing with 0 products), so the step links to «עריכה», where products are added.
 */
export function setupSteps({
  settings,
  windowsCount,
  orderableCount,
  hasProducts = true,
}) {
  return [
    {
      key: "business_id",
      done: Boolean(settings?.business_id_number),
      href: "#order-settings",
    },
    { key: "windows", done: windowsCount > 0, href: "#order-windows" },
    {
      key: "product",
      done: orderableCount > 0,
      href: hasProducts ? "#order-products" : EDIT_HREF,
    },
    {
      key: "enabled",
      done: Boolean(settings?.enabled),
      href: "#order-settings",
    },
  ];
}

/**
 * A step's card can start folded (the page folds them once set up). A hash
 * jump does not open a closed <details>, so open it before the jump.
 * @param {string} href
 */
function openCard(href) {
  if (!href.startsWith("#")) return;
  const card = document.getElementById(href.slice(1));
  if (card instanceof HTMLDetailsElement) card.open = true;
}

/** @param {{ settings: any, windowsCount: number, orderableCount: number | null, hasProducts?: boolean }} props */
export default function OrderSetupChecklist({
  settings,
  windowsCount,
  orderableCount,
  hasProducts = true,
}) {
  const t = useTranslations("dashboard.producer.orders.checklist");
  // The same done / to-do words the profile checklist reads to a screen reader.
  const tDone = useTranslations("dashboard.producer.completeness");
  const [sawMissing, setSawMissing] = useState(false);
  const steps = setupSteps({
    settings,
    windowsCount,
    orderableCount: orderableCount ?? 0,
    hasProducts,
  });
  const known = orderableCount !== null;
  const missing = known && steps.some((step) => !step.done);
  useEffect(() => {
    if (missing) setSawMissing(true);
  }, [missing]);
  if (!known) return null;
  if (!missing) {
    if (!sawMissing) return null;
    return (
      <p
        role="status"
        data-testid="order-setup-done"
        className="flex items-center gap-2 rounded-lg border border-primary bg-surface p-4 text-text"
      >
        <CheckCircle
          size={22}
          weight="fill"
          aria-hidden="true"
          className="shrink-0 text-primary"
        />
        {t("done")}
      </p>
    );
  }
  return (
    <section
      aria-labelledby="order-setup-title"
      data-testid="order-setup"
      className="rounded-lg border border-primary bg-surface p-4 space-y-2"
    >
      <h2 id="order-setup-title" className="font-bold text-lg text-text">
        {t("title")}
      </h2>
      <ul className="space-y-1">
        {steps.map((step) => {
          // A step on this page is an in-page jump; «עריכה» is another page.
          const Go = /** @type {any} */ (
            step.href.startsWith("#") ? "a" : Link
          );
          return (
            <li
              key={step.key}
              data-testid={`order-setup-${step.key}`}
              data-done={step.done}
            >
              <Go
                href={step.href}
                onClick={() => openCard(step.href)}
                className="flex items-center gap-2 min-h-touch text-text focus-ring rounded-sm"
              >
                {step.done ? (
                  <CheckCircle
                    size={22}
                    weight="fill"
                    aria-hidden="true"
                    className="shrink-0 text-primary"
                  />
                ) : (
                  <Circle
                    size={22}
                    aria-hidden="true"
                    className="shrink-0 text-fg-muted"
                  />
                )}
                <span className={step.done ? "text-fg-muted" : ""}>
                  {t(step.key)}
                </span>
                <span className="sr-only">
                  {tDone(step.done ? "checklist_done" : "checklist_todo")}
                </span>
              </Go>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
