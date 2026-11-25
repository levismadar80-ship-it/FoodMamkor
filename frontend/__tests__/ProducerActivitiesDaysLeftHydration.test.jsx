import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";

// MEH-3819: the business page's group-buy rows are in the cached server HTML of
// /{slug} and are hydrated later, when "days left" may already be one less. The
// hydration must not fail on that (React would re-render the subtree in the
// browser, which is a layout shift), and the row must end on the browser's count.

vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  useFormatter: () => ({ dateTime: () => "יום ו׳" }),
  useLocale: () => "he",
}));
vi.mock("@/components/SaveButton", () => ({ default: () => null }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(() => Promise.resolve({ data: [] })) } }));

import ProducerActivities from "@/app/[locale]/producer/[id]/components/ProducerActivities";

const DAY = 86400000;
const DEADLINE = "2030-01-10T00:00:00Z";
const GB = {
  id: "gb1", title: "מארז דבש", product_name: "דבש", status: "open",
  commits_count: 2, min_participants: 10, deadline: DEADLINE,
  price_per_unit_regular: "50", price_per_unit_group: "40",
};
const tree = <ProducerActivities producerId="p-1" events={[]} experiences={[]} groupBuys={[GB]} />;

afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ""; });

describe("group-buy days left survive a late hydration (MEH-3819)", () => {
  it("server HTML made 3 days before the deadline, hydrated 1.5 days later: no hydration error, the browser's count wins", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse(DEADLINE) - 3 * DAY);
    const html = renderToString(tree);
    expect(html).toContain('days_left:{&quot;days&quot;:3}');

    vi.setSystemTime(Date.parse(DEADLINE) - 1.5 * DAY);
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    const recoverable = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      hydrateRoot(host, tree, { onRecoverableError: (e) => recoverable.push(e) });
    });
    const hydrationLogs = consoleError.mock.calls.filter((c) => /hydrat|did not match/i.test(String(c[0])));
    consoleError.mockRestore();

    expect(recoverable).toEqual([]);
    expect(hydrationLogs).toEqual([]);
    expect(host.textContent).toContain('days_left:{"days":2}');
    expect(host.textContent).not.toContain('days_left:{"days":3}');
  });
});
