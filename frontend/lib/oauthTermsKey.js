/**
 * The consent line under the Google/Apple buttons names only the providers
 * actually rendered — each button is gated on its own NEXT_PUBLIC_*_CLIENT_ID,
 * and a line saying «Google או Apple» over a lone Google button promised a
 * button that is not there.
 *
 * Returns a key under auth.login. Callers render the line only when at least
 * one provider is configured; with neither, it returns the Google key.
 */
export function oauthTermsKey(googleConfigured, appleConfigured) {
  if (googleConfigured && appleConfigured) return "oauth_terms";
  return appleConfigured ? "oauth_terms_apple" : "oauth_terms_google";
}
