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
    NEXT_PUBLIC_API_URL: z.string().url().optional(),
    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    NEXT_PUBLIC_APPLE_CLIENT_ID: z.string().optional(),
    NEXT_PUBLIC_APPLE_REDIRECT_URI: z.string().url().optional(),
    NEXT_PUBLIC_SUPPORT_PHONE: z.string().regex(/^\d{10,15}$/).optional(),
    NEXT_PUBLIC_CLARITY_PROJECT_ID: z.string().optional(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    NEXT_PUBLIC_APPLE_CLIENT_ID: process.env.NEXT_PUBLIC_APPLE_CLIENT_ID,
    NEXT_PUBLIC_APPLE_REDIRECT_URI: process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI,
    NEXT_PUBLIC_SUPPORT_PHONE: process.env.NEXT_PUBLIC_SUPPORT_PHONE,
    NEXT_PUBLIC_CLARITY_PROJECT_ID: process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID,
  },
  skipValidation:
    process.env.NODE_ENV === "test" || !!process.env.SKIP_ENV_VALIDATION,
});

export const SITE_URL =
  env.NEXT_PUBLIC_SITE_URL || "https://mehamakor.co.il";

export const API_URL =
  env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
