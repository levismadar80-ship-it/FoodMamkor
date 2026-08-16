import { describe, it, vi, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { mkdirSync, writeFileSync } from "node:fs";

import he from "../messages/he.json";
import { OrderWindowScheduleBlock } from "@/app/[locale]/producer/[id]/components/OrderWindowStrip";

/**
 * MEH-1917 self-QA markup dump — NOT an assertion suite.
 *
 * The sandbox has no backend, so /producer/[id] cannot be SSR-populated. This
 * writes the REAL block's markup in each disclosure state so
 * e2e/qa-meh1917-order-window.mjs can shoot it against the app's own built CSS.
 * Same harness shape as __tests__/qa-meh1901-markup.test.jsx (MEH-1463
 * precedent); skipped unless MEH1917_QA=1.
 *
 * The clock is pinned to a Wednesday so the "היום" marker is deterministic —
 * an unpinned run would photograph a different row every day.
 *
 * Usage: MEH1917_QA=1 npx vitest run __tests__/qa-meh1917-markup.test.jsx
 */

const SUN_THU = {
  sunday: [{ open: "09:00", close: "14:00" }],
  monday: [{ open: "09:00", close: "14:00" }],
  tuesday: [{ open: "09:00", close: "14:00" }],
  // Wednesday carries a split window, so the expanded shot shows both the
  // today marker AND stacked ranges in one frame.
  wednesday: [
    { open: "09:00", close: "13:00" },
    { open: "16:00", close: "19:00" },
  ],
  thursday: [{ open: "09:00", close: "14:00" }],
};

const OUT = "../qa-artifacts/MEH-1917";

const renderBlock = (orderWindow) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <OrderWindowScheduleBlock orderWindow={orderWindow} />
    </NextIntlClientProvider>,
  );

afterEach(() => vi.useRealTimers());

describe.skipIf(process.env.MEH1917_QA !== "1")("MEH-1917 markup dump", () => {
  it("dumps the collapsed and expanded states", () => {
    mkdirSync(OUT, { recursive: true });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T12:00:00Z")); // Wednesday

    const collapsed = renderBlock(SUN_THU);
    writeFileSync(`${OUT}/order-window-collapsed.html`, collapsed.container.innerHTML);
    fireEvent.click(collapsed.getByTestId("order-window-week-toggle"));
    writeFileSync(`${OUT}/order-window-expanded.html`, collapsed.container.innerHTML);
    collapsed.unmount();

    // A window with nothing merged: the disclosure must be absent entirely.
    const unmerged = renderBlock({
      sunday: [{ open: "09:00", close: "13:00" }],
      monday: [{ open: "10:00", close: "15:00" }],
    });
    writeFileSync(`${OUT}/order-window-unmerged.html`, unmerged.container.innerHTML);
    unmerged.unmount();
  });
});
