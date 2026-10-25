import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import ProducerOAuthButtons from "@/components/ProducerOAuthButtons";

/**
 * MEH-2279 — state-machine coverage for ProducerOAuthButtons (was 0/54
 * statements in the MEH-1980 gap report).
 *
 * What is under test is `finish()` (components/ProducerOAuthButtons.jsx:34-65)
 * — the one place both providers converge — plus the render gate at :133 and
 * the Apple event wiring at :110-124. Both third-party SDKs are replaced at
 * the seam the component already exposes:
 *
 *   - Google: `useGoogleSignIn` is mocked to CAPTURE the credential callback
 *     the component hands it (:76-78). Invoking that callback is exactly what
 *     GSI does after a successful sign-in, so the test drives the real
 *     `finish("google", …)` path with no window.google stub at all.
 *   - Apple: the SDK is loaded by appending a <script> (:96-108) that jsdom
 *     never fetches, so init() never runs — but the component listens for
 *     `AppleIDSignInOnSuccess` / `AppleIDSignInOnFailure` on `document`, and
 *     dispatching those CustomEvents is what the real SDK does.
 *
 * `lib/api` is mocked at the module boundary (no network); the translator is a
 * scoped bare-key one, so messages are asserted by i18n key, not Hebrew copy.
 *
 * Discrimination (MEH-1619): the 409 branch is the construction — swapping the
 * `status === 409` test to any other code makes "409 with detail" fall through
 * to the generic branch, which calls onError with ONE argument and never
 * toasts, so `toastMock.error` / the `{ redirectToLogin: true }` expectation
 * go red while every non-409 case stays green.
 */

const apiMock = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: apiMock }));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: toastMock }));

// detailToMessage's string branch only — the real helper (lib/errors.js:147)
// returns a non-empty string detail as-is and null otherwise; that is the whole
// surface this component uses.
vi.mock("@/lib/errors", () => ({
  detailToMessage: (detail) => (typeof detail === "string" && detail ? detail : null),
}));

// Mutable per test — the component reads `env.*` at render time.
const envMock = vi.hoisted(() => ({
  env: {
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-google",
    NEXT_PUBLIC_APPLE_CLIENT_ID: "test-apple",
    NEXT_PUBLIC_APPLE_REDIRECT_URI: "",
  },
}));
vi.mock("@/lib/env", () => envMock);

// Capture what the component registers with GSI; the hook is called on every
// render, so `callback` is always the latest closure.
const gsi = vi.hoisted(() => ({ clientId: undefined, callback: null, onReady: null }));
vi.mock("@/lib/use-google-sign-in", () => ({
  // MEH-2319: the component reads the page language for renderButton.
  gsiLang: () => "he",
  useGoogleSignIn: (clientId, callback, onReady) => {
    gsi.clientId = clientId;
    gsi.callback = callback;
    gsi.onReady = onReady;
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key) => (scope ? `${scope}.${key}` : key),
}));

const T = (k) => `auth.oauth.${k}`;
const ENDPOINT = "/auth/register/producer/oauth";

// Rejection shaped like the axios error the api client throws.
// Factory form (as AdminContentCategoryRenameError.test.jsx): the rejected
// promise is created only when the component calls api.post, so a handler is
// attached in the same tick and nothing can surface as an unhandled rejection.
const reject = (status, detail) => () =>
  Promise.reject(Object.assign(new Error(String(status)), { response: { status, data: { detail } } }));

const deferred = () => {
  let resolve, rejectFn;
  const promise = new Promise((res, rej) => {
    resolve = res;
    rejectFn = rej;
  });
  return { promise, resolve, reject: rejectFn };
};

function setEnv({ google = "test-google", apple = "test-apple" } = {}) {
  envMock.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = google;
  envMock.env.NEXT_PUBLIC_APPLE_CLIENT_ID = apple;
}

function mount(props = {}) {
  const onSuccess = vi.fn();
  const onError = vi.fn();
  const utils = render(<ProducerOAuthButtons onSuccess={onSuccess} onError={onError} {...props} />);
  return { ...utils, onSuccess, onError };
}

const googleSignIn = (credential = "google-id-token") =>
  act(async () => {
    gsi.callback({ credential });
  });

const appleEvent = (name, detail) =>
  act(async () => {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  });

