import { Card, Heading, Badge } from "mehamakor-frontend";

export function Default() {
  return (
    <Card>
      <div style={{ padding: 18 }}>
        <Heading level={3} variant="editorial">מאפיית לחם מחמצת</Heading>
        <p style={{ marginTop: 8, color: "#5c584f", lineHeight: 1.6 }}>
          לחם מחמצת אפוי בתנור אבן, נאפה טרי כל בוקר משכונת המושבה.
        </p>
        <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
          <Badge variant="primary">מאומת</Badge>
          <Badge variant="muted">אורגני</Badge>
        </div>
      </div>
    </Card>
  );
}

export function Active() {
  return (
    <Card active>
      <div style={{ padding: 18 }}>
        <Heading level={3} variant="editorial">כרטיס נבחר</Heading>
        <p style={{ marginTop: 8, color: "#5c584f" }}>מצב active — גבול מודגש.</p>
      </div>
    </Card>
  );
}

export function Flat() {
  return (
    <Card variant="flat">
      <div style={{ padding: 18 }}>
        <Heading level={3} variant="sans">כרטיס שטוח</Heading>
        <p style={{ marginTop: 8, color: "#5c584f" }}>variant="flat" — ללא גבול.</p>
      </div>
    </Card>
  );
}
