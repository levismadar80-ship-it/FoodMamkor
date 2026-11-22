import type { APIRequestContext, BrowserContext } from "@playwright/test";

/** See _bypass-scope.mjs (MEH-3607). */
export function scopeBypassToOrigin(
  context: BrowserContext,
  targetUrl: string,
  headers: Record<string, string>,
): Promise<string>;

/** See _bypass-scope.mjs (MEH-3629). */
export function fetchBypassCookie(api: APIRequestContext, targetUrl: string, secret: string): Promise<string>;
