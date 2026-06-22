import { AvailabilityBadge } from "mehamakor-frontend";

const col: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  alignItems: "flex-start",
};

export function DetailVariant() {
  // detail surface shows all three legacy states, including the positive one
  return (
    <div style={col}>
      <AvailabilityBadge status="available" variant="detail" />
      <AvailabilityBadge status="full" variant="detail" />
      <AvailabilityBadge status="vacation" variant="detail" />
    </div>
  );
}

export function CardVariant() {
  // card surface suppresses "open" states — only the exceptional ones show
  return (
    <div style={col}>
      <AvailabilityBadge status="full" variant="card" />
      <AvailabilityBadge status="vacation" variant="card" />
    </div>
  );
}

export function FourStateCards() {
  // MEH-291 four-state availability_state with emoji card labels
  return (
    <div style={col}>
      <AvailabilityBadge status="available_today" variant="detail" />
      <AvailabilityBadge status="full_this_week" variant="detail" />
      <AvailabilityBadge status="on_vacation" variant="detail" />
    </div>
  );
}
