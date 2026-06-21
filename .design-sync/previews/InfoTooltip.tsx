import { InfoTooltip } from "mehamakor-frontend";

const row: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  padding: "24px 16px",
  fontSize: 15,
  color: "#1c1a17",
};

// The "i" trigger button renders statically; the dark tooltip bubble opens
// only on hover/click (uncontrolled state). Recorded in batch-B learnings.
export function InlineWithLabel() {
  return (
    <div style={row}>
      <span>זמן הכנה משוער</span>
      <InfoTooltip content="הזמן מרגע ההזמנה ועד מוכנות לאיסוף — משתנה לפי עומס היצרן." />
    </div>
  );
}

export function NextToHeading() {
  return (
    <div style={row}>
      <span style={{ fontWeight: 600 }}>חותם אמון מהמקור</span>
      <InfoTooltip content="ניתן ליצרנים שעברו אימות זהות, עוסק מורשה ובדיקת איכות." />
    </div>
  );
}
