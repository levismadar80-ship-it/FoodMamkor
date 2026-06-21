import { KashrutBadgeStrip } from "mehamakor-frontend";

const col: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  alignItems: "stretch",
};

export function FullStrip() {
  return (
    <KashrutBadgeStrip
      badges={["badatz", "mehadrin", "chalak", "organic-kosher"]}
      verified_at="2026-01-15"
      expires_at="2027-01-15"
    />
  );
}

export function SingleBadge() {
  return (
    <KashrutBadgeStrip
      badges={["rabanut"]}
      verified_at="2026-03-01"
      expires_at="2027-03-01"
    />
  );
}

export function MixedCodes() {
  // Broader coverage: agricultural-mitzvot codes alongside a hechsher.
  return (
    <div style={col}>
      <KashrutBadgeStrip
        badges={["shmitta", "kilayim", "artisan-dairy"]}
        verified_at="2026-01-20"
        expires_at="2027-01-20"
      />
    </div>
  );
}
