"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * RTL-friendly breadcrumb trail.
 *
 * Usage:
 *   <Breadcrumb items={[
 *     { href: "/", label: "בית" },
 *     { href: "/events", label: "אירועים" },
 *     { label: event.title },  // last item = current page, no href
 *   ]} />
 */
export default function Breadcrumb({ items = [], className = "" }) {
  const t = useTranslations("common.breadcrumb");
  if (!items.length) return null;

  return (
    <nav
      aria-label={t("aria")}
      className={`text-sm text-site-muted ${className}`}
    >
      <ol className="flex flex-wrap items-center gap-x-1">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center">
              {item.href && !isLast ? (
                <Link href={item.href} className="hover:text-primary transition">
                  {item.label}
                </Link>
              ) : (
                <span
                  className={isLast ? "text-site-text font-medium" : ""}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
              {!isLast && (
                <span className="mx-2 opacity-60" aria-hidden="true">
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