beforeEach(() => {
  setEnv();
  apiMock.post.mockReset();
  apiMock.post.mockResolvedValue({ data: { access_token: "jwt-token" } });
  toastMock.error.mockClear();
  toastMock.success.mockClear();
  gsi.callback = null;
  gsi.onReady = null;
  gsi.clientId = undefined;
  localStorage.clear();
  window.AppleID = { auth: { init: vi.fn(), signIn: vi.fn() } };
});

afterEach(() => {
  delete window.AppleID;
});

describe("ProducerOAuthButtons — render gate (:133-152)", () => {
  it("renders nothing when neither provider has a client id", () => {
    setEnv({ google: "", apple: "" });
    const { container } = mount();
    expect(container.firstChild).toBeNull();
    expect(gsi.clientId).toBe("");
  });

  it("google only: heading + google slot, no Apple button", () => {
    setEnv({ apple: "" });
    mount();
    expect(screen.getByText(T("producer_quick_signup"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: T("apple_continue_f") })).toBeNull();
    expect(gsi.clientId).toBe("test-google");
  });

  it("apple only: Apple button present, GSI hook receives an empty client id", () => {
    setEnv({ google: "" });
    mount();
    expect(screen.getByRole("button", { name: T("apple_continue_f") })).toBeInTheDocument();
    expect(gsi.clientId).toBe("");
  });

  it("both providers: heading, Apple button, divider copy", () => {
    mount();
    expect(screen.getByText(T("producer_quick_signup"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: T("apple_continue_f") })).toBeInTheDocument();
    expect(screen.getByText(T("or"))).toBeInTheDocument();
    expect(screen.getByText(T("producer_only_email_name"))).toBeInTheDocument();
  });

  it("the Apple button hands off to the SDK's signIn()", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: T("apple_continue_f") }));
    expect(window.AppleID.auth.signIn).toHaveBeenCalledTimes(1);
  });
});

