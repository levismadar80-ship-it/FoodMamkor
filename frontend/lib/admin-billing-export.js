// @ts-check
/**
 * Module:   admin-billing-export
 * Purpose:  MEH-3189 — the monthly billing CSV for the bookkeeper: one row
 *           per business with a counted booking in the month, built from the
 *           SAME answer the /admin/billing screen shows
 *           (GET /admin/billing/overview?month=YYYY-MM).
 * Touches:  a browser download (Blob + <a download>). No network here; the
 *           caller passes the parsed overview.
 * Does NOT: compute a fee or hold a price — every number is the server's.
 *           Receipts do not exist yet (no provider, MEH-3183); when they do,
 *           their columns join this file.
 * Related:  frontend/lib/admin-producers-export.js (the same BOM + quoting) ·
 *           backend/app/services/billing_summary.py `overview`.
 * History:  MEH-3189 (creation, 2026-11-21).
 */

// REUSES: frontend/lib/admin-producers-export.js — BOM so Excel reads Hebrew.
const BOM = "﻿";
const AGOROT = 100;

/**
 * A cell Excel would run as a formula (it starts with =, +, -, an at-sign, tab
 * or CR) is prefixed with
 * an apostrophe: a business name is user text (OWASP CSV injection).
 * @param {unknown} value
 */
export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** @param {number} agorot */
const shekels = (agorot) => (Math.round(agorot) / AGOROT).toFixed(2);

/**
 * @param {{ month: string, phase: string, rows: Array<any> }} overview
 * @param {{ headers: string[], yes: string, no: string, phaseOn: string, phaseOff: string }} words
 */
export function buildBillingCsv(overview, words) {
  const phase = overview.phase === "billing" ? words.phaseOn : words.phaseOff;
  const lines = overview.rows.map((row) => [
    overview.month,
    row.name,
    row.producer_id,
    row.bookings,
    shekels(row.value_agorot),
    row.over_threshold ? words.yes : words.no,
    shekels(row.would_pay_agorot),
    phase,
  ]);
  return (
    BOM +
    [words.headers, ...lines].map((cells) => cells.map(csvCell).join(",")).join("\n")
  );
}

/** @param {string} csv @param {string} month */
export function downloadBillingCsv(csv, month) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `billing-${month}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
