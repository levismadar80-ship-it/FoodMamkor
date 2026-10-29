import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

// MEH-2080 chunk 2: the OAuth buttons forward termsAccepted to the login call,
// read when the provider answers — not when the button first rendered.

const loginWithGoogle = vi.fn().mockResolvedValue({});
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ loginWithGoogle }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-google" } }));
// Keeps the FIRST callback only, as a GSI that bound once would: the button
// must not depend on the hook swapping in its newest closure.
const gsi = { callback: null };
vi.mock("@/lib/use-google-sign-in", () => ({
  gsiLang: () => "he",
  useGoogleSignIn: (_id, callback) => {
    gsi.callback ??= callback;
  },
}));

import GoogleAuthButton from "@/components/GoogleAuthButton";

describe("GoogleAuthButton forwards the terms consent (MEH-2080)", () => {
  beforeEach(() => {
    loginWithGoogle.mockClear();
    gsi.callback = null;
  });

  it("no prop (/login) → termsAccepted false", async () => {
    render(<GoogleAuthButton />);
    await gsi.callback({ credential: "tok" });
    expect(loginWithGoogle).toHaveBeenCalledWith("tok", { termsAccepted: false });
  });

  it("box ticked after the button rendered → the latest value is sent", async () => {
    const { rerender } = render(<GoogleAuthButton termsAccepted={false} />);
    rerender(<GoogleAuthButton termsAccepted />);
    await gsi.callback({ credential: "tok" });
    expect(loginWithGoogle).toHaveBeenCalledWith("tok", { termsAccepted: true });
  });
});
