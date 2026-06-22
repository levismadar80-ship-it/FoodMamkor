import { RecipeStatusBadge } from "mehamakor-frontend";

const row: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

export function States() {
  return (
    <div style={row}>
      <RecipeStatusBadge status="pending" />
      <RecipeStatusBadge status="approved" />
      <RecipeStatusBadge status="rejected" />
      <RecipeStatusBadge status="needs_revision" />
    </div>
  );
}
