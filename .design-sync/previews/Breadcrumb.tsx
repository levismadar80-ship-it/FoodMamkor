import { Breadcrumb } from "mehamakor-frontend";

export function ThreeLevels() {
  return (
    <Breadcrumb
      items={[
        { href: "/", label: "בית" },
        { href: "/producers", label: "יצרנים" },
        { label: "מאפיית לחם מחמצת" },
      ]}
    />
  );
}

export function EventsTrail() {
  return (
    <Breadcrumb
      items={[
        { href: "/", label: "בית" },
        { href: "/events", label: "אירועים" },
        { label: "שוק איכרים בשכונה" },
      ]}
    />
  );
}

export function TwoLevels() {
  return (
    <Breadcrumb
      items={[
        { href: "/", label: "בית" },
        { label: "אודות" },
      ]}
    />
  );
}
