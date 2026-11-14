/**
 * Module:   browser-globals.d.ts
 * Purpose:  Types for the globals and asset imports that JS files use and that
 *           TypeScript cannot see on its own: the Apple and Google sign-in SDKs
 *           (loaded by <script>), iOS Safari's navigator.standalone, the E2E
 *           hook window.__MAP_CENTER__, and the woff2 files that
 *           StoryCardCanvas imports as URLs.
 * Usage:    a file that needs one adds, above "use client":
 *             /// <reference path="<relative path>/types/browser-globals.d.ts" />
 *           (the ts-check test builds its program from the source files only,
 *           so a global .d.ts must be referenced to be seen).
 * Does NOT: type the SDKs completely, only the calls this repo makes.
 * History:  14/11/2026 — created (MEH-3167, legacy components/ type-check).
 */

interface AppleIDAuth {
  init(config: { clientId: string; scope?: string; redirectURI?: string; usePopup?: boolean; state?: string }): void;
  signIn(): Promise<unknown>;
}

interface GoogleAccountsId {
  initialize(config: Record<string, unknown>): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
  prompt(listener?: (notification: unknown) => void): void;
  cancel(): void;
}

interface Window {
  AppleID?: { auth: AppleIDAuth };
  google?: { accounts: { id: GoogleAccountsId } };
  /** Initial map centre, exposed for e2e/05-map-navigation.spec.ts. */
  __MAP_CENTER__?: unknown;
}

interface Navigator {
  /** iOS Safari only: true when launched from the home screen. */
  standalone?: boolean;
}

declare module "*.woff2" {
  /** The build URL of the font file (Next's static-asset loader). */
  const url: string;
  export default url;
}
