/* shared atoms for MEH-1050 offer surfaces */
const { useState } = React;

function OIcon({ name, weight = "regular", size, style = {} }) {
  const base = weight === "bold" ? "ph-bold" : weight === "fill" ? "ph-fill" : "ph";
  const st = { lineHeight: 1, ...style };
  if (size) st.fontSize = size;
  return <i className={`${base} ph-${name}`} style={st} aria-hidden="true"></i>;
}

function OBtn({ variant = "primary", size, block, icon, iconWeight = "bold", children, ...rest }) {
  const cls = ["btn", `btn-${variant}`, size === "sm" ? "btn-sm" : "", block ? "btn-block" : ""].join(" ");
  return (
    <button className={cls} {...rest}>
      {icon && <OIcon name={icon} weight={iconWeight} />}
      {children}
    </button>
  );
}

const HE_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
/* "2026-08-09" → "9 באוגוסט" (year appended when ≠ current year) */
function fmtHeDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const now = new Date();
  const yr = y !== now.getFullYear() ? ` ${y}` : "";
  return `${d} ב${HE_MONTHS[m - 1]}${yr}`;
}

/* one summary line — industry rule: min-purchase always visible when present */
function offerSummary(o) {
  const parts = [];
  if (o.minPurchase) parts.push(<React.Fragment>בקנייה מעל <span dir="ltr">₪{o.minPurchase}</span></React.Fragment>);
  parts.push(`בתוקף עד ${fmtHeDate(o.expiresAt)}`);
  return parts;
}

function offerHeadline(o) {
  if (o.type === "percent") return <React.Fragment><span dir="ltr">{o.value || "—"}%</span> הנחה</React.Fragment>;
  if (o.type === "amount") return <React.Fragment><span dir="ltr">₪{o.value || "—"}</span> הנחה</React.Fragment>;
  return "מתנה מבית העסק";
}

/* the public offer card — FINAL: 1a "הערת מגזין" (gold hairline, no box) */
function OfferCardPreview({ offer }) {
  const isGift = offer.type === "gift";
  const min = offer.minPurchase;
  return (
    <section className="oc oc-rule">
      <span className="oc-eyebrow"><OIcon name={isGift ? "gift" : "seal-percent"} weight="fill" />הטבה מבית העסק</span>
      <h3 className="serif oc-h">{isGift ? (offer.terms || "תיאור המתנה יופיע כאן") : offerHeadline(offer)}</h3>
      <p className="oc-sum">
        {min ? <span className="pt"><OIcon name="basket" />בקנייה מעל <span dir="ltr">₪{min}</span></span> : null}
        <span className="pt"><OIcon name="calendar-blank" />בתוקף עד {fmtHeDate(offer.expiresAt)}</span>
      </p>
      {!isGift && offer.terms ? <p className="oc-terms">{offer.terms}</p> : null}
    </section>
  );
}

Object.assign(window, { OIcon, OBtn, fmtHeDate, offerSummary, offerHeadline, OfferCardPreview });
