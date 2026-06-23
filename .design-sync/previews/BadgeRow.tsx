import { BadgeRow } from "mehamakor-frontend";

const col: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  alignItems: "flex-start",
};

// A fully-decorated verified producer: gold seal + several quality chips.
const verifiedProducer = {
  verification_tier: "verified",
  verification_doc_type: "license",
  verified_at: "2026-02-10",
  is_recommended: true,
  has_producer_license: true,
  organic_certified: true,
  grass_fed: true,
  has_vegan_products: true,
  kosher: "בד\"ץ",
  products_count: 8,
};

// A declared (non-verified) producer — calm "מוצהר" chip on hero surface.
const declaredProducer = {
  verification_tier: "declared",
  days_since_created: 12,
  organic_certified: true,
  has_gluten_free_products: true,
};

export function HeroVerified() {
  return (
    <div style={col}>
      <BadgeRow producer={verifiedProducer} surface="hero" />
    </div>
  );
}

export function HeroDeclared() {
  return (
    <div style={col}>
      <BadgeRow producer={declaredProducer} surface="hero" />
    </div>
  );
}

export function CardLimited() {
  // ProducerCard density: icon-only seal + top-2 chips only
  return (
    <div style={col}>
      <BadgeRow producer={verifiedProducer} surface="card" limit={2} />
    </div>
  );
}

export function QualityOnly() {
  // No tier badge — only the muted/quality chips
  const producer = {
    organic_certified: true,
    grass_fed: true,
    has_lactose_free_products: true,
    kosher: "רבנות",
    has_delivery: true,
  };
  return (
    <div style={col}>
      <BadgeRow producer={producer} surface="hero" />
    </div>
  );
}
