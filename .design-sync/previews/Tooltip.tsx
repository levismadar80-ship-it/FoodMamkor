import { Tooltip } from "mehamakor-frontend";

const wrap: React.CSSProperties = {
  display: "flex",
  gap: 24,
  alignItems: "center",
  padding: "32px 16px",
};

const trigger: React.CSSProperties = {
  fontSize: 14,
  color: "#2e6853",
  textDecoration: "underline",
  textUnderlineOffset: 2,
  cursor: "help",
};

// Tooltip bubble shows only on hover/focus/click (uncontrolled state).
// Statically we render the styled trigger; the bubble cannot open in a
// screenshot. Recorded in batch-B learnings.
export function Triggers() {
  return (
    <div style={wrap}>
      <Tooltip content="היצרן עבר אימות זהות ועוסק מורשה" position="top">
        <span style={trigger}>מה זה יצרן מאומת?</span>
      </Tooltip>
      <Tooltip content="משלוח עד הבית באזורים נבחרים" position="bottom">
        <span style={trigger}>פרטי משלוח</span>
      </Tooltip>
    </div>
  );
}
