// Sentry v10 instrumentation hook (per v8→v9 migration guide)
// Wraps existing sentry.server.config.js + sentry.edge.config.js
// Client-side runs via auto-loaded sentry.client.config.js

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
