import { ChipScrollRow } from "mehamakor-frontend";

const CATEGORY_CHIPS = [
  { key: "all", label: "הכל" },
  { key: "bakery", label: "מאפיות", icon: "🥖" },
  { key: "dairy", label: "מחלבות", icon: "🧀" },
  { key: "produce", label: "ירקות ופירות", icon: "🥕" },
  { key: "honey", label: "דבש", icon: "🍯" },
  { key: "wine", label: "יין ובירה", icon: "🍷" },
];

const ATTRIBUTE_CHIPS = [
  { key: "verified", label: "מאומת" },
  { key: "organic", label: "אורגני" },
  { key: "delivery", label: "משלוחים" },
  { key: "kosher", label: "כשר" },
  { key: "vegan", label: "טבעוני" },
];

export function CategoryRow() {
  return (
    <div style={{ width: "100%", maxWidth: 420 }}>
      <ChipScrollRow
        chips={CATEGORY_CHIPS}
        variant="category"
        activeKey="bakery"
        onChipClick={() => {}}
      />
    </div>
  );
}

export function ToggleRow() {
  return (
    <div style={{ width: "100%", maxWidth: 420 }}>
      <ChipScrollRow
        chips={ATTRIBUTE_CHIPS}
        variant="toggle"
        activeKeys={{ verified: true, organic: true }}
        onChipClick={() => {}}
      />
    </div>
  );
}

export function CategoryAll() {
  return (
    <div style={{ width: "100%", maxWidth: 420 }}>
      <ChipScrollRow
        chips={CATEGORY_CHIPS}
        variant="category"
        activeKey="all"
        onChipClick={() => {}}
      />
    </div>
  );
}
