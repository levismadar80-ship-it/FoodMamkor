import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import ResetPasswordClient from "@/app/[locale]/reset-password/ResetPasswordClient";

/**
 * MEH-2279 — state-machine coverage for /reset-password (was 0/50 statements
 * in the MEH-1980 gap report).
 *
 * Screens, from app/[locale]/reset-password/ResetPasswordClient.jsx:
 *   - no `?token=`            → invalid-link card + "request a new link" (:42-53)
 *   - form                    → submit gated on both fields (:169); client-side
 *                               too-short / mismatch checks before any request (:59-66)
 *   - loading                 → "updating…" label, button disabled (:169-172)
 *   - done                    → success card, router.push after 2 s (:70-71, :99-111)
 *   - error branches          → 404 / 410 set `isLinkError` and show the
 *                               request-new-link affordance inside the alert;
 *                               422 {failures} maps through firstFailureMessage;
 *                               anything else → generic (:73-93)
 *   - confirm eye toggle      → closed/open reveal (:136-154)
 *
 * `lib/api` is mocked at the module boundary. `PasswordInput` is replaced by a
 * plain input (it owns its own network calls and is covered elsewhere) — the
 * same seam RegisterOAuthRedirect.test.jsx uses. `lib/passwordMessages` and
 * `lib/validators` are the REAL pure modules, so the 422 case drives the actual
 * failure→key mapping. Translator is a scoped bare-key one; messages are
 * asserted by i18n key, not Hebrew copy.
 *
 * Discrimination (MEH-1619): the PR's CI-side failing-by-construction run
 * mutated ProducerOAuthButtons (one component per the card); the equivalent
 * construction here is swapping the 404 branch's `setIsLinkError(true)` for
 * `false` — the 404 test then finds no link inside the alert while every other
 * case is unchanged. Not run in CI; stated so nobody reads it as evidence.
 */

const mockPush = vi.fn();
const paramsRef = { current: new URLSearchParams("") };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  useSearchParams: () => paramsRef.current,
}));

vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key) => (scope ? `${scope}.${key}` : key),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({ default: () => null }));

vi.mock("@phosphor-icons/react", () => ({
  Eye: () => null,
  EyeSlash: () => null,
  Leaf: () => null,
}));

const apiMock = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: apiMock }));

vi.mock("@/components/PasswordInput", async () => {
  const React = await import("react");
  return {
    default: ({ ariaLabel, value, onChange }) =>
      React.createElement("input", {
        "aria-label": ariaLabel,
        value: value || "",
        onChange,
        "data-testid": "pw",
      }),
  };
});

const R = (k) => `auth.passwordRecovery.reset.${k}`;
const LINK_NAME = R("request_new_link");
// PASSWORD_MIN_LENGTH is 12 (lib/validators.js:25) — 16 chars clears it.
const VALID = "correct-horse-ok";

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

function mountWithToken(token = "tok-123") {
  paramsRef.current = new URLSearchParams(token ? { token } : {});
  return render(<ResetPasswordClient />);
}

const pw = () => screen.getByTestId("pw");
const confirm = () => screen.getByPlaceholderText(R("confirm_placeholder"));
const submit = () => screen.getByRole("button", { name: R("submit") });

function fill(password, confirmation = password) {
  fireEvent.change(pw(), { target: { value: password } });
  fireEvent.change(confirm(), { target: { value: confirmation } });
}

const submitForm = () =>
  act(async () => {
    fireEvent.click(submit());
  });

beforeEach(() => {
  mockPush.mockClear();
  apiMock.post.mockReset();
  apiMock.post.mockResolvedValue({ data: {} });
  paramsRef.current = new URLSearchParams("");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ResetPasswordClient — missing token (:42-53)", () => {
  it("renders the invalid-link card with a link to /forgot-password and no form", () => {
    mountWithToken("");
    expect(screen.getByText(R("invalid_link"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: LINK_NAME })).toHaveAttribute("href", "/forgot-password");
    expect(screen.queryByTestId("pw")).toBeNull();
    expect(screen.queryByRole("button", { name: R("submit") })).toBeNull();
  });
});

