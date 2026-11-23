// @ts-check
/**
 * Module:   money
 * Purpose:  The one place that turns agorot (what the API stores) into
 *           shekels (what people read). Prices travel as whole agorot.
 * Does NOT: format the shekel string itself; that is `formatPrice` in
 *           lib/utils.js. Rounds to whole shekels for rescue cards: see
 *           lib/rescue.js `shekels`, on purpose different.
 * History:  MEH-3715 (creation; folded 9 local AGOROT constants and two
 *           copies of `shekels`).
 */
import { formatPrice } from "@/lib/utils";

export const AGOROT_PER_SHEKEL = 100;

/** @param {number} agorot */
export const agorotToShekels = (agorot) => agorot / AGOROT_PER_SHEKEL;

/** @param {number} shekels */
export const shekelsToAgorot = (shekels) => Math.round(shekels * AGOROT_PER_SHEKEL);

/** "35₪" from 3500. @param {number} agorot */
export const formatAgorot = (agorot) => formatPrice(Math.round(agorot) / AGOROT_PER_SHEKEL);
