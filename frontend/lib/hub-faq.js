// @ts-check
/**
 * MEH-3737: which questions each hub list shows under it, in order. The keys
 * name `items.<key>` in the messages namespace of each list. Kept here, not in
 * the page files, so the test reads the same lists the pages render.
 */
export const HUB_FAQ = Object.freeze({
  groupBuys: { namespace: "group_buys.faq", keys: ["what", "pay", "miss", "cancel", "pickup", "no_show", "mine"], path: "/group-buys" },
  rescue: { namespace: "rescue.faq", keys: ["contents", "allergens", "pay", "cancel", "no_show", "mine"], path: "/rescue" },
});
