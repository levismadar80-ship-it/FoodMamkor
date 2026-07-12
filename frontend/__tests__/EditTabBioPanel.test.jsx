/**
 * MEH-1157 — BioPanelCard error-mapping isolation tests.
 * MEH-1163 — always-visible manual textarea (AI as assist, not gatekeeper).
 *
 * Renders the CARD directly (not ProducerDashboardEditPage — the full-page
 * mount hangs the vitest runner) under the REAL NextIntlClientProvider +
 * he.json, mirroring the EditTabCategoriesCard harness. Covers the four
 * generate() outcomes: 401 (session expired), 429 (bio limiter 5/hour),
 * 200 {"bio": ""} (backend fail-open, MEH-56), and a plain network error
 * (generic copy) — plus the MEH-1163 flow: textarea rendered with no bio,
 * prefilled from profile.description, AI result landing in it, and a
 * manual-only save with no AI involvement.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { BioPanelCard } from "@/app/[locale]/producer/dashboard/edit/cards";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const B = he.dashboard.producer.bio;

function renderCard(props = {}) {
  const onSave = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <BioPanelCard
        profile={{ instagram: "@mehamakor" }}
        onSave={onSave}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onSave, ...utils };
}

const clickGenerate = () =>
  fireEvent.click(screen.getByRole("button", { name: B.generate_cta }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Edit-tab BioPanelCard error mapping (MEH-1157)", () => {
  it("401 → session-expired copy (not the generic input-blaming error)", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 401 } });
    renderCard();
    clickGenerate();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(B.error_session_expired);
  });

  it("429 (limiter 5/hour) → rate-limit copy", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 429 } });
    renderCard();
    clickGenerate();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(B.error_rate_limit);
  });

  it('200 with {"bio": ""} (fail-open) → service-unavailable copy', async () => {
    api.post.mockResolvedValueOnce({ data: { bio: "" } });
    renderCard();
    clickGenerate();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(B.error_unavailable);
  });

  it("network / other error → existing generic copy", async () => {
    api.post.mockRejectedValueOnce(new Error("network"));
    renderCard();
    clickGenerate();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(B.error_generate);
  });

  it("successful generate shows the editable bio, no error", async () => {
    api.post.mockResolvedValueOnce({ data: { bio: "ביו שנוצר" } });
    renderCard();
    clickGenerate();
    expect(await screen.findByDisplayValue("ביו שנוצר")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Edit-tab BioPanelCard always-visible textarea (MEH-1163)", () => {
  it("bio textarea + counter render with no saved bio and no AI call", () => {
    renderCard();
    expect(screen.getByPlaceholderText(B.bio_placeholder)).toBeInTheDocument();
    expect(screen.getByText("0/150")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("textarea is prefilled with the saved bio from the profile", () => {
    renderCard({ profile: { instagram: "@x", description: "ביו שמור קיים" } });
    expect(screen.getByDisplayValue("ביו שמור קיים")).toBeInTheDocument();
  });

  it("AI generate replaces the prefilled bio in the textarea", async () => {
    api.post.mockResolvedValueOnce({ data: { bio: "ביו חדש מה-AI" } });
    renderCard({ profile: { instagram: "@x", description: "ביו ישן" } });
    clickGenerate();
    expect(await screen.findByDisplayValue("ביו חדש מה-AI")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("ביו ישן")).not.toBeInTheDocument();
  });

  it("fail-open empty AI result keeps the owner's existing text intact", async () => {
    api.post.mockResolvedValueOnce({ data: { bio: "" } });
    renderCard({ profile: { instagram: "@x", description: "טקסט שלא נמחק" } });
    clickGenerate();
    await screen.findByRole("alert");
    expect(screen.getByDisplayValue("טקסט שלא נמחק")).toBeInTheDocument();
  });

  it("manual-only save works — typed text persists via PUT with no AI call", async () => {
    api.put.mockResolvedValueOnce({});
    const { onSave } = renderCard();
    fireEvent.change(screen.getByPlaceholderText(B.bio_placeholder), {
      target: { value: "ביו ידני לגמרי" },
    });
    fireEvent.click(screen.getByRole("button", { name: B.save_cta }));
    await screen.findByRole("button", { name: B.saved });
    expect(api.put).toHaveBeenCalledWith("/producers/me", {
      description: "ביו ידני לגמרי",
    });
    expect(onSave).toHaveBeenCalledWith("ביו ידני לגמרי");
    expect(api.post).not.toHaveBeenCalled();
  });
});
