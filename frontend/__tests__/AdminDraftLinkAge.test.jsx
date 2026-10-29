/**
 * MEH-2496 — «קישור נשלח ב-… · בתוקף עד …» and «ממתין 7+ ימים» on the drafts list.
 *
 * Rendered inside the real AdminProducersTable with the real he.json copy and
 * a FROZEN clock (testing.md: clock-dependent tests). Two clocks, two kinds
 * of boundary:
 *   - expiry is an INSTANT — sent + 14 × 24 h, exactly what the token enforces;
 *   - the 7-day marker is Israel CALENDAR days, pinned at the two hours the
 *     testing.md review question names: 21:30 / 22:30 UTC on the Monday after
 *     the October clock change (UTC+2) and after the March one (UTC+3).
 *     A UTC-date implementation answers wrong at exactly these instants.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";
import api from "@/lib/api";
import AdminProducersTable from "@/app/[locale]/admin/producers/AdminProducersTable";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn(), success: vi.fn() } }));

const D = he.admin.producers.table.draft_claim;
const sent = (date) => D.link_sent.replace("{date}", date);
const validUntil = (date) => D.link_valid_until.replace("{date}", date);

let seq = 0;
function row({ status = "draft", has_owner = false, claim_link_sent_at } = {}) {
  seq += 1;
  const r = {
    id: `p-${seq}`,
    name: `עסק ${seq}`,
    status,
    has_owner,
    created_at: "2026-10-01T10:00:00+00:00",
    _completeness: { missing: [], priority: "green" },
  };
  if (claim_link_sent_at !== undefined) r.claim_link_sent_at = claim_link_sent_at;
  return r;
}

function renderTable(rows, { onRetryLoad } = {}) {
  const noop = vi.fn();
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <AdminProducersTable
        rows={rows}
        incompleteOnly={false}
        storyCardOpenId={null}
        onSetStoryCardOpenId={noop}
        loadError={false}
        onRetryLoad={onRetryLoad || noop}
        onQuickApprove={noop}
        onRequestChanges={noop}
        onReject={noop}
        onToggleStatus={noop}
        onDeleteProducer={noop}
        onUploadStoryCard={noop}
        isBusy={() => false}
        page={1}
        totalPages={1}
        perPage={25}
        onPageChange={noop}
        onPerPageChange={noop}
        visibleCount={rows.length}
      />
    </NextIntlClientProvider>,
  );
}

const ages = () => screen.queryAllByTestId("draft-link-age");
const markers = () => screen.queryAllByTestId("draft-waiting-7");
const at = (iso) => vi.setSystemTime(new Date(iso));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.clearAllMocks();
  seq = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("which rows show it — 0 / 1 / many", () => {
  it("0 drafts: nothing", () => {
    at("2026-10-28T10:00:00Z");
    renderTable([]);
    expect(ages()).toHaveLength(0);
  });

  it("an ownerless draft never sent a link (NULL) shows nothing", () => {
    at("2026-10-28T10:00:00Z");
    renderTable([row({ claim_link_sent_at: null })]);
    expect(ages()).toHaveLength(0);
  });

  it("a claimed draft shows nothing, even with a stamp", () => {
    at("2026-10-28T10:00:00Z");
    renderTable([row({ has_owner: true, claim_link_sent_at: "2026-10-01T10:00:00Z" })]);
    expect(ages()).toHaveLength(0);
    expect(markers()).toHaveLength(0);
  });

  it("a pending row shows nothing, even with a stamp", () => {
    at("2026-10-28T10:00:00Z");
    renderTable([row({ status: "pending", claim_link_sent_at: "2026-10-01T10:00:00Z" })]);
    expect(ages()).toHaveLength(0);
  });

  it("a draft whose payload has no has_owner shows nothing (fails closed)", () => {
    at("2026-10-28T10:00:00Z");
    const r = row({ claim_link_sent_at: "2026-10-27T10:00:00Z" });
    delete r.has_owner;
    renderTable([r]);
    expect(ages()).toHaveLength(0);
  });

  it("an unparseable stamp shows nothing rather than «Invalid Date»", () => {
    at("2026-10-28T10:00:00Z");
    renderTable([row({ claim_link_sent_at: "not a date" })]);
    expect(ages()).toHaveLength(0);
  });

  it("1 fresh link: sent date + valid-until (sent + 14 days), no marker", () => {
    at("2026-10-28T10:00:00Z");
    renderTable([row({ claim_link_sent_at: "2026-10-27T09:00:00Z" })]);
    expect(screen.getByTestId("draft-link-sent")).toHaveTextContent(sent("27.10.2026"));
    expect(screen.getByTestId("draft-link-valid-until")).toHaveTextContent(validUntil("10.11.2026"));
    expect(screen.queryByTestId("draft-link-expired")).not.toBeInTheDocument();
    expect(markers()).toHaveLength(0);
  });

  it("many rows: each row reads its own stamp", () => {
    at("2026-10-28T10:00:00Z");
    renderTable([
      row({ claim_link_sent_at: "2026-10-27T09:00:00Z" }), // fresh
      row({ claim_link_sent_at: "2026-10-20T09:00:00Z" }), // 8 days, valid
      row({ claim_link_sent_at: "2026-10-01T09:00:00Z" }), // expired
      row({ claim_link_sent_at: null }), // never sent
      row({ has_owner: true, claim_link_sent_at: "2026-10-01T09:00:00Z" }), // claimed
    ]);
    expect(ages()).toHaveLength(3);
    expect(markers()).toHaveLength(2);
    expect(screen.getAllByTestId("draft-link-expired")).toHaveLength(1);
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).queryByTestId("draft-waiting-7")).not.toBeInTheDocument();
    expect(within(rows[1]).getByTestId("draft-waiting-7")).toHaveTextContent(D.waiting_7_days);
    expect(within(rows[2]).getByTestId("draft-link-expired")).toHaveTextContent(D.link_expired);
  });
});

describe("expiry is an instant: sent + 14 × 24 h", () => {
  const SENT = "2026-10-10T09:00:00Z"; // expires 2026-10-24T09:00:00Z

  it("one second before: still valid, with its date", () => {
    at("2026-10-24T08:59:59Z");
    renderTable([row({ claim_link_sent_at: SENT })]);
    expect(screen.getByTestId("draft-link-valid-until")).toHaveTextContent(validUntil("24.10.2026"));
    expect(screen.queryByTestId("draft-link-expired")).not.toBeInTheDocument();
  });

  it("at the instant: «הקישור פג — צרו חדש» replaces the valid-until line", () => {
    at("2026-10-24T09:00:00Z");
    renderTable([row({ claim_link_sent_at: SENT })]);
    expect(screen.getByTestId("draft-link-expired")).toHaveTextContent(D.link_expired);
    expect(screen.queryByTestId("draft-link-valid-until")).not.toBeInTheDocument();
    // Still no owner and long past 7 days: the marker stays with the expiry.
    expect(markers()).toHaveLength(1);
    expect(screen.getByTestId("draft-link-sent")).toHaveTextContent(sent("10.10.2026"));
  });
});

describe("«ממתין 7+ ימים» counts Israel calendar days", () => {
  // October: Israel left DST on Sun 25.10.2026 → UTC+2, so the Israel day
  // turns at 22:00 UTC. Sent 20.10 (Israel), Monday 26.10 is day 6 until
  // 22:00 UTC and day 7 from then.
  const OCT_SENT = "2026-10-20T12:00:00Z";

  it("Mon 26.10 21:30 UTC (Israel 23:30, still the 26th): day 6, no marker", () => {
    at("2026-10-26T21:30:00Z");
    renderTable([row({ claim_link_sent_at: OCT_SENT })]);
    expect(markers()).toHaveLength(0);
  });

  it("Mon 26.10 22:30 UTC (Israel 00:30 on the 27th): day 7, marker — a UTC date would still say 6", () => {
    at("2026-10-26T22:30:00Z");
    renderTable([row({ claim_link_sent_at: OCT_SENT })]);
    expect(markers()).toHaveLength(1);
    expect(markers()[0]).toHaveTextContent(D.waiting_7_days);
  });

  // March: Israel entered DST on Fri 27.03.2026 → UTC+3, so the day turns at
  // 21:00 UTC. Sent 24.03 (Israel), Monday 30.03 21:30 UTC is already 31.03.
  const MAR_SENT = "2026-03-24T10:00:00Z";

  it("Mon 30.03 20:30 UTC (Israel 23:30, the 30th): day 6, no marker", () => {
    at("2026-03-30T20:30:00Z");
    renderTable([row({ claim_link_sent_at: MAR_SENT })]);
    expect(markers()).toHaveLength(0);
  });

  it("Mon 30.03 21:30 UTC (Israel 00:30 on the 31st): day 7, marker", () => {
    at("2026-03-30T21:30:00Z");
    renderTable([row({ claim_link_sent_at: MAR_SENT })]);
    expect(markers()).toHaveLength(1);
  });

  it("the SENT side is an Israel date too: 21:30 UTC on the 19th is Israel's 20th", () => {
    // Before the 25.10 switch Israel is UTC+3, so 2026-10-19T21:30Z is 00:30
    // on 20.10 in Israel. The row must read «20.10.2026», and the count runs
    // from that Israel date: Monday 26.10 22:30 UTC (Israel's 27th) is day 7.
    at("2026-10-26T22:30:00Z");
    renderTable([row({ claim_link_sent_at: "2026-10-19T21:30:00Z" })]);
    expect(screen.getByTestId("draft-link-sent")).toHaveTextContent(sent("20.10.2026"));
    expect(markers()).toHaveLength(1);
  });
});

describe("after a successful mint the list reloads to show the new stamp", () => {
  it("copy → success → onRetryLoad (the list reload) is called once", async () => {
    vi.useRealTimers();
    api.post.mockResolvedValue({
      data: { url: "https://www.mehamakor.co.il/claim/t.o.k", expires_at: "2026-11-11T10:00:00+00:00" },
    });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    const originalItem = globalThis.ClipboardItem;
    globalThis.ClipboardItem = undefined;
    try {
      const onRetryLoad = vi.fn();
      renderTable([row({ claim_link_sent_at: null })], { onRetryLoad });
      fireEvent.click(screen.getByTestId("draft-copy-claim-message"));
      await waitFor(() => expect(onRetryLoad).toHaveBeenCalledTimes(1));
    } finally {
      globalThis.ClipboardItem = originalItem;
    }
  });
});

describe("copy keys", () => {
  it.each(["link_sent", "link_valid_until", "link_expired", "waiting_7_days"])(
    "draft_claim.%s is a non-empty string in he and en",
    (key) => {
      for (const m of [he, en]) {
        expect(typeof m.admin.producers.table.draft_claim[key]).toBe("string");
        expect(m.admin.producers.table.draft_claim[key].length).toBeGreaterThan(0);
      }
    },
  );

  it("the Hebrew copy is the card's, verbatim", () => {
    expect(D.link_sent).toBe("קישור נשלח ב-{date}");
    expect(D.link_valid_until).toBe("בתוקף עד {date}");
    expect(D.link_expired).toBe("הקישור פג — צרו חדש");
    expect(D.waiting_7_days).toBe("ממתין 7+ ימים");
  });
});
