import { Button } from "mehamakor-frontend";

const row: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

export function Variants() {
  return (
    <div style={row}>
      <Button variant="primary">חיפוש</Button>
      <Button variant="secondary">שמירה</Button>
      <Button variant="outlined">עוד פרטים</Button>
      <Button variant="ghost">ביטול</Button>
      <Button variant="text">דילוג</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={row}>
      <Button size="sm">קטן</Button>
      <Button size="md">בינוני</Button>
      <Button size="lg">גדול</Button>
    </div>
  );
}

export function States() {
  return (
    <div style={row}>
      <Button variant="primary">רגיל</Button>
      <Button variant="primary" disabled>מושבת</Button>
      <Button variant="primary" loading>נשמר</Button>
    </div>
  );
}
