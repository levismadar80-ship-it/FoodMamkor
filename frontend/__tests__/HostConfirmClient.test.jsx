/**
 * MEH-2674 — /delivery-waitlist/host-confirm: the click from the
 * «אישור: נקודת מסירה» mail. One case per end state: 200 · 410 resent ·
 * 410 not resent · 410 with an unrecognised body (reads as not resent) ·
 * 400 · missing token (no request at all).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

// A plain holder, not a vi.fn: under Vitest 4 a vi.fn whose implementation
// returns a rejected promise is reported as an unhandled rejection in this
// rig even though the component's .catch runs (bisected 05/11 — the
// DeliveryWaitlistForm sibling escapes it because its component awaits in a
// try/catch). Each case sets `post.impl`; `post.calls` records the args.
const post = vi.hoisted(() => ({ impl: null, calls: [] }));
vi.mock("@/lib/api", () => ({
  default: {
    post: (...a) => {
      post.calls.push(a);
      return post.impl(...a);
    },
  },
}));

import HostConfirmClient from "@/app/[locale]/delivery-waitlist/host-confirm/HostConfirmClient";

const T = he.delivery_waitlist_host_confirm;

function renderWith(token) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <HostConfirmClient token={token} />
    </NextIntlClientProvider>,
  );
}
const resolveWith = (data) => {
  post.impl = () => Promise.resolve({ status: 200, data });
};
const rejectWith = (status, data) => {
  post.impl = () => Promise.reject({ response: { status, data } });
};

beforeEach(() => {
  post.calls = [];
  post.impl = () => Promise.resolve({ status: 200, data: {} });
});

describe("HostConfirmClient (MEH-2674)", () => {
  it("POSTs the token and thanks with the business name on 200", async () => {
    resolveWith({ producer_name: "משק הזית" });
    renderWith("tok");
    await screen.findByTestId("host-confirm-success");
    expect(post.calls).toEqual([["/delivery-waitlist/host-confirm", { token: "tok" }]]);
    expect(screen.getByRole("heading").textContent).toBe(
      T.success_title.replace("{producer}", "משק הזית"),
    );
  });

  it("410 resent → «שלחנו לכם קישור חדש»", async () => {
    rejectWith(410, { detail: "x", resent: true });
    renderWith("tok");
    await screen.findByTestId("host-confirm-expired-resent");
    expect(screen.getByRole("heading").textContent).toBe(T.expired_resent_title);
  });

  it("410 not resent, and 410 with an unknown body, → «קישור עדכני יותר כבר נשלח»", async () => {
    rejectWith(410, { detail: "x", resent: false });
    const first = renderWith("tok");
    await screen.findByTestId("host-confirm-expired");
    expect(screen.getByRole("heading").textContent).toBe(T.expired_title);
    first.unmount();
    rejectWith(410, "gone");
    renderWith("tok2");
    await screen.findByTestId("host-confirm-expired");
  });

  it("400 → «הקישור לא תקין או שפג תוקפו.»", async () => {
    rejectWith(400, { detail: "x" });
    renderWith("tok");
    await screen.findByTestId("host-confirm-error");
    expect(screen.getByRole("heading").textContent).toBe(T.error_title);
  });

  it("no token → error page without any request", async () => {
    renderWith("");
    await screen.findByTestId("host-confirm-error");
    await waitFor(() => expect(post.calls).toEqual([]));
  });
});
