"use client";

const BADGE_META = {
  rabanut:        { label: "כשר מרבנות",   authority: "rabanut.org.il" },
  badatz:         { label: 'בדצ"ה',         authority: "badatz.co.il" },
  chalak:         { label: "חלק",           authority: null },
  mehadrin:       { label: "מהדרין",        authority: null },
  "organic-kosher": { label: "אורגני כשר", authority: null },
  shmitta:        { label: "שמיטה",         authority: null },
  kilayim:        { label: "ללא כלאיים",    authority: null },
  "grass-fed":    { label: "עשב טבעי",     authority: null },
  "raw-dairy":    { label: "חלב גולמי",    authority: null },
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
        const tooltip = [
          meta.label,
          meta.authority ? `מוכר על ידי ${meta.authority}` : null,
          expiryText,
        ]
          .filter(Boolean)
          .join(" · ");

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
