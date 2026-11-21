// MEH-3641 — «הפרופיל שלכם בגוגל»: every state of the tool, the server mocked.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import he from "@/messages/he.json";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), put: vi.fn() } }));

import api from "@/lib/api";
import GoogleProfileTool from "@/components/dashboard/google-profile/GoogleProfileTool";

const t = he.google_profile;
const ME = { id: "7e57a6f0-0000-4000-8000-000000000007", slug: "ruti", status: "approved", kind: "producer" };

/** @param {Record<string, any>} routes  GET url → data, or an Error to reject */
function serve(routes) {
  vi.mocked(api.get).mockImplementation(async (url) => {
    const hit = routes[url];
    if (hit instanceof Error) throw hit;
    if (hit === undefined) throw new Error(`unexpected GET ${url}`);
    return { data: typeof hit === "function" ? hit() : hit };
  });
}

const refusal = (status, detail) => Object.assign(new Error("refused"), { response: { status, data: { detail } } });

function renderTool() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      <GoogleProfileTool />
    </NextIntlClientProvider>,
  );
}

describe("GoogleProfileTool", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.put).mockReset();
  });

  it("without a Places key says «לא זמין» and still shows the guide", async () => {
    serve({ "/producers/me/google-profile": { available: false, google_place_id: null }, "/producers/me": ME });
    renderTool();
    expect((await screen.findByTestId("google-profile-unavailable")).textContent).toBe(t.unavailable);
    expect(screen.queryByTestId("google-profile-link")).toBeNull();
    expect(screen.getByTestId("google-profile-guide")).toBeTruthy();
    expect(screen.getByTestId("google-profile-review-rule").textContent).toBe(t.review_rule);
    expect(screen.getByTestId("google-profile-open-google").getAttribute("href")).toBe("https://business.google.com/");
  });

  it("not linked: searches by name and city when the box is empty, and says when nothing was found", async () => {
    serve({
      "/producers/me/google-profile": { available: true, google_place_id: null },
      "/producers/me": ME,
      "/producers/me/google-profile/candidates": { candidates: [] },
    });
    renderTool();
    expect((await screen.findByTestId("google-profile-not-linked")).textContent).toBe(t.not_linked);
    expect(screen.queryByTestId("google-profile-check")).toBeNull();
    fireEvent.click(screen.getByTestId("google-profile-search"));
    expect((await screen.findByTestId("google-profile-none")).textContent).toBe(t.none);
    expect(api.get).toHaveBeenCalledWith("/producers/me/google-profile/candidates", { params: undefined });
  });

  it("one candidate and many: each can be picked, and a pick links the page", async () => {
    serve({
      "/producers/me/google-profile": { available: true, google_place_id: null },
      "/producers/me": ME,
      "/producers/me/google-profile/candidates": {
        candidates: [
          { place_id: "p1", display_name: "המאפייה של רותי", formatted_address: "רחובות" },
          { place_id: "p2", display_name: "מאפיית רותי", formatted_address: null },
        ],
      },
    });
    vi.mocked(api.put).mockResolvedValue({ data: { google_place_id: "p2" } });
    renderTool();
    fireEvent.change(await screen.findByTestId("google-profile-query"), { target: { value: "מאפיית רותי" } });
    fireEvent.click(screen.getByTestId("google-profile-search"));
    const list = await screen.findByTestId("google-profile-candidates");
    expect(within(list).getAllByTestId("google-profile-pick")).toHaveLength(2);
    expect(api.get).toHaveBeenCalledWith("/producers/me/google-profile/candidates", { params: { q: "מאפיית רותי" } });
    fireEvent.click(within(list).getAllByTestId("google-profile-pick")[1]);
    expect((await screen.findByTestId("google-profile-linked")).textContent).toBe(t.linked);
    expect(api.put).toHaveBeenCalledWith("/producers/me/google-profile", { google_place_id: "p2" });
    expect(screen.getByTestId("google-profile-check")).toBeTruthy();
  });

  it("shows the server's Hebrew refusal when the profile is not hers, and stays unlinked", async () => {
    serve({
      "/producers/me/google-profile": { available: true, google_place_id: null },
      "/producers/me": ME,
      "/producers/me/google-profile/candidates": { candidates: [{ place_id: "p1", display_name: "קפה אחר" }] },
    });
    vi.mocked(api.put).mockRejectedValue(refusal(409, "השם והטלפון בפרופיל הזה בגוגל שונים מאלה של בית העסק."));
    renderTool();
    fireEvent.click(await screen.findByTestId("google-profile-search"));
    fireEvent.click(await screen.findByTestId("google-profile-pick"));
    expect((await screen.findByTestId("google-profile-error")).textContent).toBe("השם והטלפון בפרופיל הזה בגוגל שונים מאלה של בית העסק.");
    expect(screen.queryByTestId("google-profile-linked")).toBeNull();
  });

  it("linked: the check is not run until asked, then shows a verdict per row and the hours side by side", async () => {
    serve({
      "/producers/me/google-profile": { available: true, google_place_id: "p1" },
      "/producers/me": ME,
      "/producers/me/google-profile/check": {
        rows: [
          { field: "name", ours: "המאפייה של רותי", google: "המאפייה של רותי", verdict: "same" },
          { field: "phone", ours: "0501234567", google: "052-000-0000", verdict: "different" },
          { field: "website", ours: null, google: null, verdict: "missing" },
        ],
        hours_ours: "א׳–ה׳ 08:00–14:00",
        hours_google: ["יום ראשון: 08:00–14:00"],
      },
    });
    renderTool();
    await screen.findByTestId("google-profile-linked");
    expect(screen.queryByTestId("google-profile-check-result")).toBeNull();
    fireEvent.click(screen.getByTestId("google-profile-run-check"));
    await screen.findByTestId("google-profile-check-result");
    const verdict = (field) => within(screen.getByTestId(`google-profile-row-${field}`)).getByTestId("verdict").textContent;
    expect([verdict("name"), verdict("phone"), verdict("website")]).toEqual([t.verdict_same, t.verdict_different, t.verdict_missing]);
    expect(screen.getByTestId("google-profile-fix-hint").textContent).toBe(t.fix_hint);
    expect(screen.getByTestId("google-profile-hours").textContent).toContain("יום ראשון: 08:00–14:00");
    expect(screen.getByTestId("google-profile-run-check").textContent).toBe(t.run_again);
  });

  it("all the same: no fix hint", async () => {
    serve({
      "/producers/me/google-profile": { available: true, google_place_id: "p1" },
      "/producers/me": ME,
      "/producers/me/google-profile/check": {
        rows: ["name", "phone", "website"].map((field) => ({ field, ours: "x", google: "x", verdict: "same" })),
        hours_ours: null,
        hours_google: [],
      },
    });
    renderTool();
    fireEvent.click(await screen.findByTestId("google-profile-run-check"));
    await screen.findByTestId("google-profile-check-result");
    expect(screen.queryByTestId("google-profile-fix-hint")).toBeNull();
  });

  it("a failed check says so", async () => {
    serve({
      "/producers/me/google-profile": { available: true, google_place_id: "p1" },
      "/producers/me": ME,
      "/producers/me/google-profile/check": refusal(503, "החיבור לגוגל לא זמין כרגע. נסו שוב מאוחר יותר."),
    });
    renderTool();
    fireEvent.click(await screen.findByTestId("google-profile-run-check"));
    expect((await screen.findByTestId("google-profile-check-error")).textContent).toBe("החיבור לגוגל לא זמין כרגע. נסו שוב מאוחר יותר.");
  });

  it("unlinking returns to the search", async () => {
    serve({ "/producers/me/google-profile": { available: true, google_place_id: "p1" }, "/producers/me": ME });
    vi.mocked(api.put).mockResolvedValue({ data: { google_place_id: null } });
    renderTool();
    fireEvent.click(await screen.findByTestId("google-profile-unlink"));
    await screen.findByTestId("google-profile-not-linked");
    expect(api.put).toHaveBeenCalledWith("/producers/me/google-profile", { google_place_id: null });
    expect(screen.queryByTestId("google-profile-check")).toBeNull();
  });

  it("the page link is offered only once the business is approved", async () => {
    serve({ "/producers/me/google-profile": { available: false, google_place_id: null }, "/producers/me": { ...ME, status: "pending" } });
    renderTool();
    await screen.findByTestId("google-profile-guide");
    await waitFor(() => expect(screen.getByText(t.link_after_approval)).toBeTruthy());
    expect(screen.queryByTestId("google-profile-copy-link")).toBeNull();
  });

  it("an approved business can copy its page link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    serve({ "/producers/me/google-profile": { available: false, google_place_id: null }, "/producers/me": ME });
    renderTool();
    fireEvent.click(await screen.findByTestId("google-profile-copy-link"));
    await screen.findByText(t.copied);
    expect(writeText.mock.calls[0][0]).toMatch(/\/ruti$/);
  });

  it("when her profile cannot be read, the guide makes no claim about the link", async () => {
    serve({ "/producers/me/google-profile": { available: false, google_place_id: null }, "/producers/me": new Error("down") });
    renderTool();
    await screen.findByTestId("google-profile-unavailable");
    expect(screen.queryByText(t.link_after_approval)).toBeNull();
    expect(screen.queryByTestId("google-profile-copy-link")).toBeNull();
  });

  it("a failed load offers a retry and keeps the guide", async () => {
    serve({ "/producers/me/google-profile": new Error("down"), "/producers/me": ME });
    renderTool();
    expect(await screen.findByTestId("google-profile-load-error")).toBeTruthy();
    expect(screen.getByTestId("google-profile-guide")).toBeTruthy();
  });
});
