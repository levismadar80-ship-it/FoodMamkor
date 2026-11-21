// @ts-check
/**
 * Module:   order-customers
 * Purpose:  «הלקוחות שלכם» — read the business's customers and turn them into
 *           a CSV the business can open in Excel or Google Sheets.
 * Touches:  GET /producers/me/product-orders/customers.
 * Does NOT: decide who counts as a customer (the server does:
 *           backend/app/services/product_order_customers.py), or render.
 * Related:  components/dashboard/orders/OrderCustomersCard.jsx
 * History:  MEH-3561 (creation)
 */

import api from "@/lib/api";
import { localPhone } from "@/lib/product-orders";
import { ListBusinessCustomersProducersMeProductOrdersCustomersGetResponse } from "@/lib/generated/api.zod";

/** @typedef {{ name: string, phone: string, order_count: number, last_order_at: string }} Customer */

/** @returns {Promise<Customer[]>} */
export async function loadCustomers() {
  const { data } = await api.get("/producers/me/product-orders/customers");
  return /** @type {Customer[]} */ (
    ListBusinessCustomersProducersMeProductOrdersCustomersGetResponse.parse(data).customers
  );
}

export const REPEAT_FROM = 2;

// MEH-3561: a buyer types her own name, so a cell that starts with = + - @
// (or a tab / CR) would run as a formula when the business opens the file.
// A leading apostrophe makes Excel and Sheets show it as text (OWASP CSV injection).
const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell: quoted, inner quotes doubled, a formula start neutralised. */
export function csvCell(/** @type {string | number} */ value) {
  const text = String(value);
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * @param {Customer[]} customers
 * @param {string[]} headers  [name, phone, orders, last order]
 * @param {(iso: string) => string} date  formats the last-order date
 */
export function customersCsv(customers, headers, date) {
  const rows = customers.map((c) => [c.name, localPhone(c.phone), c.order_count, date(c.last_order_at)]);
  // The BOM makes Excel read the Hebrew as UTF-8.
  return "﻿" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** Hand the CSV to the browser as a download. */
export function downloadCsv(/** @type {string} */ csv, /** @type {string} */ fileName) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
