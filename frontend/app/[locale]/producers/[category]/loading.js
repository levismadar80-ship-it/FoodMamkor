// @ts-check
// MEH-3059: producers/loading.js draws the «כל בתי העסק» index (its H1, chips,
// card grid). Without this file it would also cover this nested segment, whose
// page has its own title and a narrower frame — so the wrong title would flash.
// Re-use the site-wide brand loader here, exactly as before MEH-3059.
export { default } from "../../loading";
