// CSV export for the admin producers table.
//
// Builds a UTF-8 CSV (with BOM so Excel auto-detects encoding) and
// triggers a browser download. Pure data → DOM side-effect; no React,
// no hooks. Consumed by frontend/app/admin/producers/use-admin-producers.js.
//
// MEH-213 — the "location mode" columns (physical / delivery / nationwide /
// delivery-cities) match the Hebrew labels used in admin Excel imports.

// "YYYY-MM-DD" prefix length on an ISO 8601 date string.
const ISO_DATE_LENGTH = 10;

const HEADERS = [
  "שם", "עיר", "טלפון", "אינסטגרם", "אתר", "סטטוס", "slug",
  "חנות פיזית", "משלוחים", "כל הארץ", "ערי משלוח",
];

function buildRow(p) {
  // MEH-904: derive the cities cell from the delivery_areas relation —
  // the flat delivery_cities column is empty for registration-created
  // producers (only admin form writes it). Dedupe in case the same city
  // shows up on multiple rows (different delivery_day).
  const deliveryCities = [...new Set(
    (p.delivery_areas || []).map((da) => da.city).filter(Boolean),
  )];
  return [
    p.name, p.city || "", p.phone || "", p.instagram || "", p.website || "", p.status, p.slug || "",
    // MEH-213 — location mode columns
    p.has_physical_location !== false ? "כן" : "לא",
    p.offers_delivery ? "כן" : "לא",
    p.delivery_nationwide ? "כן" : "לא",
    deliveryCities.join(", "),
  ];
}

function escapeCell(v) {
  return `"${String(v).replace(/"/g, '""')}"`;
}

export function exportProducersToCSV(producers) {
  const rows = producers.map(buildRow);
  const csv = "\uFEFF" + [HEADERS, ...rows]
    .map((r) => r.map(escapeCell).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `producers-${new Date().toISOString().slice(0, ISO_DATE_LENGTH)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
