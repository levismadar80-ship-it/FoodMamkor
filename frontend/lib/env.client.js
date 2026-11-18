// @ts-check
/**
 * CLIENT-SAFE INVARIANT
 *
 * All module-level helpers exported from this file MUST only access
 * NEXT_PUBLIC_* env vars. Server-only vars (no NEXT_PUBLIC_ prefix)
 * may only be accessed inside function bodies that run server-side.
 *
 * Violating this causes T3 env's runtime guard to throw during client
 * bundle evaluation, crashing pages before render.
 *
 * Incident history:
 * - PR #499 (2026-05-06): env.SITE_URL in SITE_URL helper crashed /register
 * - hotfix #2 (2026-05-06): env.BACKEND_URL in API_URL helper crashed /register
 *
 * If you need a server-side env var in a helper, EITHER:
 * (a) inline the access in the consuming server component, OR
 * (b) move the helper to frontend/lib/env.server.js (server-only file)
 */
// MEH-464: invariant codified after PR #499 + hotfix #2 P0 cascade.
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// Safe to import from any component (client or server). Contains only
// NEXT_PUBLIC_* vars. Server-only vars live in env.server.js.
export const env = createEnv({
  client: {
    // MEH-1754 item 5: REQUIRED, deliberately. An absent value used to fall
    // back to localhost:8000 below, which baked an unreachable origin into the
    // deployed bundle and surfaced as a silent 404 — the same silent-failure
    // family as the resolver bug this ticket fixed. Fail the build instead.
    // DO NOT re-add .optional() — the fallback that made it survivable is gone.
    NEXT_PUBLIC_API_URL: z.string().url(),
    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    NEXT_PUBLIC_APPLE_CLIENT_ID: z.string().optional(),
    NEXT_PUBLIC_APPLE_REDIRECT_URI: z.string().url().optional(),
    NEXT_PUBLIC_SUPPORT_PHONE: z.string().regex(/^\d{10,15}$/).optional(),
    NEXT_PUBLIC_CLARITY_PROJECT_ID: z.string().optional(),
    NEXT_PUBLIC_CONTACT_EMAIL: z.string().email().optional(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    NEXT_PUBLIC_APPLE_CLIENT_ID: process.env.NEXT_PUBLIC_APPLE_CLIENT_ID,
    NEXT_PUBLIC_APPLE_REDIRECT_URI: process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI,
    NEXT_PUBLIC_SUPPORT_PHONE: process.env.NEXT_PUBLIC_SUPPORT_PHONE,
    NEXT_PUBLIC_CLARITY_PROJECT_ID: process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID,
    NEXT_PUBLIC_CONTACT_EMAIL: process.env.NEXT_PUBLIC_CONTACT_EMAIL,
  },
  skipValidation:
    process.env.NODE_ENV === "test" || !!process.env.SKIP_ENV_VALIDATION,
});

const PRODUCTION_SITE_URL = "https://mehamakor.co.il";

// A non-production host in `og:url` / `canonical` / the sitemap on a page
// served from mehamakor.co.il tells every crawler and every link preview to
// go somewhere else. `NEXT_PUBLIC_SITE_URL` is inlined at BUILD time, so a
// wrong value is frozen into that deployment until a rebuild — which is why
// this is checked at build and not at request time.
//
// `VERCEL_ENV` is a Vercel system variable, available during the build and
// deliberately NOT `NEXT_PUBLIC_`: it is absent from the client bundle, so
// this condition is simply false there and throws nothing in a browser. The
// check that matters is the one that fails `next build` on Production.
//
// The fallback is already the production host, so an UNSET variable was never
// the risk. A staging value set on the wrong Vercel scope is.
const NON_PRODUCTION_HOST = /staging|vercel\.app|localhost|127\.0\.0\.1/i;

function resolveSiteUrl() {
  const raw = env.NEXT_PUBLIC_SITE_URL || PRODUCTION_SITE_URL;
  if (process.env.VERCEL_ENV === "production" && NON_PRODUCTION_HOST.test(raw)) {
    throw new Error(
      `NEXT_PUBLIC_SITE_URL is "${raw}" in a Vercel Production build. ` +
        `That host would be written into og:url, canonical, hreflang, the ` +
        `sitemap and every JSON-LD @id on mehamakor.co.il. Set the Production ` +
        `scope of NEXT_PUBLIC_SITE_URL to ${PRODUCTION_SITE_URL} and redeploy ` +
        `main — the value is inlined at build time, so a redeploy is required.`,
    );
  }
  return raw;
}

export const SITE_URL = resolveSiteUrl();

// MEH-1754: no fallback. The schema above guarantees a validated URL at build
// time, so a `|| "http://localhost:8000"` here could only mask a validation
// bypass (SKIP_ENV_VALIDATION / NODE_ENV=test) — never help production.
export const API_URL = env.NEXT_PUBLIC_API_URL;

// MEH-653: centralized public contact email shown on /terms, /privacy,
// /contact, /forgot-password, /accessibility. Falls back to the literal
// when the Vercel env var is unset so the public legal disclosure never
// rotates to a blank string mid-deploy.
export const CONTACT_EMAIL =
  env.NEXT_PUBLIC_CONTACT_EMAIL || "contact@mehamakor.co.il";
