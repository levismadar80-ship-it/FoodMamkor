"use client";

const BADGE_META = {
  rabanut:        { label: "כשר מרבנות",        tooltip: "כשרות בפיקוח הרבנות המקומית" },
  badatz:         { label: 'בדצ"ה',              tooltip: 'כשרות מהדרין בפיקוח בית דין צדק' },
  chalak:         { label: "חלק",                tooltip: "בשר חלק לפי המסורת הספרדית" },
  mehadrin:       { label: "מהדרין",             tooltip: "כשרות מהדרין ברמת הידור גבוהה" },
  "organic-kosher": { label: "אורגני כשר",       tooltip: "גידול אורגני מוסמך + כשרות" },
  shmitta:        { label: "שמיטה",              tooltip: "תוצרת שנת השמיטה בהכשר מיוחד" },
  kilayim:        { label: "ללא כלאיים",         tooltip: "ללא הרכבה אסורה בין מינים" },
  "artisan-dairy": { label: "מוצרי חלב מהחווה", tooltip: "חלב ומוצריו ישירות מהחווה, כשר" },
};

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function KashrutBadgeStrip({ badges, verified_at, expires_at }) {
  if (!badges || badges.length === 0) return null;

  const expiresInDays = daysUntil(expires_at);
  const nearExpiry = expiresInDays !== null && expiresInDays <= 30;

  const expiryText = expires_at
    ? `תקף עד: ${new Date(expires_at).toLocaleDateString("he-IL")}`
    : null;

  return (
    <div className="flex flex-wrap gap-1.5 items-center" dir="rtl">
      {badges.map((code) => {
        const meta = BADGE_META[code];
        if (!meta) return null;
        const tooltip = [meta.tooltip, expiryText].filter(Boolean).join(" · ");

        return (
          <span
            key={code}
            title={tooltip}
            className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 text-primary px-2 py-0.5 text-xs font-medium cursor-default"
          >
            {meta.label}
          </span>
        );
      })}
      {nearExpiry && (
        <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 text-amber-700 px-2 py-0.5 text-xs font-medium">
          ⚠️ תעודה פגה בקרוב
        </span>
      )}
    </div>
  );
}
