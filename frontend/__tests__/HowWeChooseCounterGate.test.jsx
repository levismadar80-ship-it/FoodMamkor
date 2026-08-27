/**
 * MEH-2193 — the /about "how we choose" live counter is data-gated and SILENT.
 *
 * The card's rule: render the line ONLY at >= 10 approved businesses; render
 * nothing below that and nothing on a fetch failure, with zero layout shift and
 * no spinner in the hidden cases. That is four distinct states, and the two
 * that matter most are the ones where the correct behaviour is "nothing
 * appears" — which is also what a completely dead component produces.
 *
 * So this file does not only assert absence. Each hidden case is paired with a
 * POSITIVE control asserting the block itself did render (its facts and its
 * process link are present), which is what separates "the counter was
 * correctly withheld" from "the component never mounted" — the two worlds a
 * bare `queryByTestId(...)).toBeNull()` cannot tell apart.
 *
 * Discrimination, run before this test was trusted (MEH-1619): with the gate
 * weakened to `count !== null` — i.e. the ungated version this test exists to
 * reject — the count=9 and fetch-reject cases both go red, and only the
 * count=10 case stays green. Recorded in the PR body.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    const flat = {
      eyebrow: "איך אנחנו בוחרות",
      fact1: "רק עסקים עם רישיון",
      fact2: "אישור ידני לכל עסק",
      fact3: "אפס עמלות — תמיד",
      process_link: "איך תהליך האישור עובד",
      count: `כרגע ${vars?.count ?? 0} בתי עסק מאושרים`,
    };
    return flat[key] ?? key;
  },
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@phosphor-icons/react", () => ({
  ArrowLeft: () => null,
}));

const apiGet = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...args) => apiGet(...args) } }));

import HowWeChoose from "@/app/[locale]/about/HowWeChoose";

/** The block rendered at all — the control every hidden case is read against. */
async function expectBlockRendered() {
  expect(await screen.findByText("רק עסקים עם רישיון")).toBeTruthy();
  expect(screen.getByTestId("how-we-choose-process-link")).toBeTruthy();
}

describe("MEH-2193 — HowWeChoose live counter gate", () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it("renders the counter at the threshold (count = 10)", async () => {
    apiGet.mockResolvedValue({ data: { count: 10 } });
    render(<HowWeChoose />);

    const line = await screen.findByTestId("how-we-choose-count");
    expect(line.textContent).toContain("10");
    await expectBlockRendered();
  });

  it("hides the counter below the threshold (count = 9) while still rendering the block", async () => {
    apiGet.mockResolvedValue({ data: { count: 9 } });
    render(<HowWeChoose />);

    await expectBlockRendered();
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/producers/count"));
    expect(screen.queryByTestId("how-we-choose-count")).toBeNull();
    // 9 must not leak into the block in any other form either.
    expect(screen.queryByText(/9/)).toBeNull();
  });

  it("hides the counter when the fetch rejects, silently", async () => {
    apiGet.mockRejectedValue(new Error("network"));
    render(<HowWeChoose />);

    await expectBlockRendered();
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/producers/count"));
    expect(screen.queryByTestId("how-we-choose-count")).toBeNull();
  });

  it("hides the counter on a non-numeric payload", async () => {
    apiGet.mockResolvedValue({ data: { count: null } });
    render(<HowWeChoose />);

    await expectBlockRendered();
    expect(screen.queryByTestId("how-we-choose-count")).toBeNull();
  });

  it("issues exactly one count request per mount", async () => {
    apiGet.mockResolvedValue({ data: { count: 42 } });
    render(<HowWeChoose />);

    await screen.findByTestId("how-we-choose-count");
    const countCalls = apiGet.mock.calls.filter(([url]) => url === "/producers/count");
    expect(countCalls).toHaveLength(1);
  });
});
