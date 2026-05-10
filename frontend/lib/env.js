// MEH-465: env.js is now a shim. Real implementation lives in env.client.js
// (client-safe, NEXT_PUBLIC_* only) and env.server.js (server-only vars +
// import "server-only" guard). next.config.js (protected file) still points
// here via jiti — importing env.client.js triggers its createEnv validation.
export { env, SITE_URL, API_URL } from "./env.client.js";
