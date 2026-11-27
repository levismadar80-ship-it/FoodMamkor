// @ts-check
/**
 * Module:   address-line
 * Purpose:  One printed «street, city» line on every screen: the city is
 *           added only when the street a business typed does not already end
 *           with it, so «הרצל 5, חיפה» never reads «הרצל 5, חיפה, חיפה»
 *           (MEH-3959).
 * Does NOT: decide what is public — callers pass the street only where the
 *           API sent it.
 * Related:  backend/app/services/address_line.py (the same rule for emails
 *           and the order page's pickup line).
 * History:  MEH-3959 (creation).
 */

/** @param {string | null | undefined} s */
function squash(s) {
  return (s || "").split(/\s+/).filter(Boolean).join(" ");
}

/**
 * «<address>, <city>», without repeating a city the address already carries.
 * A street NAMED after a city («דרך חיפה 5») still gets the city.
 * @param {string | null | undefined} address
 * @param {string | null | undefined} city
 * @returns {string}
 */
export function addressLine(address, city) {
  const street = squash(address).replace(/[\s,]+$/, "");
  const town = squash(city);
  if (street && town) {
    const last = street.split(",").pop()?.trim();
    if (last === town || street.endsWith(` ${town}`)) return street;
  }
  return [street, town].filter(Boolean).join(", ");
}