describe("ResetPasswordClient — form gating and client-side checks (:59-66, :169)", () => {
  it("submit is disabled until BOTH fields carry a value", () => {
    mountWithToken();
    expect(submit()).toBeDisabled();
    fireEvent.change(pw(), { target: { value: VALID } });
    expect(submit()).toBeDisabled();
    fireEvent.change(confirm(), { target: { value: VALID } });
    expect(submit()).not.toBeDisabled();
  });

  it("too short → errors.too_short alert, no request", async () => {
    mountWithToken();
    fill("short");
    await submitForm();
    expect(screen.getByRole("alert")).toHaveTextContent(R("errors.too_short"));
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("mismatch → errors.mismatch alert, no request", async () => {
    mountWithToken();
    fill(VALID, `${VALID}x`);
    await submitForm();
    expect(screen.getByRole("alert")).toHaveTextContent(R("errors.mismatch"));
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("client-side errors never carry the request-new-link affordance", async () => {
    mountWithToken();
    fill("short");
    await submitForm();
    expect(screen.queryByRole("link", { name: LINK_NAME })).toBeNull();
  });
});

describe("ResetPasswordClient — success + loading (:67-71, :99-111)", () => {
  it("POSTs token + new_password, swaps to the success card, then redirects after 2 s", async () => {
    vi.useFakeTimers();
    mountWithToken("tok-123");
    fill(VALID);
    await submitForm();

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    expect(apiMock.post).toHaveBeenCalledWith("/auth/reset-password", {
      token: "tok-123",
      new_password: VALID,
    });
    expect(screen.getByText(R("success_title"))).toBeInTheDocument();
    expect(screen.getByText(R("success_subtitle"))).toBeInTheDocument();
    expect(screen.queryByTestId("pw")).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1999);
    });
    expect(mockPush).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(mockPush).toHaveBeenCalledWith("/login?reset=1");
  });

  it("while the request is in flight the button reads submit_updating and is disabled", async () => {
    const d = deferred();
    apiMock.post.mockReturnValueOnce(d.promise);
    mountWithToken();
    fill(VALID);
    await submitForm();

    const updating = screen.getByRole("button", { name: R("submit_updating") });
    expect(updating).toBeDisabled();
    expect(screen.queryByRole("button", { name: R("submit") })).toBeNull();

    await act(async () => {
      d.resolve({ data: {} });
      await d.promise;
    });
    expect(screen.getByText(R("success_title"))).toBeInTheDocument();
  });
});

describe("ResetPasswordClient — server error branches (:72-93)", () => {
  it("404 → errors.invalid_token + request-new-link inside the alert; form stays", async () => {
    apiMock.post.mockImplementationOnce(reject(404, "not found"));
    mountWithToken();
    fill(VALID);
    await submitForm();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(R("errors.invalid_token"));
    expect(screen.getByRole("link", { name: LINK_NAME })).toHaveAttribute("href", "/forgot-password");
    expect(alert).toContainElement(screen.getByRole("link", { name: LINK_NAME }));
    expect(screen.getByTestId("pw")).toBeInTheDocument();
    expect(submit()).not.toBeDisabled();
  });

  it("410 → errors.expired_token + request-new-link", async () => {
    apiMock.post.mockImplementationOnce(reject(410, "gone"));
    mountWithToken();
    fill(VALID);
    await submitForm();

    expect(screen.getByRole("alert")).toHaveTextContent(R("errors.expired_token"));
    expect(screen.getByRole("link", { name: LINK_NAME })).toBeInTheDocument();
  });

  it("422 {failures:[same_as_current]} → the policy message via the auth.passwordValidation scope, no link", async () => {
    apiMock.post.mockImplementationOnce(reject(422, { failures: ["same_as_current"] }));
    mountWithToken();
    fill(VALID);
    await submitForm();

    expect(screen.getByRole("alert")).toHaveTextContent("auth.passwordValidation.same_as_current");
    expect(screen.queryByRole("link", { name: LINK_NAME })).toBeNull();
  });

  it("422 with an unknown failure key falls back to auth.passwordValidation.fallback", async () => {
    apiMock.post.mockImplementationOnce(reject(422, { failures: ["something_new"] }));
    mountWithToken();
    fill(VALID);
    await submitForm();
    expect(screen.getByRole("alert")).toHaveTextContent("auth.passwordValidation.fallback");
  });

  it("422 WITHOUT a failures array is not a policy error → errors.generic", async () => {
    apiMock.post.mockImplementationOnce(reject(422, "Unprocessable"));
    mountWithToken();
    fill(VALID);
    await submitForm();
    expect(screen.getByRole("alert")).toHaveTextContent(R("errors.generic"));
    expect(screen.queryByRole("link", { name: LINK_NAME })).toBeNull();
  });

  it("500 → errors.generic, no link; a network error (no response) too", async () => {
    apiMock.post.mockImplementationOnce(reject(500, "boom"));
    const first = mountWithToken();
    fill(VALID);
    await submitForm();
    expect(screen.getByRole("alert")).toHaveTextContent(R("errors.generic"));
    expect(screen.queryByRole("link", { name: LINK_NAME })).toBeNull();
    first.unmount();

    apiMock.post.mockImplementationOnce(() => Promise.reject(new Error("Network Error")));
    mountWithToken();
    fill(VALID);
    await submitForm();
    expect(screen.getByRole("alert")).toHaveTextContent(R("errors.generic"));
  });

  it("a second submit clears the previous link-error before the new result lands", async () => {
    apiMock.post.mockImplementationOnce(reject(404, "not found"));
    mountWithToken();
    fill(VALID);
    await submitForm();
    expect(screen.getByRole("link", { name: LINK_NAME })).toBeInTheDocument();

    // Next attempt fails client-side (mismatch) — the stale 404 link must go.
    fireEvent.change(confirm(), { target: { value: `${VALID}x` } });
    await submitForm();
    expect(screen.getByRole("alert")).toHaveTextContent(R("errors.mismatch"));
    expect(screen.queryByRole("link", { name: LINK_NAME })).toBeNull();
  });
});

describe("ResetPasswordClient — confirm-field eye toggle (:136-154)", () => {
  it("closed by default (type=password, label toggle_show); open after click; closed again after a second click", () => {
    mountWithToken();
    const input = confirm();
    expect(input).toHaveAttribute("type", "password");

    const show = screen.getByRole("button", { name: R("toggle_show") });
    fireEvent.click(show);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.queryByRole("button", { name: R("toggle_show") })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: R("toggle_hide") }));
    expect(input).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: R("toggle_show") })).toBeInTheDocument();
  });
});
