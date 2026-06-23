import { CategoryTag } from "mehamakor-frontend";

const row: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

export function WithEmoji() {
  return (
    <div style={row}>
      <CategoryTag category={{ emoji: "🧀", name: "גבינות" }} />
      <CategoryTag category={{ emoji: "🍞", name: "מאפים" }} />
      <CategoryTag category={{ emoji: "🍯", name: "דבש" }} />
      <CategoryTag category={{ emoji: "🫒", name: "שמן זית" }} />
    </div>
  );
}

export function TextOnly() {
  return (
    <div style={row}>
      <CategoryTag category={{ name: "ירקות אורגניים" }} />
      <CategoryTag category={{ name: "יין טבעי" }} />
      <CategoryTag category={{ name: "תבלינים" }} />
    </div>
  );
}
