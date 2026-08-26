/**
 * Module:   QueueSlaSummary.test
 * Purpose:  MEH-2138 chunk E — the queue counter above the admin producers
 *           table. Asserts WHAT it counts, WHICH row it calls oldest, and the
 *           two states where it must render nothing.
 * Does NOT: re-test business-day arithmetic. `business_days_waiting` is
 *           computed server-side and covered by tests/test_admin_queue_sla_aging.py;
 *           this component only reads it.
 * Related:  app/[locale]/admin/producers/QueueSlaSummary.jsx
 * History:  MEH-2138 chunk E (creation).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import QueueSlaSummary from "@/app/[locale]/admin/producers/QueueSlaSummary";

const row = (over = {}) => ({
  id: Math.random().toString(36).slice(2),
  status: "pending",
  business_days_waiting: 0,
  ...over,
});

function renderSummary(rows) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <QueueSlaSummary rows={rows} />
    </NextIntlClientProvider>,
  );
}

const el = () => screen.queryByTestId("queue-sla-summary");

describe("QueueSlaSummary (MEH-2138 chunk E)", () => {
  it("CONTROL: the copy carries BOTH placeholders", () => {
    // If `queue_summary` lost `{count}` or `{days}`, every assertion below that
    // reads data-count / data-oldest would still pass — those come from props,
    // not from the string — while the rendered line silently stopped saying
    // one of the two numbers. This is the only check that looks at the copy.
    const s = he.admin.producers.queue_summary;
    expect(s).toContain("{count}");
    expect(s).toContain("{days}");
  });

  it("counts only the rows that are actually waiting on us", () => {
    // A draft has not asked to be reviewed; approved/rejected are not waiting.
    // Counting them would inflate the queue with work nobody requested.
    renderSummary([
      row({ status: "pending", business_days_waiting: 1 }),
      row({ status: "pending", business_days_waiting: 4 }),
      row({ status: "draft", business_days_waiting: 99 }),
      row({ status: "approved", business_days_waiting: 50 }),
      row({ status: "rejected", business_days_waiting: 12 }),
    ]);
    expect(el()).toHaveAttribute("data-count", "2");
  });

  it("reports the OLDEST waiting row, not the first or the last", () => {
    // Deliberately unsorted, with the max in the middle: a component that took
    // rows[0] or rows.at(-1) would pass on a sorted fixture and be wrong here.
    renderSummary([
      row({ business_days_waiting: 1 }),
      row({ business_days_waiting: 7 }),
      row({ business_days_waiting: 3 }),
    ]);
    expect(el()).toHaveAttribute("data-oldest", "7");
  });

  it("a draft older than every pending row does not become 'the oldest'", () => {
    // The pair to the count test: excluded rows must not leak into the max
    // either. Without this, filtering the count but reducing over all rows
    // would still pass the test above.
    renderSummary([
      row({ status: "pending", business_days_waiting: 2 }),
      row({ status: "draft", business_days_waiting: 40 }),
    ]);
    expect(el()).toHaveAttribute("data-count", "1");
    expect(el()).toHaveAttribute("data-oldest", "2");
  });

  it("renders nothing when the queue is empty", () => {
    renderSummary([]);
    expect(el()).toBeNull();
  });

  it("renders nothing when rows exist but none is waiting", () => {
    // Distinct from the empty case: a busy board with an empty QUEUE must not
    // show «0 ממתינים».
    renderSummary([row({ status: "approved" }), row({ status: "draft" })]);
    expect(el()).toBeNull();
  });

  it("is defensive about a missing rows prop", () => {
    render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <QueueSlaSummary />
      </NextIntlClientProvider>,
    );
    expect(el()).toBeNull();
  });

  it("a row with no business_days_waiting counts as 0, not NaN", () => {
    renderSummary([row({ business_days_waiting: undefined })]);
    expect(el()).toHaveAttribute("data-oldest", "0");
    expect(el().textContent).not.toContain("NaN");
  });

  describe("tone thresholds mirror the row badge", () => {
    // 0–1 neutral · 2 amber · >=3 red (breach of «עד 3 ימי עסקים»). Two
    // different answers to "is this late" on one screen would be worse than
    // none, so these are pinned against the badge's boundaries.
    const toneOf = (days) => {
      const { unmount } = renderSummary([row({ business_days_waiting: days })]);
      const cls = el().className;
      unmount();
      return cls;
    };

    it("0 and 1 are neutral", () => {
      expect(toneOf(0)).toContain("bg-gray-100");
      expect(toneOf(1)).toContain("bg-gray-100");
    });

    it("2 is amber — the day before the promise is broken", () => {
      expect(toneOf(2)).toContain("bg-amber-100");
    });

    it("3 and above are red", () => {
      expect(toneOf(3)).toContain("bg-red-100");
      expect(toneOf(9)).toContain("bg-red-100");
    });
  });
});
