import { Link } from "mehamakor-frontend";

const row: React.CSSProperties = {
  display: "flex",
  gap: 20,
  flexWrap: "wrap",
  alignItems: "center",
};

export function Variants() {
  return (
    <div style={row}>
      <Link href="#" variant="default">קראו עוד עלינו</Link>
      <Link href="#" variant="muted">תנאי שימוש</Link>
      <Link href="#" variant="accent">הצטרפו כיצרנים</Link>
    </div>
  );
}

export function Navigation() {
  return (
    <div style={row}>
      <Link href="#" variant="nav">דף הבית</Link>
      <Link href="#" variant="nav" active>מפת היצרנים</Link>
      <Link href="#" variant="nav">אודות</Link>
    </div>
  );
}
