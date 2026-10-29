/**
 * MEH-2233: which message namespaces the ROOT client provider ships.
 *
 * A bare <NextIntlClientProvider> serializes the whole catalog into the RSC
 * payload of every page — 287 KB of JSON at the top of each HTML document,
 * parsed before first paint, on a business page that reads a few dozen keys.
 *
 * ROUTE_SCOPED: read by client components only inside their own routes, which
 * add them back (components/i18n/RouteMessagesProvider.jsx) —
 * /admin, /producer/dashboard, and /register/producer for the one admin
 * subtree its form reuses.
 * SERVER_ONLY: read only through getTranslations() in server pages, which
 * reads the request config directly and never needs the client copy.
 *
 * __tests__/ClientMessagesScope.test.jsx fails when a client component outside
 * those routes starts reading a namespace left out here.
 */
export const ROUTE_SCOPED_NAMESPACES = ["admin", "dashboard"];
export const SERVER_ONLY_NAMESPACES = [
  "guides",
  "about_business",
  "diet_pages",
  "about_why_local",
  "organizers",
];

const OMITTED = new Set([...ROUTE_SCOPED_NAMESPACES, ...SERVER_ONLY_NAMESPACES]);

export function rootClientMessages(messages) {
  return Object.fromEntries(Object.entries(messages).filter(([ns]) => !OMITTED.has(ns)));
}

/** What /admin and /producer/dashboard add over the root set. */
export function routeScopedMessages(messages) {
  return Object.fromEntries(ROUTE_SCOPED_NAMESPACES.map((ns) => [ns, messages[ns]]));
}

/** What /register/producer adds: the admin form-field labels its form reuses. */
export function registerProducerMessages(messages) {
  return { admin: { producers: { form: { fields: messages.admin.producers.form.fields } } } };
}
