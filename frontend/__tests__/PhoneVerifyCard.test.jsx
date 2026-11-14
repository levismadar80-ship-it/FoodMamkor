import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import PhoneVerifyCard from "@/components/PhoneVerifyCard";

/**
 * MEH-2279 — state-machine coverage for PhoneVerifyCard (was 0/43 statements
 * in the MEH-1980 gap report).
 *
 * The card is a two-step OTP flow (components/PhoneVerifyCard.jsx):
 *   send    — POST /producers/me/verify-phone (:42-58). Success reveals the
 *             code row and arms a 60 s resend cooldown (:48-49) that ticks
 *             down one second at a time (:36-40). 400 → inline error, 429 →
 *             toast only, anything else → generic inline error (:51-54).
 *   confirm — POST /producers/me/verify-phone/confirm {code} (:60-76), gated on
 *             exactly OTP_LENGTH digits (:61, :123); the input strips
 *             non-digits and caps at 6 (:116). Success → toast + onVerified.
 *
 * The 5-state matrix for the reveal: code row hidden before send (0), shown
 * after a successful send (1 — it is a single row, there is no "many"), and
 * NOT shown after a failed send. Cooldown: 60 → 59 (ticking) → 0 (released).
 *
 * `lib/api` is mocked at the module boundary; the translator is a scoped
 * bare-key one that also renders ICU values as `key|k=v`, so the countdown
 * label is asserted on the actual `seconds` it was given.
 *
 * Discrimination (MEH-1619): the PR's CI-side failing-by-construction run
 * mutated ProducerOAuthButtons (one component per the card); the equivalent
 * construction here is `if (sc === 400)` → `401` in handleSend, which sends
 * the 400 case to the generic branch and reds exactly "400 → error_no_phone"
 * while the 429/500 and confirm cases stay green. Not run in CI; stated so
 * nobody reads it as evidence.
 */

const apiMock = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: apiMock }));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: toastMock }));

vi.mock("@/lib/errors", () => ({
  detailToMessage: (detail) => (typeof detail === "string" && detail ? detail : null),
}));

vi.mock("@phosphor-icons/react", () => ({ ChatCircleText: () => null }));

vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key, values) => {
    const full = scope ? `${scope}.${key}` : key;
    if (!values || Object.keys(values).length === 0) return full;
    return `${full}|${Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join(",")}`;
  },
}));

const T = (k) => `dashboard.producer.phone_verify.${k}`;
const SEND_URL = "/producers/me/verify-phone";
const CONFIRM_URL = "/producers/me/verify-phone/confirm";

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

const sendBtn = () => screen.getByRole("button", { name: new RegExp(`^${T("send_cta")}$`) });
const sendBtnAny = () => screen.getAllByRole("button")[0];
const codeInput = () => screen.getByLabelText(T("code_label"));
const confirmBtn = () => screen.getByRole("button", { name: T("confirm_cta") });

// MEH-3126: the 6th digit verifies on its own, so "type the code" is the
// confirm action; await it so the POST settles inside act().
const typeCode = (value) =>
  act(async () => {
    fireEvent.change(codeInput(), { target: { value } });
  });

const click = (el) =>
  act(async () => {
    fireEvent.click(el);
  });

async function sendOk(onVerified) {
  const utils = render(<PhoneVerifyCard onVerified={onVerified} />);
  await click(sendBtn());
  return utils;
}

