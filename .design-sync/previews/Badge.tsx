import { Badge } from "mehamakor-frontend";

const row: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

export function Variants() {
  return (
    <div style={row}>
      <Badge variant="primary">מאומת</Badge>
      <Badge variant="accent">מומלץ</Badge>
      <Badge variant="muted">אורגני</Badge>
      <Badge variant="secondary">חדש</Badge>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={row}>
      <Badge variant="primary" size="md">משלוח עד הבית</Badge>
      <Badge variant="primary" size="sm">כשר</Badge>
      <Badge variant="muted" size="md">גראס פד</Badge>
      <Badge variant="muted" size="sm">ללא גלוטן</Badge>
    </div>
  );
}

export function WithTooltip() {
  return (
    <div style={row}>
      <Badge variant="muted" size="sm" tooltip="בית העסק מחזיק בתעודת אורגני בתוקף">
        אורגני
      </Badge>
      <Badge variant="accent" tooltip="המלצת עורכת מהמקור">
        מומלץ
      </Badge>
    </div>
  );
}
