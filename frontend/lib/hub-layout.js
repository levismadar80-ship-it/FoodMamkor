/**
 * MEH-3013: the content width every «מה קורה» hub tab uses below the shared
 * head (components/HubShell.jsx) — the same width the tab row and hero text
 * use. Plain module (not "use client") so the server page /rescue can read
 * the string itself rather than a client reference.
 */
export const HUB_CONTENT_CLASS = "max-w-5xl mx-auto px-4";
