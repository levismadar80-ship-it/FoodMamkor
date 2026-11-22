/**
 * MEH-3675 — the real Google button hands the caller the credential it signed
 * in with, so the owner-invite page can send it once more instead of a code.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import GoogleAuthButton from "@/components/GoogleAuthButton";

let googleCallback;
const loginWithGoogle = vi.fn(async () => {});
vi.mock("@/lib/use-google-sign-in", () => ({
  gsiLang: () => "he",
  useGoogleSignIn: (_clientId, onCredential) => {
    googleCallback = onCredential;
  },
}));
vi.mock("@/lib/auth-context", () => ({
  PasskeyStepRequired: class extends Error {},
  useAuth: () => ({ loginWithGoogle }),
}));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => "/owner-invite", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-client" } }));

describe("GoogleAuthButton → onSuccess(credential) (MEH-3675)", () => {
  it("signs in with the credential, then passes that same credential to the caller", async () => {
    const onSuccess = vi.fn();
    render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <GoogleAuthButton onSuccess={onSuccess} />
      </NextIntlClientProvider>,
    );
    await googleCallback({ credential: "google-id-token" });
    expect(loginWithGoogle).toHaveBeenCalledWith("google-id-token", { termsAccepted: false });
    expect(onSuccess).toHaveBeenCalledWith("google-id-token");
  });

  it("does not hand over a credential whose sign-in failed", async () => {
    loginWithGoogle.mockRejectedValueOnce({ response: { data: { detail: "x" } } });
    const onSuccess = vi.fn();
    render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <GoogleAuthButton onSuccess={onSuccess} onError={() => {}} />
      </NextIntlClientProvider>,
    );
    await googleCallback({ credential: "google-id-token" });
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