describe("ProducerOAuthButtons — finish(): success + loading (:34-43, :62-64)", () => {
  it("google credential → POST provider/id_token (no name key), token stored, onSuccess", async () => {
    const { onSuccess, onError } = mount();
    await googleSignIn("google-id-token");

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    expect(apiMock.post).toHaveBeenCalledWith(ENDPOINT, {
      provider: "google",
      id_token: "google-id-token",
    });
    expect(apiMock.post.mock.calls[0][1]).not.toHaveProperty("name");
    expect(localStorage.getItem("token")).toBe("jwt-token");
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("aria-busy + Apple button disabled while the request is in flight, released after", async () => {
    const d = deferred();
    apiMock.post.mockReturnValueOnce(d.promise);
    const { container } = mount();
    const apple = screen.getByRole("button", { name: T("apple_continue_f") });

    expect(container.firstChild).toHaveAttribute("aria-busy", "false");
    expect(apple).not.toBeDisabled();

    await act(async () => {
      gsi.callback({ credential: "tok" });
    });
    expect(container.firstChild).toHaveAttribute("aria-busy", "true");
    expect(apple).toBeDisabled();

    await act(async () => {
      d.resolve({ data: { access_token: "jwt" } });
      await d.promise;
    });
    expect(container.firstChild).toHaveAttribute("aria-busy", "false");
    expect(apple).not.toBeDisabled();
  });

  it("loading is released in `finally` on failure too", async () => {
    const d = deferred();
    apiMock.post.mockReturnValueOnce(d.promise);
    const { container } = mount();
    await act(async () => {
      gsi.callback({ credential: "tok" });
    });
    expect(container.firstChild).toHaveAttribute("aria-busy", "true");
    await act(async () => {
      d.reject(Object.assign(new Error("500"), { response: { status: 500, data: {} } }));
      await d.promise.catch(() => {});
    });
    expect(container.firstChild).toHaveAttribute("aria-busy", "false");
  });
});

describe("ProducerOAuthButtons — finish(): error branches (:44-61)", () => {
  it("409 with a backend detail: toast (5s) + onError(detail, {redirectToLogin}) — no token, no onSuccess", async () => {
    apiMock.post.mockImplementationOnce(reject(409, "כבר קיים חשבון עם האימייל הזה"));
    const { onSuccess, onError } = mount();
    await googleSignIn();

    expect(toastMock.error).toHaveBeenCalledWith("כבר קיים חשבון עם האימייל הזה", { duration: 5000 });
    expect(onError).toHaveBeenCalledWith("כבר קיים חשבון עם האימייל הזה", { redirectToLogin: true });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("409 without a detail falls back to producer_already_account", async () => {
    apiMock.post.mockImplementationOnce(reject(409, undefined));
    const { onError } = mount();
    await googleSignIn();

    expect(toastMock.error).toHaveBeenCalledWith(T("producer_already_account"), { duration: 5000 });
    expect(onError).toHaveBeenCalledWith(T("producer_already_account"), { redirectToLogin: true });
  });

  it("429 → onError(rate_limited) only — no toast, no redirect flag", async () => {
    apiMock.post.mockImplementationOnce(reject(429, "slow down"));
    const { onError } = mount();
    await googleSignIn();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(T("rate_limited"));
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("401 → onError(connection_failed)", async () => {
    apiMock.post.mockImplementationOnce(reject(401, "bad token"));
    const { onError } = mount();
    await googleSignIn();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(T("connection_failed"));
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("other status with a string detail → onError(detail)", async () => {
    apiMock.post.mockImplementationOnce(reject(500, "שגיאת שרת"));
    const { onError } = mount();
    await googleSignIn();
    expect(onError).toHaveBeenCalledWith("שגיאת שרת");
  });

  it("other status without a detail → onError(generic_error); a network error (no response) too", async () => {
    apiMock.post.mockImplementationOnce(reject(503, undefined));
    const first = mount();
    await googleSignIn();
    expect(first.onError).toHaveBeenCalledWith(T("generic_error"));
    first.unmount();

    apiMock.post.mockImplementationOnce(() => Promise.reject(new Error("Network Error")));
    const second = mount();
    await googleSignIn();
    expect(second.onError).toHaveBeenCalledWith(T("generic_error"));
  });
});

describe("ProducerOAuthButtons — Apple event wiring (:110-124)", () => {
  it("AppleIDSignInOnSuccess with a user → POST apple + trimmed full name", async () => {
    const { onSuccess } = mount();
    await appleEvent("AppleIDSignInOnSuccess", {
      authorization: { id_token: "apple-id-token" },
      user: { name: { firstName: "דנה", lastName: "לוי" } },
    });

    expect(apiMock.post).toHaveBeenCalledWith(ENDPOINT, {
      provider: "apple",
      id_token: "apple-id-token",
      name: "דנה לוי",
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("success without a user (returning Apple user) → no name key", async () => {
    mount();
    await appleEvent("AppleIDSignInOnSuccess", { authorization: { id_token: "apple-id-token" } });

    expect(apiMock.post).toHaveBeenCalledWith(ENDPOINT, { provider: "apple", id_token: "apple-id-token" });
    expect(apiMock.post.mock.calls[0][1]).not.toHaveProperty("name");
  });

  it("success with a user whose name fields are empty → name omitted, not an empty string", async () => {
    mount();
    await appleEvent("AppleIDSignInOnSuccess", {
      authorization: { id_token: "apple-id-token" },
      user: { name: {} },
    });
    expect(apiMock.post.mock.calls[0][1]).not.toHaveProperty("name");
  });

  it("success event without an id_token is ignored — no request, no callbacks", async () => {
    const { onSuccess, onError } = mount();
    await appleEvent("AppleIDSignInOnSuccess", { authorization: {} });
    await appleEvent("AppleIDSignInOnSuccess", undefined);

    expect(apiMock.post).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("failure other than popup_closed_by_user → onError(apple_error)", async () => {
    const { onError } = mount();
    await appleEvent("AppleIDSignInOnFailure", { error: "user_trigger_new_signin_flow" });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(T("apple_error"));
  });

  it("popup_closed_by_user is silent", async () => {
    const { onError } = mount();
    await appleEvent("AppleIDSignInOnFailure", { error: "popup_closed_by_user" });
    expect(onError).not.toHaveBeenCalled();
  });

  it("listeners are removed on unmount — a late event reaches nothing", async () => {
    const { unmount, onError } = mount();
    unmount();
    await appleEvent("AppleIDSignInOnFailure", { error: "boom" });
    await appleEvent("AppleIDSignInOnSuccess", { authorization: { id_token: "late" } });
    expect(onError).not.toHaveBeenCalled();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("with no Apple client id the listeners are never attached", async () => {
    setEnv({ apple: "" });
    const { onError } = mount();
    await appleEvent("AppleIDSignInOnFailure", { error: "boom" });
    expect(onError).not.toHaveBeenCalled();
  });
});
