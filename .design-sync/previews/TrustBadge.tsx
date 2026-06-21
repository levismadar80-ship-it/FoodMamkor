import { TrustBadge } from "mehamakor-frontend";

const row: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

export function Tiers() {
  return (
    <div style={row}>
      <TrustBadge tier={2} />
      <TrustBadge tier={3} />
      <TrustBadge tier={4} />
      <TrustBadge tier={5} />
    </div>
  );
}

export function Compact() {
  return (
    <div style={row}>
      <TrustBadge tier={3} compact />
      <TrustBadge tier={4} compact />
      <TrustBadge tier={5} compact />
    </div>
  );
}