beforeEach(() => {
  apiMock.post.mockReset();
  apiMock.post.mockResolvedValue({ data: {} });
  toastMock.success.mockClear();
  toastMock.error.mockClear();
  // MEH-2481: the card remembers a sent code in sessionStorage; every spec
  // starts with a clean tab.
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

const SENT_AT_KEY = "mehamakor.otp_sent_at";

describe("PhoneVerifyCard — a sent code survives a reload (MEH-2481)", () => {
  it("a successful send records the moment in sessionStorage", async () => {
    await sendOk();
    const ts = Number(window.sessionStorage.getItem(SENT_AT_KEY));
    expect(Number.isFinite(ts) && ts > 0).toBe(true);
  });

  it("a fresh mount within 10 min opens on the code box with the remaining cooldown", () => {
    // Sent 45 s ago → 15 s of the 60 s cooldown are left; no new send happens.
    window.sessionStorage.setItem(SENT_AT_KEY, String(Date.now() - 45_000));
    render(<PhoneVerifyCard />);
    expect(codeInput()).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
    const btn = sendBtnAny();
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(`${T("resend_in")}|seconds=15`);
  });

  it("a fresh mount after 10 min ignores the stale record (the server code is dead too)", () => {
    window.sessionStorage.setItem(SENT_AT_KEY, String(Date.now() - 11 * 60_000));
    render(<PhoneVerifyCard />);
    expect(screen.queryByLabelText(T("code_label"))).toBeNull();
    expect(sendBtn()).not.toBeDisabled();
  });

  it("a successful confirm forgets the record", async () => {
    await sendOk();
    await typeCode("123456");
    expect(apiMock.post).toHaveBeenLastCalledWith(CONFIRM_URL, { code: "123456" });
    expect(window.sessionStorage.getItem(SENT_AT_KEY)).toBeNull();
  });
});

describe("PhoneVerifyCard — initial state (code row hidden)", () => {
  it("renders title + description, an enabled send button, no code input, no alert", () => {
    render(<PhoneVerifyCard />);
    expect(screen.getByText(T("title"))).toBeInTheDocument();
    expect(screen.getByText(T("description"))).toBeInTheDocument();
    expect(sendBtn()).not.toBeDisabled();
    expect(screen.queryByLabelText(T("code_label"))).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(apiMock.post).not.toHaveBeenCalled();
  });
});

describe("PhoneVerifyCard — send (:42-58)", () => {
  it("success: POSTs the send endpoint with no body, reveals the code row, arms the 60 s cooldown", async () => {
    await sendOk();

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    expect(apiMock.post).toHaveBeenCalledWith(SEND_URL);
    expect(codeInput()).toBeInTheDocument();
    expect(confirmBtn()).toBeDisabled();
    const btn = sendBtnAny();
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(`${T("resend_in")}|seconds=60`);
  });

  it("while sending: button disabled and labelled `sending`; released on completion", async () => {
    const d = deferred();
    apiMock.post.mockReturnValueOnce(d.promise);
    render(<PhoneVerifyCard />);
    await click(sendBtn());

    const btn = sendBtnAny();
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(T("sending"));
    expect(screen.queryByLabelText(T("code_label"))).toBeNull();

    await act(async () => {
      d.resolve({ data: {} });
      await d.promise;
    });
    expect(codeInput()).toBeInTheDocument();
    expect(btn).toHaveTextContent(`${T("resend_in")}|seconds=60`);
  });

  it("the cooldown ticks down once per second and releases the button at zero", async () => {
    vi.useFakeTimers();
    await sendOk();
    const btn = sendBtnAny();
    expect(btn).toHaveTextContent("seconds=60");

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(btn).toHaveTextContent("seconds=59");
    expect(btn).toBeDisabled();

    // One setTimeout per tick (the effect re-arms on every decrement), so the
    // clock has to be advanced tick by tick — a single 59 s jump fires only one.
    for (let i = 0; i < 58; i += 1) {
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
    }
    expect(btn).toHaveTextContent("seconds=1");
    expect(btn).toBeDisabled();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(btn).toHaveTextContent(T("send_cta"));
    expect(btn).not.toBeDisabled();
    // The code row survives the cooldown expiring — resend, not reset.
    expect(codeInput()).toBeInTheDocument();
  });

  it("a click during cooldown sends nothing", async () => {
    await sendOk();
    await click(sendBtnAny());
    expect(apiMock.post).toHaveBeenCalledTimes(1);
  });

  it("400 → error_no_phone alert, code row stays hidden, no toast", async () => {
    apiMock.post.mockImplementationOnce(reject(400, "no phone"));
    render(<PhoneVerifyCard />);
    await click(sendBtn());

    expect(screen.getByRole("alert")).toHaveTextContent(T("error_no_phone"));
    expect(screen.queryByLabelText(T("code_label"))).toBeNull();
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(sendBtn()).not.toBeDisabled();
  });

  it("429 with a backend detail → toast carries the detail; no inline alert", async () => {
    apiMock.post.mockImplementationOnce(reject(429, "יותר מדי ניסיונות, נסו שוב בעוד דקה"));
    render(<PhoneVerifyCard />);
    await click(sendBtn());

    expect(toastMock.error).toHaveBeenCalledWith("יותר מדי ניסיונות, נסו שוב בעוד דקה");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByLabelText(T("code_label"))).toBeNull();
  });

  it("429 without a detail → toast falls back to error_rate_limited", async () => {
    apiMock.post.mockImplementationOnce(reject(429, undefined));
    render(<PhoneVerifyCard />);
    await click(sendBtn());
    expect(toastMock.error).toHaveBeenCalledWith(T("error_rate_limited"));
  });

  it("500 → error_generic alert; a network error (no response) too", async () => {
    apiMock.post.mockImplementationOnce(reject(500, "boom"));
    const first = render(<PhoneVerifyCard />);
    await click(sendBtn());
    expect(screen.getByRole("alert")).toHaveTextContent(T("error_generic"));
    first.unmount();

    apiMock.post.mockImplementationOnce(() => Promise.reject(new Error("Network Error")));
    render(<PhoneVerifyCard />);
    await click(sendBtn());
    expect(screen.getByRole("alert")).toHaveTextContent(T("error_generic"));
  });

  it("a retry after an error clears the previous alert", async () => {
    apiMock.post.mockImplementationOnce(reject(400, "no phone"));
    render(<PhoneVerifyCard />);
    await click(sendBtn());
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await click(sendBtn());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(codeInput()).toBeInTheDocument();
  });
});

describe("PhoneVerifyCard — code input + confirm (:60-76, :108-127)", () => {
  it("input keeps digits only and caps at 6; confirm enables only at exactly 6", async () => {
    await sendOk();
    const input = codeInput();

    fireEvent.change(input, { target: { value: "12ab34" } });
    expect(input).toHaveValue("1234");
    expect(confirmBtn()).toBeDisabled();

    await typeCode("1234567"); // MEH-3126: 6 digits also auto-confirm
    expect(input).toHaveValue("123456");
    expect(confirmBtn()).not.toBeDisabled();

    fireEvent.change(input, { target: { value: "12345" } });
    expect(confirmBtn()).toBeDisabled();
  });

  it("confirm success: POSTs {code}, toasts success, calls onVerified", async () => {
    const onVerified = vi.fn();
    await sendOk(onVerified);
    await typeCode("123456");

    expect(apiMock.post).toHaveBeenLastCalledWith(CONFIRM_URL, { code: "123456" });
    expect(toastMock.success).toHaveBeenCalledWith(T("success"));
    expect(onVerified).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("confirm success without an onVerified prop does not throw", async () => {
    await sendOk(undefined);
    await typeCode("123456");
    expect(toastMock.success).toHaveBeenCalledTimes(1);
  });

  it("while confirming: button disabled and labelled `confirming`", async () => {
    await sendOk();
    const d = deferred();
    apiMock.post.mockReturnValueOnce(d.promise);
    await typeCode("123456");

    const busy = screen.getByRole("button", { name: T("confirming") });
    expect(busy).toBeDisabled();

    await act(async () => {
      d.resolve({ data: {} });
      await d.promise;
    });
    expect(screen.getByRole("button", { name: T("confirm_cta") })).toBeInTheDocument();
  });

  it("confirm 400 → error_invalid alert, onVerified NOT called, code row stays", async () => {
    const onVerified = vi.fn();
    await sendOk(onVerified);
    apiMock.post.mockImplementationOnce(reject(400, "wrong code"));
    await typeCode("000000");

    expect(screen.getByRole("alert")).toHaveTextContent(T("error_invalid"));
    expect(onVerified).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(codeInput()).toBeInTheDocument();
  });

  it("confirm 429 → toast (detail or fallback), no inline alert", async () => {
    await sendOk();
    apiMock.post.mockImplementationOnce(reject(429, undefined));
    await typeCode("000000");

    expect(toastMock.error).toHaveBeenCalledWith(T("error_rate_limited"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("confirm 500 → error_generic alert", async () => {
    await sendOk();
    apiMock.post.mockImplementationOnce(reject(500, "boom"));
    await typeCode("000000");
    expect(screen.getByRole("alert")).toHaveTextContent(T("error_generic"));
  });
});

describe("PhoneVerifyCard — the 6th digit verifies on its own (MEH-3126)", () => {
  const confirmCalls = () => apiMock.post.mock.calls.filter(([url]) => url === CONFIRM_URL);

  it("5 digits send nothing; the 6th sends exactly one confirm with that code", async () => {
    const onVerified = vi.fn();
    await sendOk(onVerified);
    await typeCode("12345");
    expect(confirmCalls()).toHaveLength(0);
    await typeCode("123456");
    expect(confirmCalls()).toEqual([[CONFIRM_URL, { code: "123456" }]]);
    expect(onVerified).toHaveBeenCalledTimes(1);
  });

  it("a pasted «123 456» keeps all six digits and verifies", async () => {
    await sendOk();
    await typeCode("123 456");
    expect(codeInput()).toHaveValue("123456");
    expect(confirmCalls()).toEqual([[CONFIRM_URL, { code: "123456" }]]);
  });

  it("the input has no maxLength that would cut a spaced paste", async () => {
    await sendOk();
    expect(codeInput()).not.toHaveAttribute("maxlength");
  });

  it("a wrong code is not re-sent until it changes; a new code is sent; the button still re-sends on purpose", async () => {
    await sendOk();
    apiMock.post.mockImplementationOnce(reject(400, "wrong code"));
    await typeCode("000000");
    expect(screen.getByRole("alert")).toHaveTextContent(T("error_invalid"));
    // Same value again (e.g. the field re-fires change) → no second request.
    await typeCode("00000");
    await typeCode("000000");
    expect(confirmCalls()).toHaveLength(1);
    await typeCode("111111");
    expect(confirmCalls()).toHaveLength(2);
    await click(confirmBtn());
    expect(confirmCalls()).toHaveLength(3);
  });

  it("while a confirm is in flight, typing does not send a second one", async () => {
    await sendOk();
    const d = deferred();
    apiMock.post.mockReturnValueOnce(d.promise);
    await typeCode("123456");
    await typeCode("654321");
    expect(confirmCalls()).toHaveLength(1);
    await act(async () => {
      d.resolve({ data: {} });
      await d.promise;
    });
  });
});
