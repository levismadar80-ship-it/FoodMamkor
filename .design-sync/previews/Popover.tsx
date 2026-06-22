import { Popover } from "mehamakor-frontend";

const wrap: React.CSSProperties = {
  display: "flex",
  gap: 24,
  alignItems: "center",
  padding: "16px",
};

const triggerBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid #d8d2c4",
  background: "#fffefb",
  borderRadius: 999,
  padding: "6px 14px",
  fontSize: 13,
  color: "#2e6853",
  cursor: "pointer",
};

// Popover panel opens on click (uncontrolled). Statically only the styled
// trigger renders. Recorded in batch-B learnings.
export function Trigger() {
  return (
    <div style={wrap}>
      <Popover
        trigger={<button style={triggerBtn} type="button">למה לבחור מהמקור?</button>}
        placement="bottom"
        role="dialog"
      >
        <div style={{ maxWidth: 220 }}>
          קונים ישירות מהיצרן המקומי — בלי מתווכים, עם פנים מאחורי כל מוצר.
        </div>
      </Popover>
    </div>
  );
}
