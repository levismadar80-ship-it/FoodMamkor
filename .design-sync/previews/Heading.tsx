import { Heading } from "mehamakor-frontend";

export function Hero() {
  return <Heading level={1} variant="hero">מהמקור</Heading>;
}

export function Editorial() {
  return <Heading level={2} variant="editorial">מוצרים מהשכנים שלך</Heading>;
}

export function Levels() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Heading level={1} variant="editorial">כותרת ראשית — רמה 1</Heading>
      <Heading level={2} variant="editorial">כותרת משנה — רמה 2</Heading>
      <Heading level={3} variant="sans">כותרת גוף — רמה 3 (sans)</Heading>
    </div>
  );
}
