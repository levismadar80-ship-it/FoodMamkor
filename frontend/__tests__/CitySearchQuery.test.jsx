/**
 * MEH-2241 chunk A (MEH-2270) — CitySearch queries the canonical cities table
 * per value instead of fetching the first 20 names once.
 *
 * Why this exists: `GET /cities` has been a prefix search capped at 20 rows
 * since MEH-1343, so the old "fetch once, no q" call only ever knew the first
 * 20 names alphabetically (all «אבו…») and «שדות ים» could never be suggested
 * even with the table fully seeded — measured on staging 06/09.
 *
 * DISCRIMINATION (testing.md, MEH-1619): every case in the first describe is
 * red against the pre-change component — it never sends `q`, never renders a
 * non-static name for a typed value, and calls onChange with ONE argument. The
 * failing run against origin/staging's CitySearch.jsx is in the PR body.
 *
 * The CONTROL describe pins the behaviours that must NOT change: a one-arg
 * consumer keeps working, `useBackend={false}` never talks to the network, and
 * the static list still answers without any fetch.
 *
 * Harness shape reused from CitySearchActiveDescendant.test.jsx (same intl
 * provider, same api mock).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import CitySearch from "@/components/CitySearch";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

const DEBOUNCE = 250;
// Not in data/cities.js (asserted below) — only the fetch can produce it.
const SEEDED_ONLY = "שדות ים";

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function Harness({ initial = "", onChangeSpy, onKnownChange, useBackend = true }) {
  const [city, setCity] = useState(initial);
  return (
    <CitySearch
      id="cs"
      label="עיר"
      value={city}
      onChange={(v, meta) => {
        setCity(v);
        onChangeSpy?.(v, meta);
      }}
      onKnownChange={onKnownChange}
      useBackend={useBackend}
    />
  );
}

function mount(props = {}) {
  const utils = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <Harness {...props} />
    </NextIntlClientProvider>,
  );
  const input = document.getElementById("cs");
  return { ...utils, input };
}

const typed = (input, text) => {
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
};
const optionTexts = () => [...document.querySelectorAll('[role="option"]')].map((li) => li.textContent);
const flush = () => act(async () => {});

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("MEH-2270 — one debounced query per value, results merged into the list", () => {
  it("sends GET /cities with q=<value> once the debounce elapses, and only for the latest value", async () => {
    const { input } = mount();
    typed(input, "שד");
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE - 50);
    });
    typed(input, "שדות");
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE);
    });
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/cities", { params: { q: "שדות" } });
  });

  it("renders a seeded-only name the static list does not carry", async () => {
    const { ISRAEL_CITIES } = await import("@/data/cities");
    expect(ISRAEL_CITIES).not.toContain(SEEDED_ONLY);
    // Shaped like the real endpoint (cities.py): a prefix search that answers
    // the query it was asked, and the first 20 names alphabetically when asked
    // nothing — which is all the pre-change component ever asked.
    api.get.mockImplementation((path, opts) =>
      Promise.resolve({
        data:
          opts?.params?.q === "שדות" ? [SEEDED_ONLY, "שדות מיכה"] : ["אבו גוש", "אבו סנאן"],
      }),
    );

    const { input } = mount();
    typed(input, "שדות");
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE);
    });
    await flush();
    expect(optionTexts()).toContain(SEEDED_ONLY);
  });

  it("does not query below two characters", async () => {
    const { input } = mount();
    typed(input, "ש");
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE * 2);
    });
    expect(api.get).not.toHaveBeenCalled();
  });

  it("drops a stale response that lands after a newer query resolved", async () => {
    const first = deferred();
    const second = deferred();
    api.get.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);

    const { input } = mount();
    typed(input, "כפ");
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE);
    });
    typed(input, "כפר ת");
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE);
    });
    expect(api.get).toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve({ data: ["כפר תבור"] });
    });
    await act(async () => {
      first.resolve({ data: ["כפ-ישן"] });
    });
    await flush();
    const shown = optionTexts();
    expect(shown).toContain("כפר תבור");
    expect(shown).not.toContain("כפ-ישן");
  });
});

describe("MEH-2270 — onChange(value, { known }) and the async onKnownChange", () => {
  it("typed free text is not known; a name that arrives from the fetch flips it through onKnownChange", async () => {
    const onChangeSpy = vi.fn();
    const onKnownChange = vi.fn();
    api.get.mockResolvedValue({ data: [SEEDED_ONLY] });

    const { input } = mount({ onChangeSpy, onKnownChange });
    typed(input, SEEDED_ONLY);
    expect(onChangeSpy).toHaveBeenLastCalledWith(SEEDED_ONLY, { known: false });
    expect(onKnownChange).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE);
    });
    await flush();
    expect(onKnownChange).toHaveBeenCalledTimes(1);
    expect(onKnownChange).toHaveBeenLastCalledWith(true);
    // The value itself was NOT re-emitted (DeliveryChecker resets on every onChange).
    expect(onChangeSpy).toHaveBeenCalledTimes(1);
  });

  it("a static-list name is known at emit time, and picking an option reports known: true", () => {
    const onChangeSpy = vi.fn();
    const { input } = mount({ onChangeSpy, useBackend: false });
    typed(input, "כפר סבא");
    expect(onChangeSpy).toHaveBeenLastCalledWith("כפר סבא", { known: true });

    typed(input, "כפר");
    expect(onChangeSpy).toHaveBeenLastCalledWith("כפר", { known: false });
    const first = document.querySelector('[role="option"]');
    fireEvent.mouseDown(first);
    expect(onChangeSpy).toHaveBeenLastCalledWith(first.textContent, { known: true });
  });

  it("clearing reports an empty, unknown value", () => {
    const onChangeSpy = vi.fn();
    const { getByRole } = mount({ initial: "כפר סבא", onChangeSpy, useBackend: false });
    // Reviewer minor on #3449: address the clear button by its accessible
    // name, not "the first labelled button in the document".
    fireEvent.click(getByRole("button", { name: he.search.city_search.clear_aria }));
    expect(onChangeSpy).toHaveBeenLastCalledWith("", { known: false });
  });
});

describe("CONTROL — unchanged behaviour (green on both versions)", () => {
  it("a one-argument consumer still receives the value", () => {
    const seen = [];
    function OneArg() {
      const [city, setCity] = useState("");
      return (
        <CitySearch
          id="cs"
          label="עיר"
          value={city}
          onChange={(v) => {
            seen.push(v);
            setCity(v);
          }}
          useBackend={false}
        />
      );
    }
    render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <OneArg />
      </NextIntlClientProvider>,
    );
    const input = document.getElementById("cs");
    typed(input, "כפר");
    expect(seen).toEqual(["כפר"]);
  });

  it("useBackend={false} never touches the network and the static list still answers", async () => {
    const { input } = mount({ useBackend: false });
    typed(input, "כפר");
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE * 2);
    });
    expect(api.get).not.toHaveBeenCalled();
    expect(optionTexts().length).toBeGreaterThan(0);
  });
});
