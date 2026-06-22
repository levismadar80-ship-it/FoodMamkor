import { EmptyState } from "mehamakor-frontend";

const wrap: React.CSSProperties = { maxWidth: 460 };

export function NoResults() {
  return (
    <div style={wrap}>
      <EmptyState
        emoji="🧺"
        title="לא נמצאו יצרנים באזור"
        description="עדיין אין יצרנים שמשווקים לאזור שלך — נסו להרחיב את רדיוס החיפוש או חזרו מאוחר יותר."
        ctaLabel="הרחבת החיפוש"
        ctaHref="#"
        secondaryLabel="הצעת יצרן חדש"
        secondaryHref="#"
      />
    </div>
  );
}

export function EmptyFavorites() {
  return (
    <div style={wrap}>
      <EmptyState
        emoji="❤️"
        title="עוד לא שמרת מועדפים"
        description="לחצו על הלב בכל כרטיס יצרן כדי לשמור אותו כאן ולחזור אליו בקלות."
        ctaLabel="לגלות יצרנים"
        ctaHref="#"
      />
    </div>
  );
}
