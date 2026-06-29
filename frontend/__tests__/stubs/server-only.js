// MEH-977: vitest stub for the `server-only` package. The real module throws
// on import outside a React Server Component; tests run in jsdom/node, so any
// test that transitively imports a server-only-guarded module (e.g.
// app/sitemap.js → lib/server-fetch.js) would fail at load. Aliased in
// vitest.config.js so the import is a harmless no-op under test.
export {};
