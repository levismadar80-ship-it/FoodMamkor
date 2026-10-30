// MEH-2602: a business URL that resolves to nothing — a suspended, pending or
// never-existing business — showed the global «לא מצאנו את הדף הזה», which
// reads like a broken site. It now gets the business-specific page
// producer/[id] already had. It deliberately does not say WHY (suspended vs.
// unknown): the moderation status of a business is not public.
// REUSES: app/[locale]/producer/[id]/not-found.js
export { default } from "../producer/[id]/not-found";
