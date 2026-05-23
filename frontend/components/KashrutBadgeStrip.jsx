"use client";

import { useTranslations, useFormatter } from "next-intl";

// Display-only metadata = none. Labels + tooltips resolve via
// t(`kashrut.badges.${key}.label`/`tooltip`). The `code` axis is the
// API contract from the backend (snake-cased in messages: `organic-kosher`
// → `organic_kosher`, `artisan-dairy` → `artisan_dairy`).
const CODE_TO_KEY = {
  rabanut: "rabanut",
  badatz: "badatz",
  chalak: "chalak",
  mehadrin: "mehadrin",
  "organic-kosher": "organic_kosher",
  shmitta: "shmitta",
  kilayim: "kilayim",
  "artisan-dairy": "artisan_dairy",
};

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function KashrutBadgeStrip({ badges, verified_at, expires_at }) {
  const t = useTranslations("kashrut");
  const format = useFormatter();
  if (!badges || badges.length === 0) return null;

  const expiresInDays = daysUntil(expires_at);
  const nearExpiry = expiresInDays !== null && expiresInDays <= 30;

  const expiryText = expires_at
    ? t("expiry.valid_until", {
        date: format.dateTime(new Date(expires_at), { dateStyle: "short" }),
      })
    : null;

  return (
    <div className="flex flex-wrap gap-1.5 items-center" dir="rtl">
      {badges.map((code) => {
        const key = CODE_TO_KEY[code];
        if (!key) return null;
        const label = t(`badges.${key}.label`);
        const tooltipBase = t(`badges.${key}.tooltip`);
        const tooltip = [tooltipBase, expiryText].filter(Boolean).join(" · ");

        return (
          <span
            key={code}
            title={tooltip}
            className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 text-primary px-2 py-0.5 text-xs font-medium cursor-default"
          >
            {label}
          </span>
        );
      })}
      {nearExpiry && (
        <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 text-amber-700 px-2 py-0.5 text-xs font-medium">
          {t("expiry.near_expiry")}
        </span>
      )}
    </div>
  );
}
